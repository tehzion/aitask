-- Authorization hardening follow-ups for the Boss Koo / PM / HOD / Staff model.
--
-- This migration keeps the existing RPC contracts stable while closing the
-- remaining frontend/backend parity and atomic-deletion gaps found in the
-- 2026-09-18 authorization audit.

-- 1. Resolve permissions with sparse member overrides -----------------------
-- A direct member permission key overrides the custom role only when that key
-- is present. Missing keys continue through custom-role and base-role defaults.
-- This matches getEffectivePermissions() in src/lib/access.ts.
create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when p_permission = any(array[
        'editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports'
      ]) then false
      when member.permissions ? p_permission then member.permissions ->> p_permission = 'true'
      when custom_role.data -> 'permissions' ? p_permission then custom_role.data -> 'permissions' ->> p_permission = 'true'
      when p_permission = 'viewDeliveryTracker'
        and not (member.permissions ? p_permission)
        and not (custom_role.data -> 'permissions' ? p_permission)
        and (
          (member.permissions ? 'viewProjects' and member.permissions ->> 'viewProjects' = 'true')
          or (
            not (member.permissions ? 'viewProjects')
            and custom_role.data -> 'permissions' ->> 'viewProjects' = 'true'
          )
        ) then true
      -- A direct record without a custom role is a complete legacy
      -- permission snapshot. With a custom role, the preceding branches have
      -- already layered the sparse direct keys over that role.
      when member.permissions <> '{}'::jsonb then false
      when custom_role.data is not null then false
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker',
        'viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks',
        'createProjects','createClients','deleteClients','manageServiceCatalog',
        'manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewServicePrices'
      ])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker',
        'viewReports','viewSettings','createTasks','viewAssignedServiceClients'
      ])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker',
        'viewReports','viewSettings','clientReview'
      ])
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data
      from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;

