-- Passwords and tokens are never recorded in this journal.
alter table private.aitask_member_onboarding add column state text not null default 'pending'
  check (state in ('pending','cancelling','cancelled','completed'));
alter table private.aitask_member_onboarding add column cancelled_at timestamptz;
update private.aitask_member_onboarding set state='completed' where result is not null;

-- Lock the intent in the Auth creation transaction. A cancellation that wins
-- this lock fences every late admin create/invite, including a lost HTTP reply.
create or replace function private.aitask_stamp_onboarding_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_operation private.aitask_member_onboarding%rowtype; v_command text;
begin
  v_command := new.raw_app_meta_data->>'aitask_onboarding_command';
  if v_command is null and new.invited_at is not null and (tg_op='INSERT' or old.invited_at is null) then
    v_command := new.raw_user_meta_data->>'aitask_onboarding_command';
  end if;
  if coalesce(v_command,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return new; end if;
  select * into v_operation from private.aitask_member_onboarding where command_id=v_command::uuid for update;
  if not found or lower(v_operation.payload->>'email')<>lower(new.email) then return new; end if;
  if new.invited_at is null and (
    new.raw_app_meta_data->>'aitask_onboarding_actor' is distinct from v_operation.actor_member_id or
    new.raw_app_meta_data->>'aitask_onboarding_workspace' is distinct from v_operation.workspace_id
  ) then return new; end if;
  if v_operation.state<>'pending' then
    if v_operation.state='completed' and v_operation.auth_user_id=new.id then return new; end if;
    raise exception 'Onboarding request is cancelled or cancelling';
  end if;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb) || jsonb_build_object(
    'aitask_onboarding_command',v_operation.command_id::text,'aitask_onboarding_actor',v_operation.actor_member_id,
    'aitask_onboarding_workspace',v_operation.workspace_id);
  return new;
end; $$;
drop trigger aitask_stamp_onboarding_auth on auth.users;
create trigger aitask_stamp_onboarding_auth before insert or update of invited_at,raw_app_meta_data on auth.users
  for each row execute function private.aitask_stamp_onboarding_auth();

create function private.aitask_track_onboarding_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.aitask_member_onboarding set auth_user_id=new.id
  where command_id::text=new.raw_app_meta_data->>'aitask_onboarding_command' and state='pending'
    and actor_member_id=new.raw_app_meta_data->>'aitask_onboarding_actor'
    and workspace_id=new.raw_app_meta_data->>'aitask_onboarding_workspace'
    and lower(payload->>'email')=lower(new.email) and (auth_user_id is null or auth_user_id=new.id);
  return new;
end; $$;
revoke all on function private.aitask_track_onboarding_auth() from public,anon,authenticated,service_role;
create trigger aitask_track_onboarding_auth after insert or update of invited_at,raw_app_meta_data on auth.users
  for each row execute function private.aitask_track_onboarding_auth();

