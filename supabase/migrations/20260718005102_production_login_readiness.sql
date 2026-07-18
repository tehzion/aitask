create or replace function private.aitask_create_staff_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text;
  v_registration_id text;
  v_now timestamptz := now();
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 100);
  v_phone text := left(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 40);
  v_job_position text := left(btrim(coalesce(new.raw_user_meta_data ->> 'job_position', '')), 80);
begin
  if coalesce(new.raw_user_meta_data ->> 'aitask_registration_source', '') <> 'staff_signup' then
    return new;
  end if;

  if v_email = '' or v_name = '' or v_phone = '' or v_job_position = '' then
    return new;
  end if;

  select workspace.id
  into v_workspace_id
  from public.aitask_workspaces workspace
  order by workspace.created_at
  limit 1;

  if v_workspace_id is null then return new; end if;

  if exists (
    select 1
    from public.aitask_members member
    where member.workspace_id = v_workspace_id
      and (member.auth_user_id = new.id or lower(coalesce(member.email, '')) = v_email)
  ) then
    return new;
  end if;

  if exists (
    select 1
    from public.aitask_entities entity
    where entity.workspace_id = v_workspace_id
      and entity.entity_type = 'registration'
      and lower(coalesce(entity.data ->> 'email', '')) = v_email
      and entity.data ->> 'status' = 'Pending'
  ) then
    return new;
  end if;

  v_registration_id := 'R-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);

  insert into public.aitask_entities (
    workspace_id, entity_type, entity_id, data, created_at, updated_at, version
  ) values (
    v_workspace_id,
    'registration',
    v_registration_id,
    jsonb_build_object(
      'id', v_registration_id,
      'name', v_name,
      'email', v_email,
      'phone', v_phone,
      'jobPosition', v_job_position,
      'requestedRole', 'Staff',
      'status', 'Pending',
      'onboardingMode', 'self_signup',
      'createdAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    v_now,
    v_now,
    1
  );

  update public.aitask_workspaces
  set version = version + 1, updated_at = v_now
  where id = v_workspace_id;

  return new;
end;
$$;

revoke all on function private.aitask_create_staff_registration() from public, anon, authenticated;
grant execute on function private.aitask_create_staff_registration() to supabase_auth_admin;

create temporary table aitask_legacy_registration_repair on commit drop as
select
  entity.workspace_id,
  entity.entity_id as registration_id,
  btrim(entity.data ->> 'name') as member_name,
  lower(btrim(entity.data ->> 'email')) as member_email,
  entity.data ->> 'status' as previous_status
from public.aitask_entities entity
where entity.entity_type = 'registration'
  and entity.data ->> 'requestedRole' = 'Staff'
  and entity.data ->> 'status' in ('Pending', 'Approved')
  and coalesce(entity.data ->> 'onboardingMode', '') = ''
  and btrim(coalesce(entity.data ->> 'name', '')) <> ''
  and btrim(coalesce(entity.data ->> 'email', '')) <> ''
  and not exists (
    select 1 from auth.users auth_user
    where lower(coalesce(auth_user.email, '')) = lower(btrim(entity.data ->> 'email'))
  );

update public.aitask_members member
set email = repair.member_email,
    updated_at = now()
from aitask_legacy_registration_repair repair
where repair.previous_status = 'Approved'
  and member.workspace_id = repair.workspace_id
  and member.auth_user_id is null
  and lower(btrim(member.name)) = lower(repair.member_name)
  and not exists (
    select 1
    from public.aitask_members duplicate
    where duplicate.workspace_id = member.workspace_id
      and duplicate.id <> member.id
      and lower(coalesce(duplicate.email, '')) = repair.member_email
  )
  and 1 = (
    select count(*)
    from public.aitask_members candidate
    where candidate.workspace_id = repair.workspace_id
      and candidate.auth_user_id is null
      and lower(btrim(candidate.name)) = lower(repair.member_name)
  );

update public.aitask_entities entity
set data = entity.data || jsonb_build_object(
      'status', 'Pending',
      'onboardingMode', 'legacy_invite',
      'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    updated_at = now()
from aitask_legacy_registration_repair repair
where entity.workspace_id = repair.workspace_id
  and entity.entity_type = 'registration'
  and entity.entity_id = repair.registration_id;

insert into public.aitask_audit_events (
  workspace_id, actor_member_id, command_id, action, entity_type, entity_id,
  changed_fields, metadata, occurred_at
)
select
  repair.workspace_id,
  null,
  gen_random_uuid(),
  'registration.repair',
  'registration',
  repair.registration_id,
  array['status', 'onboardingMode'],
  jsonb_build_object('source', 'production_login_readiness'),
  now()
from aitask_legacy_registration_repair repair;

update public.aitask_workspaces workspace
set version = workspace.version + 1,
    updated_at = now()
where exists (
  select 1
  from aitask_legacy_registration_repair repair
  where repair.workspace_id = workspace.id
);

create or replace function public.aitask_finalize_member_invitation(
  p_actor_member_id text,
  p_auth_user_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_department text,
  p_client_name text,
  p_custom_role_id text,
  p_custom_role_name text,
  p_member_id text default null,
  p_registration_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_member public.aitask_members%rowtype;
  v_registration public.aitask_entities%rowtype;
  v_member_id text;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := p_role;
  v_department text := left(btrim(coalesce(p_department, '')), 80);
  v_now timestamptz := now();
  v_workspace_version bigint;
  v_command_id uuid := gen_random_uuid();
  v_require_password_setup boolean := p_registration_id is null;
begin
  select member.* into v_actor
  from public.aitask_members member
  where member.id = p_actor_member_id
    and member.is_super_admin = true
    and member.auth_user_id is not null;

  if not found then raise exception 'Super Admin permission required'; end if;
  if p_auth_user_id is null or v_name = '' or v_email = '' then
    raise exception 'A verified Auth user, name, and email are required';
  end if;

  if p_registration_id is not null then
    select entity.* into v_registration
    from public.aitask_entities entity
    where entity.workspace_id = v_actor.workspace_id
      and entity.entity_type = 'registration'
      and entity.entity_id = p_registration_id
    for update;

    if not found or v_registration.data ->> 'status' <> 'Pending' then
      raise exception 'Pending Staff registration not found';
    end if;
    if v_registration.data ->> 'requestedRole' <> 'Staff' then
      raise exception 'Only Staff registrations can be approved';
    end if;
    if lower(coalesce(v_registration.data ->> 'email', '')) <> v_email then
      raise exception 'Registration email does not match the Auth user';
    end if;
    v_role := 'Staff';
    v_require_password_setup := coalesce(v_registration.data ->> 'onboardingMode', 'self_signup') = 'legacy_invite';
  end if;

  if v_role not in ('Admin', 'Staff', 'Client') then raise exception 'Invalid member role'; end if;
  if v_role = 'Client' and nullif(btrim(coalesce(p_client_name, '')), '') is null then
    raise exception 'Client company is required';
  end if;
  if p_custom_role_id is not null and not exists (
    select 1 from public.aitask_entities entity
    where entity.workspace_id = v_actor.workspace_id
      and entity.entity_type = 'custom_role'
      and entity.entity_id = p_custom_role_id
  ) then
    raise exception 'Custom role not found';
  end if;
  if exists (
    select 1 from public.aitask_members member
    where member.auth_user_id = p_auth_user_id
      and member.id <> coalesce(p_member_id, '')
  ) then
    raise exception 'Auth user is already linked to another member';
  end if;

  if p_member_id is not null then
    select member.* into v_member
    from public.aitask_members member
    where member.workspace_id = v_actor.workspace_id and member.id = p_member_id
    for update;
    if not found then raise exception 'Member record not found'; end if;
  else
    select member.* into v_member
    from public.aitask_members member
    where member.workspace_id = v_actor.workspace_id
      and (member.auth_user_id = p_auth_user_id or lower(coalesce(member.email, '')) = v_email)
    order by case when member.auth_user_id = p_auth_user_id then 0 else 1 end
    limit 1
    for update;
  end if;

  if v_member.id is null then
    if exists (
      select 1 from public.aitask_members member
      where member.workspace_id = v_actor.workspace_id and lower(member.name) = lower(v_name)
    ) then
      raise exception 'A member with this name already exists';
    end if;
    v_member_id := gen_random_uuid()::text;
    insert into public.aitask_members (
      id, workspace_id, auth_user_id, name, email, role, department, client_name,
      is_super_admin, must_reset_password, custom_role_id, custom_role_name,
      permissions, updated_at, version
    ) values (
      v_member_id, v_actor.workspace_id, p_auth_user_id, v_name, v_email, v_role,
      case when v_role = 'Client' then 'Client' else v_department end,
      nullif(btrim(coalesce(p_client_name, '')), ''), false, v_require_password_setup,
      p_custom_role_id, p_custom_role_name, '{}'::jsonb, v_now, 1
    ) returning * into v_member;
  else
    update public.aitask_members
    set auth_user_id = p_auth_user_id,
        name = v_name,
        email = v_email,
        role = v_role,
        department = case when v_role = 'Client' then 'Client' else v_department end,
        client_name = nullif(btrim(coalesce(p_client_name, '')), ''),
        must_reset_password = v_require_password_setup,
        custom_role_id = p_custom_role_id,
        custom_role_name = p_custom_role_name,
        updated_at = v_now,
        version = version + 1
    where id = v_member.id
    returning * into v_member;
  end if;

  if p_registration_id is not null then
    update public.aitask_entities
    set data = data || jsonb_build_object(
          'status', 'Approved',
          'updatedAt', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
        updated_at = v_now,
        version = version + 1
    where workspace_id = v_actor.workspace_id
      and entity_type = 'registration'
      and entity_id = p_registration_id;
  end if;

  update public.aitask_workspaces
  set version = version + 1, updated_at = v_now
  where id = v_actor.workspace_id
  returning version into v_workspace_version;

  insert into public.aitask_audit_events (
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id,
    changed_fields, metadata, occurred_at
  ) values (
    v_actor.workspace_id, v_actor.id, v_command_id, 'member.invite', 'member', v_member.id,
    array['auth_user_id', 'role', 'department', 'must_reset_password'],
    jsonb_build_object('source', case when p_registration_id is null then 'direct_invite' else 'staff_registration' end),
    v_now
  );

  return jsonb_build_object('member', to_jsonb(v_member), 'workspaceVersion', v_workspace_version);
end;
$$;

revoke all on function public.aitask_finalize_member_invitation(
  text, uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.aitask_finalize_member_invitation(
  text, uuid, text, text, text, text, text, text, text, text, text
) to service_role;
