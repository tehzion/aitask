-- AiTask v1.6.0: versioned, idempotent, transactional workspace commands.
-- This migration is additive. Direct table writes are revoked by the separate
-- secure cutover migration after the command frontend is deployed.

alter table public.aitask_workspaces
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.aitask_members
  add column if not exists version bigint not null default 1;

alter table public.aitask_entities
  add column if not exists version bigint not null default 1;

create table if not exists public.aitask_command_receipts (
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  actor_member_id text not null references public.aitask_members(id) on delete cascade,
  command_id uuid not null,
  command_type text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_member_id, command_id)
);

create table if not exists public.aitask_audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  actor_member_id text references public.aitask_members(id) on delete set null,
  command_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  changed_fields text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists aitask_audit_workspace_time_idx
  on public.aitask_audit_events(workspace_id, occurred_at desc);
create index if not exists aitask_audit_entity_idx
  on public.aitask_audit_events(workspace_id, entity_type, entity_id);
create index if not exists aitask_audit_actor_member_idx
  on public.aitask_audit_events(actor_member_id);
create index if not exists aitask_command_receipts_actor_member_idx
  on public.aitask_command_receipts(actor_member_id);

alter table public.aitask_command_receipts enable row level security;
alter table public.aitask_audit_events enable row level security;

drop policy if exists "mfa admins can read audit events" on public.aitask_audit_events;
create policy "mfa admins can read audit events" on public.aitask_audit_events
  for select to authenticated
  using (
    private.aitask_is_admin(workspace_id)
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
  );

revoke all on public.aitask_command_receipts from public, anon, authenticated;
revoke all on public.aitask_audit_events from public, anon, authenticated;
grant select on public.aitask_audit_events to authenticated;
grant select, insert, update, delete on public.aitask_command_receipts to service_role;
grant select, insert, update, delete on public.aitask_audit_events to service_role;

create or replace function private.aitask_increment_member_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aitask_increment_member_version on public.aitask_members;
create trigger aitask_increment_member_version
  before update on public.aitask_members
  for each row execute function private.aitask_increment_member_version();

create or replace function private.aitask_increment_entity_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aitask_increment_entity_version on public.aitask_entities;
create trigger aitask_increment_entity_version
  before update on public.aitask_entities
  for each row execute function private.aitask_increment_entity_version();

revoke all on function private.aitask_increment_member_version() from public;
revoke all on function private.aitask_increment_entity_version() from public;

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
  if private.aitask_is_admin(old.workspace_id) then
    return new;
  end if;

  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only administrators can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.client_name is distinct from old.client_name
    or new.is_super_admin is distinct from old.is_super_admin
    or new.custom_role_id is distinct from old.custom_role_id
    or new.custom_role_name is distinct from old.custom_role_name
    or new.permissions is distinct from old.permissions
    or (new.must_reset_password and not old.must_reset_password) then
    raise check_violation using message = 'Member security fields require administrator access.';
  end if;

  return new;
end;
$$;

drop trigger if exists aitask_guard_member_security on public.aitask_members;
create trigger aitask_guard_member_security
  before update on public.aitask_members
  for each row execute function private.aitask_guard_member_security();

revoke all on function private.aitask_guard_member_security() from public;

create or replace function private.aitask_json_changed_fields(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(key order by key), '{}'::text[])
  from (
    select key
    from jsonb_object_keys(coalesce(p_old, '{}'::jsonb) || coalesce(p_new, '{}'::jsonb)) key
    where coalesce(p_old, '{}'::jsonb) -> key is distinct from coalesce(p_new, '{}'::jsonb) -> key
  ) changed;
$$;