create or replace function public.aitask_reserve_member_onboarding(
  p_actor_member_id text, p_command_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.aitask_members%rowtype;
  v_operation private.aitask_member_onboarding%rowtype;
begin
  select * into v_actor from public.aitask_members
    where id=p_actor_member_id and is_super_admin and auth_user_id is not null;
  if not found then raise exception 'Super Admin permission required'; end if;
  if p_command_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid onboarding command'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in
    ('name','email','role','departments','companyName','customRoleId','customRoleName','memberId','registrationId','workerType','sendInvitation'))
    or coalesce(p_payload->>'name','')='' or coalesce(p_payload->>'email','')=''
    or coalesce(p_payload->>'role','') not in ('Project Manager','HOD','Staff','Client')
    or coalesce(p_payload->>'workerType','') not in ('employee','supplier','freelancer') then
    raise exception 'Invalid onboarding payload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('onboarding:'||v_actor.workspace_id||':'||lower(p_payload->>'email'),0));
  select * into v_operation from private.aitask_member_onboarding where command_id=p_command_id for update;
  if found then
    if v_operation.actor_member_id<>v_actor.id or v_operation.workspace_id<>v_actor.workspace_id or v_operation.payload<>p_payload then
      raise exception 'Onboarding command belongs to another request';
    end if;
    if v_operation.state in ('cancelling','cancelled') then raise exception 'Cancel this request before starting a replacement'; end if;
    if v_operation.result is not null and not exists(select 1 from public.aitask_members where id=v_operation.result->'member'->>'id'
      and auth_user_id=v_operation.auth_user_id and workspace_id=v_actor.workspace_id) then
      raise exception 'The completed member no longer exists. Start a new invitation';
    end if;
    return jsonb_build_object('ok',true,'result',v_operation.result,'authUserId',v_operation.auth_user_id);
  end if;
  perform 1 from private.aitask_member_onboarding
    where workspace_id=v_actor.workspace_id and lower(payload->>'email')=lower(p_payload->>'email') and state in ('pending','cancelling') limit 1;
  if found then raise exception 'Another onboarding request for this email is pending. Retry the original request'; end if;
  if nullif(p_payload->>'registrationId','') is not null and not exists(select 1 from public.aitask_entities
    where workspace_id=v_actor.workspace_id and entity_type='registration' and entity_id=p_payload->>'registrationId'
    and data->>'status'='Pending' and data->>'requestedRole'='Staff' and lower(data->>'email')=lower(p_payload->>'email')) then
    raise exception 'Pending Staff registration not found';
  end if;
  insert into private.aitask_member_onboarding(command_id,workspace_id,actor_member_id,payload)
    values(p_command_id,v_actor.workspace_id,v_actor.id,p_payload);
  return jsonb_build_object('ok',true,'result',null,'authUserId',null);
