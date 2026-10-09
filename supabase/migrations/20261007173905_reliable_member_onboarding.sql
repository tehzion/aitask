-- Durable onboarding intent. No password or bearer token is stored here.
create table private.aitask_member_onboarding (
  command_id uuid primary key,
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  actor_member_id text not null references public.aitask_members(id) on delete cascade,
  payload jsonb not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index aitask_member_onboarding_workspace_email_idx
  on private.aitask_member_onboarding(workspace_id, lower(payload->>'email'));
create index aitask_member_onboarding_actor_idx
  on private.aitask_member_onboarding(actor_member_id);
create index aitask_member_onboarding_auth_idx
  on private.aitask_member_onboarding(auth_user_id);
alter table private.aitask_member_onboarding enable row level security;
revoke all on private.aitask_member_onboarding from public, anon, authenticated, service_role;

-- Email invitations do not accept app_metadata at creation. Stamp it inside the
-- Auth invitation transaction only when its server-owned invited_at field
-- is set. GoTrue writes that field after inserting the account.
create or replace function private.aitask_stamp_onboarding_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_operation private.aitask_member_onboarding%rowtype;
begin
  if coalesce(new.raw_user_meta_data->>'aitask_onboarding_command','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return new; end if;
  select * into v_operation from private.aitask_member_onboarding
    where command_id=(new.raw_user_meta_data->>'aitask_onboarding_command')::uuid
    and result is null and lower(payload->>'email')=lower(new.email) for update;
  if not found then return new; end if;
  -- Only an admin invitation (role authenticated, confirmed or invited) may be
  -- stamped. Public signup must not be allowed to claim another person's intent.
  if new.invited_at is null then return new; end if;
  new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb) || jsonb_build_object(
    'aitask_onboarding_command',v_operation.command_id::text,'aitask_onboarding_actor',v_operation.actor_member_id,
    'aitask_onboarding_workspace',v_operation.workspace_id);
  return new;
end; $$;
revoke all on function private.aitask_stamp_onboarding_auth() from public,anon,authenticated,service_role;
create trigger aitask_stamp_onboarding_auth before insert or update of invited_at on auth.users
  for each row execute function private.aitask_stamp_onboarding_auth();

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
    if v_operation.result is not null and not exists(select 1 from public.aitask_members where id=v_operation.result->'member'->>'id'
      and auth_user_id=v_operation.auth_user_id and workspace_id=v_actor.workspace_id) then
      raise exception 'The completed member no longer exists. Start a new invitation';
    end if;
    return jsonb_build_object('ok',true,'result',v_operation.result,'authUserId',v_operation.auth_user_id);
  end if;
  perform 1 from private.aitask_member_onboarding
    where workspace_id=v_actor.workspace_id and lower(payload->>'email')=lower(p_payload->>'email') and result is null limit 1;
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
  update private.aitask_member_onboarding set auth_user_id=p_auth_user_id,result=v_result,completed_at=now()
    where command_id=p_command_id;
  return v_result;
end; $$;
revoke all on function public.aitask_finalize_member_invitation_v3(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aitask_finalize_member_invitation_v3(text,uuid,uuid,jsonb) to service_role;