-- 2. Protect departments as a member security field ------------------------
create or replace function private.aitask_guard_member_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id text;
  v_workspace_id text;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  if private.aitask_is_super_admin(v_workspace_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise check_violation using message = 'Only Boss Koo can create members.';
  end if;
  if tg_op = 'DELETE' then
    raise check_violation using message = 'Only Boss Koo can delete members.';
  end if;

  v_actor_member_id := private.aitask_member_id(old.workspace_id);
  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only Boss Koo can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.departments is distinct from old.departments
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
  before insert or update or delete on public.aitask_members
  for each row execute function private.aitask_guard_member_security();

revoke all on function private.aitask_guard_member_security() from public, anon, authenticated;

-- 3. Department changes participate in member optimistic locking -------------
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
        department = case when v_member.role = 'Admin' then 'Management' else v_departments[1] end,
        version = version + 1,
        updated_at = now()
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
      'member', p_member_id, array['department', 'departments']
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

-- 4. Make direct-delete RLS use the same target-aware authorization function.
drop policy if exists "members can delete authorized entities" on public.aitask_entities;
create policy "members can delete authorized entities" on public.aitask_entities
  for delete to authenticated
  using (private.aitask_can_mutate_entity(
    workspace_id, 'delete', entity_type, entity_id, parent_id, data, '{}'::jsonb
  ));

-- 5. Atomic company deletion -----------------------------------------------
-- The client sends a state diff that can contain only the records currently
-- visible to it. The server therefore derives the complete deletion set from
-- the canonical client key/id instead of trusting the diff to enumerate every
-- child record.
create or replace function private.aitask_delete_client_cascade(
  p_workspace_id text,
  p_command_id uuid,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_client public.aitask_entities%rowtype;
  v_client_operation jsonb;
  v_client_id text;
  v_client_key text;
  v_expected_version bigint;
  v_workspace_version bigint;
  v_workspace_updated timestamptz;
  v_existing jsonb;
  v_deleted jsonb := '[]'::jsonb;
  v_deleted_count integer := 0;
  v_task_delete_context jsonb := '[]'::jsonb;
  v_response jsonb;
begin
  if (select auth.uid()) is null or v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) < 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A company deletion operation is required.');
  end if;

  select item.value into v_client_operation
  from jsonb_array_elements(p_operations) item
  where item.value ->> 'kind' = 'entity'
    and item.value ->> 'action' = 'delete'
    and item.value ->> 'entityType' = 'client'
  limit 1;
  if v_client_operation is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A company deletion operation is required.');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_operations) item
    where item.value ->> 'kind' is distinct from 'entity'
      or item.value ->> 'action' is distinct from 'delete'
      or item.value ->> 'entityType' not in (
        'client', 'project', 'task', 'comment', 'approval', 'notification',
        'client_plan', 'service_cycle', 'deliverable', 'cycle_comment',
        'addon', 'service_pricing_snapshot'
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Company deletion contains an invalid operation.');
  end if;

  select workspace.version, workspace.updated_at
  into v_workspace_version, v_workspace_updated
  from public.aitask_workspaces workspace
  where workspace.id = p_workspace_id
  for update;
  if v_workspace_version is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Workspace was not found.');
  end if;
  if p_expected_workspace_version is not null
    and v_workspace_version is distinct from p_expected_workspace_version then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT',
      'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
      'conflict', jsonb_build_object(
        'entityType', 'workspace', 'entityId', p_workspace_id,
        'expectedVersion', p_expected_workspace_version, 'actualVersion', v_workspace_version,
        'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
      )
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_existing
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_actor_id
    and receipt.command_id = p_command_id;
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  v_client_id := nullif(btrim(v_client_operation ->> 'entityId'), '');
  v_expected_version := coalesce((v_client_operation ->> 'expectedVersion')::bigint, 0);
  if v_client_id is null or v_expected_version < 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'The company version is required.');
  end if;

  select entity.* into v_client
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'client'
    and entity.entity_id = v_client_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'The company no longer exists.');
  end if;
  if v_client.version <> v_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT', 'error', 'A newer company record is available.',
      'conflict', jsonb_build_object(
        'entityType', 'client', 'entityId', v_client_id,
        'expectedVersion', v_expected_version, 'actualVersion', v_client.version,
        'current', v_client.data
      )
    );
  end if;

  v_client_key := lower(btrim(coalesce(v_client.client_key, v_client.data ->> 'clientName', '')));
  perform set_config('aitask.command_type', 'client.delete', true);
  if not private.aitask_can_mutate_entity(
    p_workspace_id, 'delete', 'client', v_client_id, null, v_client.data, '{}'::jsonb
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'You cannot delete this company.');
  end if;

  select coalesce(jsonb_agg(to_jsonb(entity.entity_id)), '[]'::jsonb)
  into v_task_delete_context
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'task'
    and (
      entity.client_key = v_client_key
      or entity.client_id = v_client_id
      or entity.data ->> 'clientId' = v_client_id
    );

  perform set_config('aitask.cascade_delete', 'true', true);
  perform set_config('aitask.staff_delete_notice_context', v_task_delete_context::text, true);

  with deleted as (
    delete from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and (
        (entity.entity_type = 'client' and entity.entity_id = v_client_id)
        or entity.client_key = v_client_key
        or entity.client_id = v_client_id
        or entity.data ->> 'clientId' = v_client_id
        or (entity.entity_type = 'notification' and entity.target_client_key = v_client_key)
      )
    returning entity.entity_type, entity.entity_id
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('entityType', deleted.entity_type, 'entityId', deleted.entity_id)
      order by deleted.entity_type, deleted.entity_id),
    '[]'::jsonb
  ), count(*)
  into v_deleted, v_deleted_count
  from deleted;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id,
    changed_fields, metadata
  ) values (
    p_workspace_id, v_actor_id, p_command_id, 'delete', 'client', v_client_id,
    array['cascade'], jsonb_build_object('clientKey', v_client_key, 'deletedEntityCount', v_deleted_count)
  );

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = p_workspace_id
  returning version into v_workspace_version;

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'changed', '[]'::jsonb,
    'deleted', v_deleted,
    'refreshScope', 'workspace'
  );
  insert into public.aitask_command_receipts(
    workspace_id, actor_member_id, command_id, command_type, response
  ) values (
    p_workspace_id, v_actor_id, p_command_id, 'client.delete', v_response
  );
  return v_response;