end; $$;
revoke all on function public.aitask_reserve_member_onboarding(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aitask_reserve_member_onboarding(text,uuid,jsonb) to service_role;


create or replace function public.aitask_finalize_member_invitation_v3(
  p_actor_member_id text, p_command_id uuid, p_auth_user_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_operation private.aitask_member_onboarding%rowtype;
  v_auth auth.users%rowtype;
  v_result jsonb;
  v_worker_type text;
begin
  perform public.aitask_reserve_member_onboarding(p_actor_member_id,p_command_id,p_payload);
  select * into v_operation from private.aitask_member_onboarding where command_id=p_command_id for update;
  if v_operation.result is not null then return v_operation.result; end if;
  select * into v_auth from auth.users where id=p_auth_user_id;
  if not found or lower(v_auth.email)<>lower(p_payload->>'email') then raise exception 'Auth account does not match onboarding'; end if;
  if nullif(p_payload->>'registrationId','') is null and
    (coalesce(v_auth.raw_app_meta_data->>'aitask_onboarding_command','')<>p_command_id::text
      or coalesce(v_auth.raw_app_meta_data->>'aitask_onboarding_actor','')<>p_actor_member_id
      or coalesce(v_auth.raw_app_meta_data->>'aitask_onboarding_workspace','')<>v_operation.workspace_id) then
    raise exception 'An unrelated Auth account cannot be adopted';
  end if;
  v_result := public.aitask_finalize_member_invitation_v2(
    p_actor_member_id,p_auth_user_id,p_payload->>'name',p_payload->>'email',p_payload->>'role',
    array(select jsonb_array_elements_text(p_payload->'departments')),nullif(p_payload->>'companyName',''),
    nullif(p_payload->>'customRoleId',''),nullif(p_payload->>'customRoleName',''),
    nullif(p_payload->>'memberId',''),nullif(p_payload->>'registrationId','')
  );
  v_worker_type := case when p_payload->>'role' in ('Staff','HOD') then p_payload->>'workerType' else 'employee' end;
  update public.aitask_members set worker_type=v_worker_type where id=v_result->'member'->>'id'
    and workspace_id=v_operation.workspace_id and auth_user_id=p_auth_user_id;
  select jsonb_set(v_result,'{member}',to_jsonb(member)) into v_result from public.aitask_members member
    where member.id=v_result->'member'->>'id';
  update private.aitask_member_onboarding set auth_user_id=p_auth_user_id,result=v_result,state='completed',completed_at=now()
    where command_id=p_command_id;
  return v_result;
end; $$;
revoke all on function public.aitask_finalize_member_invitation_v3(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aitask_finalize_member_invitation_v3(text,uuid,uuid,jsonb) to service_role;


create function public.aitask_list_member_onboarding(p_actor_member_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor public.aitask_members%rowtype; v_operations jsonb;
begin
  select * into v_actor from public.aitask_members where id=p_actor_member_id and is_super_admin and auth_user_id is not null;
  if not found then raise exception 'Super Admin permission required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('commandId',command_id,'state',state,'payload',payload,
    'createdAt',created_at,'prepared',auth_user_id is not null) order by created_at),'[]'::jsonb) into v_operations
    from private.aitask_member_onboarding where actor_member_id=v_actor.id and workspace_id=v_actor.workspace_id
    and state in ('pending','cancelling');
  return jsonb_build_object('ok',true,'operations',v_operations);
end; $$;
revoke all on function public.aitask_list_member_onboarding(text) from public,anon,authenticated;
grant execute on function public.aitask_list_member_onboarding(text) to service_role;

create function public.aitask_cancel_member_onboarding(p_actor_member_id text,p_command_id uuid,p_finish boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor public.aitask_members%rowtype; v_operation private.aitask_member_onboarding%rowtype; v_auth_id uuid;
begin
  select * into v_actor from public.aitask_members where id=p_actor_member_id and is_super_admin and auth_user_id is not null;
  if not found then raise exception 'Super Admin permission required'; end if;
  select * into v_operation from private.aitask_member_onboarding where command_id=p_command_id for update;
  if not found or v_operation.actor_member_id<>v_actor.id or v_operation.workspace_id<>v_actor.workspace_id then
    raise exception 'Onboarding request not found for this account'; end if;
  if v_operation.state='completed' or v_operation.result is not null then
    return jsonb_build_object('ok',true,'state','completed','result',v_operation.result); end if;
  if v_operation.state='cancelled' then return jsonb_build_object('ok',true,'state','cancelled'); end if;
  select id into v_auth_id from auth.users where
    raw_app_meta_data->>'aitask_onboarding_command'=p_command_id::text
    and raw_app_meta_data->>'aitask_onboarding_actor'=v_actor.id
    and raw_app_meta_data->>'aitask_onboarding_workspace'=v_actor.workspace_id;
  -- Even a legacy/inconsistent linked membership must never lose its login.
  if exists(select 1 from public.aitask_members where auth_user_id=coalesce(v_auth_id,v_operation.auth_user_id)) then
    raise exception 'Prepared account has a linked member; review it before cancellation'; end if;
  if p_finish then
    if v_operation.state<>'cancelling' or v_auth_id is not null then raise exception 'Cancellation cleanup is not confirmed'; end if;
    update private.aitask_member_onboarding set state='cancelled',cancelled_at=now() where command_id=p_command_id;
    return jsonb_build_object('ok',true,'state','cancelled');
  end if;
  update private.aitask_member_onboarding set state='cancelling' where command_id=p_command_id;
  return jsonb_build_object('ok',true,'state','cancelling','authUserId',v_auth_id);
end; $$;
revoke all on function public.aitask_cancel_member_onboarding(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.aitask_cancel_member_onboarding(text,uuid,boolean) to service_role;

create or replace function public.aitask_update_member_email(
  p_actor_member_id text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_command_id uuid := gen_random_uuid();
  v_workspace_version bigint;
begin
  select member.* into v_actor
  from public.aitask_members member
  where member.id = p_actor_member_id
  for update;
  if not found or v_actor.auth_user_id is null then raise exception 'Linked member not found'; end if;
  if v_email = '' or length(v_email) > 320 then raise exception 'Valid email required'; end if;
  if not exists(select 1 from auth.users where id=v_actor.auth_user_id and lower(btrim(email))=v_email) then
    raise exception 'Member email must match canonical Auth email'; end if;
  if lower(coalesce(v_actor.email,''))=v_email then
    return jsonb_build_object('ok',true,'unchanged',true,'workspaceVersion',(select version from public.aitask_workspaces where id=v_actor.workspace_id)); end if;
  perform pg_advisory_xact_lock(hashtextextended('member-email:'||v_actor.workspace_id||':'||v_email,0));
  if exists (
    select 1 from public.aitask_members member
    where member.workspace_id = v_actor.workspace_id
      and member.id <> v_actor.id
      and lower(coalesce(member.email, '')) = v_email
  ) then raise exception 'Email already belongs to another member'; end if;

  update public.aitask_members
  set email = v_email
  where workspace_id = v_actor.workspace_id and id = v_actor.id;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
  ) values (v_actor.workspace_id, v_actor.id, v_command_id, 'account.email.update', 'member', v_actor.id, array['email']);

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = v_actor.workspace_id
  returning version into v_workspace_version;

  return jsonb_build_object('ok', true, 'workspaceVersion', v_workspace_version);
end;
$$;

revoke all on function public.aitask_update_member_email(text, text) from public, anon, authenticated;
grant execute on function public.aitask_update_member_email(text, text) to service_role;


create function private.aitask_sync_auth_member_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_member_id text;
begin
  select id into v_member_id from public.aitask_members where auth_user_id=new.id;
  if v_member_id is not null then perform public.aitask_update_member_email(v_member_id,new.email); end if;
  return new;
end; $$;
revoke all on function private.aitask_sync_auth_member_email() from public,anon,authenticated,service_role;
create trigger aitask_sync_auth_member_email after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.aitask_sync_auth_member_email();

create or replace function public.aitask_get_backend_capabilities(
  p_workspace_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text;
  v_workspace_optimistic_lock boolean;
  v_service_operations boolean;
  v_release_notice_acknowledgements boolean;
  v_member_permission_management boolean;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication is required.');
  end if;

  v_member_id := private.aitask_member_id(p_workspace_id);
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership is required.');
  end if;

  v_workspace_optimistic_lock :=
    pg_catalog.to_regprocedure('public.aitask_execute_command(text,uuid,text,jsonb)') is not null
    and pg_catalog.to_regprocedure('public.aitask_execute_command(text,uuid,text,jsonb,bigint)') is not null;
  v_service_operations :=
    pg_catalog.to_regprocedure('public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)') is not null
    and pg_catalog.to_regprocedure('public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)') is not null;
  v_release_notice_acknowledgements :=
    pg_catalog.to_regclass('public.aitask_release_notice_acknowledgements') is not null;
  v_member_permission_management :=
    pg_catalog.to_regprocedure('public.aitask_update_member_permissions(text,uuid,text,jsonb,bigint)') is not null;

  return jsonb_build_object(
    'ok', v_workspace_optimistic_lock and v_service_operations
      and v_release_notice_acknowledgements and v_member_permission_management,
    'schemaVersion', 4,
    'workspaceOptimisticLock', v_workspace_optimistic_lock,
    'serviceOperations', v_service_operations,
    'releaseNoticeAcknowledgements', v_release_notice_acknowledgements,
    'memberPermissionManagement', v_member_permission_management,
    'emailSynchronization', exists(select 1 from pg_catalog.pg_trigger where tgname='aitask_sync_auth_member_email' and tgenabled<>'D'),
    'onboardingRecovery', pg_catalog.to_regprocedure('public.aitask_cancel_member_onboarding(text,uuid,boolean)') is not null
  );
end;
$$;

revoke all on function public.aitask_get_backend_capabilities(text) from public, anon;
grant execute on function public.aitask_get_backend_capabilities(text) to authenticated, service_role;