revoke all on function private.aitask_json_changed_fields(jsonb, jsonb) from public;

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
begin
  if v_member_id is null then
    return false;
  end if;

  if private.aitask_is_admin(p_workspace_id) then
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then
        v_role = 'Staff' and v_creator = v_member_id
      when p_entity_type = 'project' then
        private.aitask_has_permission(p_workspace_id, 'createProjects') and v_creator = v_member_id
      when p_entity_type = 'client' then
        private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type in ('comment', 'approval') then
        v_creator = v_member_id and private.aitask_can_view_task(p_workspace_id, p_parent_id)
      when p_entity_type = 'notification' then
        v_role in ('Admin', 'Staff')
      when p_entity_type = 'registration' then
        private.aitask_has_permission(p_workspace_id, 'approveRegistrations')
      when p_entity_type in ('custom_role', 'task_status') then
        private.aitask_has_permission(p_workspace_id, 'manageRoles')
      else false
    end;
  end if;

  if p_action = 'delete' then
    return case
      when p_entity_type = 'task' then private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
      when p_entity_type in ('comment', 'approval') then v_creator = v_member_id
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type = 'registration' then private.aitask_has_permission(p_workspace_id, 'approveRegistrations')
      when p_entity_type in ('custom_role', 'task_status') then private.aitask_has_permission(p_workspace_id, 'manageRoles')
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
    when p_entity_type = 'task' then private.aitask_can_edit_task(p_workspace_id, p_entity_id)
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
    when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id
    when p_entity_type = 'registration' then private.aitask_has_permission(p_workspace_id, 'approveRegistrations')
    when p_entity_type in ('custom_role', 'task_status') then private.aitask_has_permission(p_workspace_id, 'manageRoles')
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public;