exception when check_violation or not_null_violation or invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'The company deletion contains invalid data.');
end;
$$;

revoke all on function private.aitask_delete_client_cascade(text, uuid, jsonb, bigint)
  from public, anon, authenticated;

-- The cascade is performed by the secure command wrapper, so a cached client
-- that sends child delete operations cannot bypass the single authorization
-- check or leave a partially deleted company behind.
create or replace function public.aitask_execute_command_with_lock_before_staff_context(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
  v_actor_name text;
  v_super_admin boolean := private.aitask_is_super_admin(p_workspace_id);
  v_client_allowed boolean := false;
  v_operation jsonb;
  v_operations jsonb := p_operations;
  v_task_id text;
  v_task_data jsonb;
  v_notification_id text;
  v_now_text text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_title text;
  v_message text;
  v_workspace_version bigint;
  v_workspace_updated timestamptz;
begin
  if (select auth.uid()) is null or v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed command operations.');
  end if;

  if p_command_type = 'client.delete' then
    return private.aitask_delete_client_cascade(
      p_workspace_id, p_command_id, p_operations, p_expected_workspace_version
    );
  end if;

  if p_expected_workspace_version is not null then
    select workspace.version, workspace.updated_at into v_workspace_version, v_workspace_updated
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if v_workspace_version is distinct from p_expected_workspace_version then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT',
        'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
        'conflict', jsonb_build_object(
          'entityType', 'workspace', 'entityId', p_workspace_id,
          'expectedVersion', p_expected_workspace_version, 'actualVersion', v_workspace_version,
          'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
        )
      );
    end if;
  end if;

  if p_command_type in ('member.manage', 'role.manage', 'registration.review', 'task_status.manage')
    and not v_super_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if v_operation ->> 'kind' = 'member' then
      if v_operation ->> 'action' in ('insert', 'delete') then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Use the secure account service to add or remove members.');
      end if;
      if (v_operation ->> 'entityId') <> v_actor_id and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
      end if;
      if (v_operation ->> 'entityId') = v_actor_id and p_command_type <> 'member.update' and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid member update command.');
      end if;
    end if;
    if v_operation ->> 'kind' = 'entity'
      and v_operation ->> 'entityType' in ('registration', 'custom_role', 'task_status')
      and not v_super_admin then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
    end if;
  end loop;

  if v_actor_role = 'Client' and p_command_type in ('comment.add', 'approval.review') then
    v_client_allowed := private.aitask_client_command_allowed(p_workspace_id, p_command_type, p_operations);
    if not v_client_allowed then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This client feedback command is not allowed.');
    end if;

    if p_command_type = 'comment.add' then
      v_task_id := coalesce(nullif(p_operations -> 0 ->> 'parentId', ''), p_operations -> 0 -> 'data' ->> 'taskId');
    else
      select value ->> 'entityId' into v_task_id
      from jsonb_array_elements(p_operations) item(value)
      where value ->> 'entityType' = 'task' and value ->> 'action' = 'update'
      limit 1;
    end if;

    select task.data into v_task_data
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id and task.entity_type = 'task' and task.entity_id = v_task_id;
    select member.name into v_actor_name
    from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.id = v_actor_id;

    if p_command_type = 'comment.add' then
      v_title := 'Client Feedback';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' commented on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    elsif p_operations @? '$[*] ? (@.entityType == "approval" && @.data.status == "Approved")' then
      v_title := 'Client Approved Task';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' approved "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    else
      v_title := 'Client Requested Revision';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' requested changes on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    end if;

    v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
    v_operations := v_operations || jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
      'entityId', v_notification_id, 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', v_notification_id, 'targetRole', 'Admin', 'title', v_title,
        'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
        'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
        'iconType', case when p_command_type = 'comment.add' then 'status'
          when v_title = 'Client Approved Task' then 'success' else 'alert' end
      )
    ));

    if nullif(v_task_data ->> 'assignedTo', '') is not null then
      v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
      v_operations := v_operations || jsonb_build_array(jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', v_notification_id, 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', v_notification_id, 'targetUserId', v_task_data ->> 'assignedTo', 'title', v_title,
          'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
          'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
          'iconType', case when p_command_type = 'comment.add' then 'status'
            when v_title = 'Client Approved Task' then 'success' else 'alert' end
        )
      ));
    end if;
  end if;

  perform set_config('aitask.command_type', p_command_type, true);
  perform set_config('aitask.client_command_allowed', case when v_client_allowed then 'true' else 'false' end, true);
  return public.aitask_execute_command_legacy(p_workspace_id, p_command_id, p_command_type, v_operations);
