-- AiTask v1.6.12: equal multi-department membership for internal members.
-- The legacy singular department column remains as a compatibility mirror.

create or replace function private.aitask_normalize_member_departments(
  p_role text,
  p_departments text[]
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_department text;
  v_canonical text;
  v_result text[] := '{}'::text[];
  v_order text[] := array[
    'Operation', 'Management', 'Video Shooting', 'Video Editor',
    'Ads Management', 'Account & Finance', 'Designer'
  ];
begin
  if p_role = 'Client' then
    if cardinality(p_departments) <> 1 or lower(btrim(p_departments[1])) <> 'client' then
      raise check_violation using message = 'Client members must belong only to Client.';
    end if;
    return array['Client'];
  end if;

  if p_role not in ('Admin', 'Staff') or coalesce(cardinality(p_departments), 0) not between 1 and 7 then
    raise check_violation using message = 'Internal members require at least one valid department.';
  end if;

  foreach v_department in array p_departments loop
    v_canonical := case lower(regexp_replace(btrim(coalesce(v_department, '')), '[\s_-]+', ' ', 'g'))
      when 'operation' then 'Operation'
      when 'management' then 'Management'
      when 'videoshooting' then 'Video Shooting'
      when 'video shooting' then 'Video Shooting'
      when 'editor' then 'Video Editor'
      when 'video editor' then 'Video Editor'
      when 'ads management' then 'Ads Management'
      when 'account & finance' then 'Account & Finance'
      when 'designer' then 'Designer'
      else null
    end;
    if v_canonical is null then
      raise check_violation using message = 'Invalid internal department.';
    end if;
    if v_canonical = any(v_result) then
      raise check_violation using message = 'Duplicate departments are not allowed.';
    end if;
    v_result := array_append(v_result, v_canonical);
  end loop;

  select array_agg(item order by array_position(v_order, item))
  into v_result
  from unnest(v_result) item;
  return v_result;
end;
$$;

revoke all on function private.aitask_normalize_member_departments(text, text[]) from public, anon, authenticated;

alter table public.aitask_members
  add column if not exists departments text[];

update public.aitask_members
set departments = private.aitask_normalize_member_departments(role, array[department])
where departments is null or cardinality(departments) = 0;

alter table public.aitask_members
  alter column departments set not null;

alter table public.aitask_members
  drop constraint if exists aitask_members_departments_valid;
alter table public.aitask_members
  add constraint aitask_members_departments_valid
  check (departments = private.aitask_normalize_member_departments(role, departments));

comment on column public.aitask_members.departments is
  'Authoritative equal department memberships. Task access remains assignment-based.';
comment on column public.aitask_members.department is
  'Deprecated compatibility mirror; not a primary department.';

create or replace function private.aitask_guard_member_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_actor_member_id := private.aitask_member_id(old.workspace_id);
  if private.aitask_is_super_admin(old.workspace_id) then
    return new;
  end if;

  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only the Super Admin can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.departments is distinct from old.departments
    or new.client_name is distinct from old.client_name
    or new.is_super_admin is distinct from old.is_super_admin
    or new.custom_role_id is distinct from old.custom_role_id
    or new.custom_role_name is distinct from old.custom_role_name
    or new.permissions is distinct from old.permissions
    or (new.must_reset_password and not old.must_reset_password) then
    raise check_violation using message = 'Use the secure account service for identity or permission changes.';
  end if;

  return new;
end;
$$;

revoke all on function private.aitask_guard_member_security() from public, anon, authenticated;

create or replace function private.aitask_task_department(p_department text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(regexp_replace(btrim(coalesce(p_department, '')), '[\s_-]+', ' ', 'g'))
    when 'operation' then 'Operation'
    when 'management' then 'Management'
    when 'videoshooting' then 'Video Shooting'
    when 'video shooting' then 'Video Shooting'
    when 'editor' then 'Video Editor'
    when 'video editor' then 'Video Editor'
    when 'ads management' then 'Ads Management'
    when 'account & finance' then 'Account & Finance'
    when 'designer' then 'Designer'
    else null
  end;
$$;

create or replace function private.aitask_task_assignment_is_valid(
  p_workspace_id text,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_old_assignee text := coalesce(p_old_data ->> 'assignedTo', '');
  v_new_assignee text := coalesce(p_new_data ->> 'assignedTo', '');
  v_old_department text := private.aitask_task_department(p_old_data ->> 'department');
  v_new_department text := private.aitask_task_department(p_new_data ->> 'department');
begin
  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department then
    return true;
  end if;
  if v_new_assignee = '' or v_new_department is null then return false; end if;

  return exists (
    select 1
    from public.aitask_members member
    where member.workspace_id = p_workspace_id
      and member.id = v_new_assignee
      and member.role <> 'Client'
      and v_new_department = any(member.departments)
  );
end;
$$;

revoke all on function private.aitask_task_department(text) from public, anon, authenticated;
revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function private.aitask_can_mutate_entity(
  p_workspace_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_parent_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_client_key text := lower(trim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
  v_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', p_old_data ->> 'createdBy', p_old_data ->> 'userId');
  v_notification_visible boolean := false;
  v_old_reads jsonb := coalesce(p_old_data -> 'readByUserIds', '[]'::jsonb);
  v_new_reads jsonb := coalesce(p_new_data -> 'readByUserIds', '[]'::jsonb);
  v_command_type text := current_setting('aitask.command_type', true);
  v_client_command_allowed boolean := current_setting('aitask.client_command_allowed', true) = 'true';
begin
  if v_member_id is null then return false; end if;
  if p_entity_type = 'task'
    and p_action in ('insert', 'update')
    and not private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data) then
    return false;
  end if;
  if private.aitask_is_super_admin(p_workspace_id) then return true; end if;

  if private.aitask_is_admin(p_workspace_id)
    and p_entity_type in ('client', 'project', 'task', 'comment', 'approval', 'notification') then
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role = 'Staff' and v_creator = v_member_id
      when p_entity_type = 'project' then private.aitask_has_permission(p_workspace_id, 'createProjects') and v_creator = v_member_id
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type in ('comment', 'approval') then
        v_creator = v_member_id
        and private.aitask_can_view_task(p_workspace_id, p_parent_id)
        and (v_role <> 'Client' or v_client_command_allowed)
      when p_entity_type = 'notification' then
        v_role in ('Admin', 'Staff')
        or (v_role = 'Client' and v_client_command_allowed and v_command_type in ('comment.add', 'approval.review'))
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_action = 'delete' then
    return case
      when p_entity_type = 'task' then private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
      when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_entity_type = 'notification' then
    v_notification_visible :=
      coalesce(p_old_data ->> 'targetUserId', '') = v_member_id
      or coalesce(p_old_data ->> 'targetRole', '') = v_role
      or (v_role = 'Client' and lower(trim(coalesce(p_old_data ->> 'targetClient', ''))) = private.aitask_member_client_key(p_workspace_id));
    return v_notification_visible
      and (p_old_data - 'readByUserIds' - 'isRead') = (p_new_data - 'readByUserIds' - 'isRead')
      and v_new_reads @> v_old_reads
      and v_new_reads @> jsonb_build_array(v_member_id);
  end if;

  return case
    when p_entity_type = 'task' then
      private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      or (v_role = 'Client' and v_command_type = 'approval.review' and v_client_command_allowed)
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
    when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.aitask_update_member_departments(
  p_workspace_id text,
  p_command_id uuid,
  p_member_id text,
  p_departments text[],
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_member public.aitask_members%rowtype;
  v_departments text[];
  v_workspace_version bigint;
  v_response jsonb;
begin
  if p_command_id is null or nullif(btrim(coalesce(p_member_id, '')), '') is null or coalesce(p_expected_version, 0) < 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A command, member, and expected version are required.');
  end if;

  select member.* into v_actor
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.auth_user_id = (select auth.uid())
    and member.is_super_admin = true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_response
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_actor.id
    and receipt.command_id = p_command_id;
  if v_response is not null then return v_response || jsonb_build_object('replayed', true); end if;

  select member.* into v_member
  from public.aitask_members member
  where member.workspace_id = p_workspace_id and member.id = p_member_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Member account was not found.');
  end if;
  if v_member.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT', 'error', 'A newer member record is available.',
      'conflict', jsonb_build_object(
        'entityType', 'member', 'entityId', p_member_id,
        'expectedVersion', p_expected_version, 'actualVersion', v_member.version,
        'current', jsonb_build_object('departments', v_member.departments)
      )
    );
  end if;

  begin
    v_departments := private.aitask_normalize_member_departments(v_member.role, p_departments);
  exception when check_violation then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', sqlerrm);
  end;

  if v_member.departments is not distinct from v_departments then
    select version into v_workspace_version from public.aitask_workspaces where id = p_workspace_id;
  else
    update public.aitask_members
    set departments = v_departments,
        department = v_departments[1]
    where workspace_id = p_workspace_id and id = p_member_id
    returning * into v_member;

    update public.aitask_workspaces
    set version = version + 1, updated_at = now()
    where id = p_workspace_id
    returning version into v_workspace_version;

    insert into public.aitask_audit_events(
      workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
    ) values (
      p_workspace_id, v_actor.id, p_command_id, 'member.departments.update',
      'member', p_member_id, array['departments']
    );
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'member', jsonb_build_object(
      'id', v_member.id,
      'departments', v_member.departments,
      'department', v_member.department,
      'version', v_member.version,
      'updated_at', v_member.updated_at
    ),
    'changed', jsonb_build_array(jsonb_build_object(
      'entityType', 'member', 'entityId', v_member.id,
      'version', v_member.version, 'updatedAt', v_member.updated_at
    ))
  );
  insert into public.aitask_command_receipts(
    workspace_id, actor_member_id, command_id, command_type, response
  ) values (
    p_workspace_id, v_actor.id, p_command_id, 'member.departments.update', v_response
  );
  return v_response;
end;
$$;

revoke all on function public.aitask_update_member_departments(text, uuid, text, text[], bigint) from public, anon;
grant execute on function public.aitask_update_member_departments(text, uuid, text, text[], bigint) to authenticated, service_role;

create or replace function public.aitask_finalize_member_invitation_v2(
  p_actor_member_id text,
  p_auth_user_id uuid,
  p_name text,
  p_email text,
  p_role text,
  p_departments text[],
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
  v_departments text[];
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
  v_departments := private.aitask_normalize_member_departments(v_role, p_departments);
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

  if v_member.id is not null and v_member.is_super_admin then
    raise exception 'Protected Super Admin accounts cannot be changed through member onboarding';
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
      id, workspace_id, auth_user_id, name, email, role, department, departments, client_name,
      is_super_admin, must_reset_password, custom_role_id, custom_role_name,
      permissions, updated_at, version
    ) values (
      v_member_id, v_actor.workspace_id, p_auth_user_id, v_name, v_email, v_role,
      v_departments[1], v_departments,
      nullif(btrim(coalesce(p_client_name, '')), ''), false, v_require_password_setup,
      p_custom_role_id, p_custom_role_name, '{}'::jsonb, v_now, 1
    ) returning * into v_member;
  else
    update public.aitask_members
    set auth_user_id = p_auth_user_id,
        name = v_name,
        email = v_email,
        role = v_role,
        department = v_departments[1],
        departments = v_departments,
        client_name = nullif(btrim(coalesce(p_client_name, '')), ''),
        must_reset_password = v_require_password_setup,
        custom_role_id = p_custom_role_id,
        custom_role_name = p_custom_role_name
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
    array['auth_user_id', 'role', 'departments', 'must_reset_password'],
    jsonb_build_object('source', case when p_registration_id is null then 'direct_invite' else 'staff_registration' end),
    v_now
  );

  return jsonb_build_object('member', to_jsonb(v_member), 'workspaceVersion', v_workspace_version);
end;
$$;

revoke all on function public.aitask_finalize_member_invitation_v2(
  text, uuid, text, text, text, text[], text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.aitask_finalize_member_invitation_v2(
  text, uuid, text, text, text, text[], text, text, text, text, text
) to service_role;