create or replace function public.aitask_execute_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_existing_response jsonb;
  v_operation jsonb;
  v_kind text;
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_parent_id text;
  v_old_parent_id text;
  v_expected_version bigint;
  v_actual_version bigint;
  v_old_data jsonb;
  v_new_data jsonb;
  v_member_data jsonb;
  v_changed_fields text[];
  v_changed jsonb := '[]'::jsonb;
  v_deleted jsonb := '[]'::jsonb;
  v_row_version bigint;
  v_row_updated_at timestamptz;
  v_workspace_version bigint;
  v_response jsonb;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication required.');
  end if;

  v_actor_id := private.aitask_member_id(p_workspace_id);
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;

  if p_command_type not in (
    'workspace.patch', 'task.create', 'task.update', 'task.delete',
    'project.create', 'project.update', 'project.delete',
    'client.upsert', 'client.rename', 'client.delete',
    'comment.add', 'approval.review', 'approval.revision',
    'notification.read', 'notification.read_all', 'member.update',
    'member.manage', 'role.manage', 'registration.review', 'task_status.manage',
    'reminder.generate'
  ) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Unsupported command type.');
  end if;

  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) = 0 or jsonb_array_length(p_operations) > 500 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Commands require between 1 and 500 operations.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));

  select response into v_existing_response
  from public.aitask_command_receipts
  where workspace_id = p_workspace_id
    and actor_member_id = v_actor_id
    and command_id = p_command_id;

  if v_existing_response is not null then
    return v_existing_response || jsonb_build_object('replayed', true);
  end if;

  -- Preflight every operation before the first write so conflicts never partially apply.
  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_kind := v_operation ->> 'kind';
    v_action := v_operation ->> 'action';
    v_entity_type := v_operation ->> 'entityType';
    v_entity_id := v_operation ->> 'entityId';
    v_parent_id := nullif(v_operation ->> 'parentId', '');
    v_expected_version := coalesce((v_operation ->> 'expectedVersion')::bigint, 0);
    v_new_data := coalesce(v_operation -> 'data', '{}'::jsonb);

    if v_kind not in ('entity', 'member') or v_action not in ('insert', 'update', 'delete') or coalesce(v_entity_id, '') = '' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed command operation.');
    end if;

    if v_kind = 'entity' then
      if v_entity_type not in ('client', 'project', 'task', 'comment', 'approval', 'notification', 'registration', 'custom_role', 'task_status') then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Unsupported entity type.');
      end if;

      select version, data, parent_id
        into v_actual_version, v_old_data, v_old_parent_id
      from public.aitask_entities
      where workspace_id = p_workspace_id and entity_type = v_entity_type and entity_id = v_entity_id;

      if v_action = 'insert' and v_actual_version is not null then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'The record already exists.',
          'conflict', jsonb_build_object('entityType', v_entity_type, 'entityId', v_entity_id, 'expectedVersion', 0, 'actualVersion', v_actual_version, 'current', v_old_data));
      elsif v_action in ('update', 'delete') and v_actual_version is null then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'The record no longer exists.');
      elsif v_action in ('update', 'delete') and v_actual_version <> v_expected_version then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'A newer version of this record is available.',
          'conflict', jsonb_build_object('entityType', v_entity_type, 'entityId', v_entity_id, 'expectedVersion', v_expected_version, 'actualVersion', v_actual_version, 'current', v_old_data, 'attempted', v_new_data));
      end if;

      if not private.aitask_can_mutate_entity(
        p_workspace_id,
        v_action,
        v_entity_type,
        v_entity_id,
        coalesce(v_parent_id, v_old_parent_id),
        v_old_data,
        v_new_data
      ) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'You do not have permission to make this change.');
      end if;
    else
      select version, to_jsonb(member)
        into v_actual_version, v_old_data
      from public.aitask_members member
      where workspace_id = p_workspace_id and id = v_entity_id;

      if v_action = 'insert' and v_actual_version is not null then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'The member already exists.');
      elsif v_action in ('update', 'delete') and v_actual_version is null then
        return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'The member no longer exists.');
      elsif v_action in ('update', 'delete') and v_actual_version <> v_expected_version then
        return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'A newer member record is available.',
          'conflict', jsonb_build_object('entityType', 'member', 'entityId', v_entity_id, 'expectedVersion', v_expected_version, 'actualVersion', v_actual_version));
      end if;

      if not private.aitask_is_admin(p_workspace_id)
        and not (v_action = 'update' and v_old_data ->> 'auth_user_id' = (select auth.uid())::text) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'You do not have permission to manage this member.');
      end if;
    end if;

    v_actual_version := null;
    v_old_data := null;
    v_old_parent_id := null;
  end loop;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_kind := v_operation ->> 'kind';
    v_action := v_operation ->> 'action';
    v_entity_type := v_operation ->> 'entityType';
    v_entity_id := v_operation ->> 'entityId';
    v_parent_id := nullif(v_operation ->> 'parentId', '');
    v_new_data := coalesce(v_operation -> 'data', '{}'::jsonb);

    if v_kind = 'entity' then
      select data into v_old_data
      from public.aitask_entities
      where workspace_id = p_workspace_id and entity_type = v_entity_type and entity_id = v_entity_id;

      if v_action = 'insert' then
        insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
        values (p_workspace_id, v_entity_type, v_entity_id, v_parent_id, v_new_data)
        returning version, updated_at into v_row_version, v_row_updated_at;
      elsif v_action = 'update' then
        update public.aitask_entities
        set parent_id = v_parent_id, data = v_new_data
        where workspace_id = p_workspace_id and entity_type = v_entity_type and entity_id = v_entity_id
        returning version, updated_at into v_row_version, v_row_updated_at;
      else
        delete from public.aitask_entities
        where workspace_id = p_workspace_id and entity_type = v_entity_type and entity_id = v_entity_id;
        v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('entityType', v_entity_type, 'entityId', v_entity_id));
      end if;

      v_changed_fields := private.aitask_json_changed_fields(v_old_data, case when v_action = 'delete' then '{}'::jsonb else v_new_data end);
      if v_entity_type in ('task', 'project', 'client', 'approval', 'custom_role', 'task_status') or v_action = 'delete' then
        insert into public.aitask_audit_events(
          workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields, metadata
        ) values (
          p_workspace_id, v_actor_id, p_command_id, v_action, v_entity_type, v_entity_id, v_changed_fields,
          jsonb_build_object('parentId', v_parent_id)
        );
      end if;

      if v_action <> 'delete' then
        v_changed := v_changed || jsonb_build_array(jsonb_build_object(
          'entityType', v_entity_type,
          'entityId', v_entity_id,
          'version', v_row_version,
          'updatedAt', v_row_updated_at
        ));
      end if;
    else
      v_member_data := v_new_data;
      select to_jsonb(member) into v_old_data
      from public.aitask_members member
      where workspace_id = p_workspace_id and id = v_entity_id;

      if v_action = 'insert' then
        insert into public.aitask_members(
          id, workspace_id, auth_user_id, name, email, role, department, avatar, client_name,
          is_super_admin, must_reset_password, custom_role_id, custom_role_name, permissions
        ) values (
          v_entity_id, p_workspace_id, nullif(v_member_data ->> 'auth_user_id', '')::uuid,
          v_member_data ->> 'name', nullif(v_member_data ->> 'email', ''), v_member_data ->> 'role',
          v_member_data ->> 'department', nullif(v_member_data ->> 'avatar', ''), nullif(v_member_data ->> 'client_name', ''),
          coalesce((v_member_data ->> 'is_super_admin')::boolean, false),
          coalesce((v_member_data ->> 'must_reset_password')::boolean, false),
          nullif(v_member_data ->> 'custom_role_id', ''), nullif(v_member_data ->> 'custom_role_name', ''),
          coalesce(v_member_data -> 'permissions', '{}'::jsonb)
        ) returning version, updated_at into v_row_version, v_row_updated_at;
      elsif v_action = 'update' then
        update public.aitask_members set
          auth_user_id = nullif(v_member_data ->> 'auth_user_id', '')::uuid,
          name = v_member_data ->> 'name',
          email = nullif(v_member_data ->> 'email', ''),
          role = v_member_data ->> 'role',
          department = v_member_data ->> 'department',
          avatar = nullif(v_member_data ->> 'avatar', ''),
          client_name = nullif(v_member_data ->> 'client_name', ''),
          is_super_admin = coalesce((v_member_data ->> 'is_super_admin')::boolean, false),
          must_reset_password = coalesce((v_member_data ->> 'must_reset_password')::boolean, false),
          custom_role_id = nullif(v_member_data ->> 'custom_role_id', ''),
          custom_role_name = nullif(v_member_data ->> 'custom_role_name', ''),
          permissions = coalesce(v_member_data -> 'permissions', '{}'::jsonb)
        where workspace_id = p_workspace_id and id = v_entity_id
        returning version, updated_at into v_row_version, v_row_updated_at;
      else
        delete from public.aitask_members where workspace_id = p_workspace_id and id = v_entity_id;
        v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('entityType', 'member', 'entityId', v_entity_id));
      end if;

      v_changed_fields := private.aitask_json_changed_fields(v_old_data, case when v_action = 'delete' then '{}'::jsonb else v_member_data end);
      insert into public.aitask_audit_events(
        workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
      ) values (p_workspace_id, v_actor_id, p_command_id, v_action, 'member', v_entity_id, v_changed_fields);

      if v_action <> 'delete' then
        v_changed := v_changed || jsonb_build_array(jsonb_build_object(
          'entityType', 'member', 'entityId', v_entity_id, 'version', v_row_version, 'updatedAt', v_row_updated_at
        ));
      end if;
    end if;
  end loop;

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = p_workspace_id
  returning version into v_workspace_version;

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'changed', v_changed,
    'deleted', v_deleted,
    'refreshScope', case when jsonb_array_length(p_operations) > 20 then 'workspace' else 'rows' end
  );

  insert into public.aitask_command_receipts(workspace_id, actor_member_id, command_id, command_type, response)
  values (p_workspace_id, v_actor_id, p_command_id, p_command_type, v_response);

  return v_response;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'The command contains invalid data.');
end;
$$;

revoke all on function public.aitask_execute_command(text, uuid, text, jsonb) from public, anon;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb) to authenticated, service_role;

grant select on public.aitask_workspaces to authenticated;