end;
$$;

revoke all on function public.aitask_execute_command_with_lock_before_staff_context(text, uuid, text, jsonb, bigint)
  from public, anon, authenticated, service_role;

-- Keep the public wrappers as the only callable command entry points. The
-- legacy four-argument wrapper also routes company deletion through the same
-- atomic helper so older clients cannot fall back to a partial child diff.
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
begin
  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
  if p_command_type = 'client.delete' then
    return private.aitask_delete_client_cascade(p_workspace_id, p_command_id, p_operations, null);
  end if;
  return public.aitask_execute_command_before_staff_context(
    p_workspace_id, p_command_id, p_command_type, p_operations
  );
end;
$$;

create or replace function public.aitask_execute_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
  return public.aitask_execute_command_with_lock_before_staff_context(
    p_workspace_id, p_command_id, p_command_type, p_operations, p_expected_workspace_version
  );
end;
$$;

revoke all on function public.aitask_execute_command(text, uuid, text, jsonb)
  from public, anon;
revoke all on function public.aitask_execute_command(text, uuid, text, jsonb, bigint)
  from public, anon;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb, bigint)
  to authenticated, service_role;

-- The permission guard is installed before the generic entity normalizer. It
-- must validate the canonical JSON creator, not the denormalized column that
-- has not been populated yet for a new row.
create or replace function private.aitask_guard_task_creation_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.aitask_member_id(new.workspace_id);
  actor_role text := private.aitask_member_role(new.workspace_id);
  task_creator_id text := nullif(btrim(coalesce(new.data ->> 'createdBy', new.data ->> 'userId', '')), '');
begin
  if actor_role = 'Staff'
    and not private.aitask_is_super_admin(new.workspace_id)
    and not private.aitask_has_permission(new.workspace_id, 'createTasks') then
    raise check_violation using message = 'Create tasks permission required.';
  end if;
  if actor_role = 'Staff' and coalesce(task_creator_id, '') <> coalesce(actor_id, '') then
    raise check_violation using message = 'Staff task ownership is immutable.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_task_creation_permission() from public, anon, authenticated;

-- This authorization predicate reads request settings and other permission
-- functions whose volatility is not guaranteed to the planner. Marking it
-- VOLATILE avoids stale authorization decisions and clears the Supabase lint
-- warning for the previous STABLE declaration.
alter function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb)
  volatile;

-- Cascades intentionally suppress per-task Staff deletion notices and the
-- narrower Staff service-write guard; authorization has already been checked
-- once against the target company above.
drop trigger if exists aitask_track_staff_task_command on public.aitask_entities;
create trigger aitask_track_staff_task_command
  after insert or update or delete on public.aitask_entities
  for each row
  when (current_setting('aitask.cascade_delete', true) is distinct from 'true')
  execute function private.aitask_track_staff_task_command();

drop trigger if exists aitask_00_guard_scoped_staff_service_write on public.aitask_entities;
create trigger aitask_00_guard_scoped_staff_service_write
  before insert or update or delete on public.aitask_entities
  for each row
  when (current_setting('aitask.cascade_delete', true) is distinct from 'true')
  execute function private.aitask_guard_scoped_staff_service_write();
