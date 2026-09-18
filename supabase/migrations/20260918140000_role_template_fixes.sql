-- Role template remediation.
--
-- Admin: full operational access (Approvals visibility, company create/delete
-- parity, and project management). The five protected Boss Koo keys stay
-- non-delegable.
-- HOD and opt-in custom roles: department-scoped task view/edit.
-- Custom roles: every non-protected key is now persistable per member.

create or replace function private.aitask_is_hod(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select member.custom_role_id = 'system-hod'
    from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
  ), false);
$$;
revoke all on function private.aitask_is_hod(text) from public, anon, authenticated;

create or replace function private.aitask_role_is_department_scoped(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.custom_role_id = 'system-hod' then true
      when custom_role.data is not null then coalesce((custom_role.data ->> 'departmentScoped')::boolean, false)
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
  ), false);
$$;
revoke all on function private.aitask_role_is_department_scoped(text) from public, anon, authenticated;

create or replace function private.aitask_can_view_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
      when 'Staff' then
        private.aitask_has_permission(p_workspace_id, 'viewAllTasks')
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or (
          private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
          and task.created_by = private.aitask_member_id(p_workspace_id)
        )
        or (
          private.aitask_role_is_department_scoped(p_workspace_id)
          and coalesce(task.data ->> 'department', '') = any(coalesce((
            select member.departments from public.aitask_members member
            where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
          ), array[]::text[]))
        )
      when 'Client' then task.client_key = private.aitask_member_client_key(p_workspace_id)
      else false
    end
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_edit_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.aitask_is_super_admin(p_workspace_id)
      or (
        private.aitask_member_role(p_workspace_id) in ('Admin', 'Staff')
        and (
          task.assigned_to = private.aitask_member_id(p_workspace_id)
          or (
            private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
            and task.created_by = private.aitask_member_id(p_workspace_id)
          )
        )
      )
      or (
        private.aitask_role_is_department_scoped(p_workspace_id)
        and coalesce(task.data ->> 'department', '') = any(coalesce((
          select member.departments from public.aitask_members member
          where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
        ), array[]::text[]))
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

revoke all on function private.aitask_can_view_task(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_edit_task(text, text) from public, anon, authenticated;
grant execute on function private.aitask_can_view_task(text, text) to authenticated;
grant execute on function private.aitask_can_edit_task(text, text) to authenticated;

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
      when member.permissions <> '{}'::jsonb then coalesce(member.permissions ->> p_permission = 'true', false)
      when custom_role.data is not null then coalesce(custom_role.data -> 'permissions' ->> p_permission = 'true', false)
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewAllTasks','viewAllClients',
        'manageAssignedClients','viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks','createProjects','createClients','deleteClients',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewAssignedServiceClients','viewServicePrices'
      ])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','viewAssignedServiceClients'
      ])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings','clientReview'
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

create or replace function public.aitask_update_member_permissions(
  p_workspace_id text,
  p_command_id uuid,
  p_member_id text,
  p_permissions jsonb,
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
  v_permissions jsonb := '{}'::jsonb;
  v_workspace_version bigint;
  v_response jsonb;
  v_key text;
  v_safe_keys constant text[] := array[
    'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewAllTasks','viewAllClients',
    'manageAssignedClients','viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks','createProjects','createClients','deleteClients',
    'clientReview','manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
    'viewAllServiceClients','viewAssignedServiceClients','viewServicePrices'
  ];
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
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Boss Koo permission required.');
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
  if v_member.role <> 'Staff' or v_member.is_super_admin then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Only Staff and HOD permissions can be customized.');
  end if;
  if v_member.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT', 'error', 'A newer member record is available.',
      'conflict', jsonb_build_object(
        'entityType', 'member', 'entityId', p_member_id,
        'expectedVersion', p_expected_version, 'actualVersion', v_member.version,
        'current', jsonb_build_object('permissions', v_member.permissions)
      )
    );
  end if;

  if p_permissions is not null and p_permissions <> '{}'::jsonb then
    foreach v_key in array v_safe_keys loop
      v_permissions := v_permissions || jsonb_build_object(v_key, coalesce((p_permissions ->> v_key)::boolean, false));
    end loop;
    v_permissions := v_permissions || jsonb_build_object(
      'editTasks', false, 'manageUsers', false, 'approveRegistrations', false,
      'deleteUsers', false, 'viewProductionReports', false
    );
    if not exists (select 1 from jsonb_each_text(v_permissions) entry where entry.value = 'true') then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose at least one permission or reset to role defaults.');
    end if;
  end if;

  if v_member.permissions is not distinct from v_permissions then
    select version into v_workspace_version from public.aitask_workspaces where id = p_workspace_id;
  else
    update public.aitask_members
    set permissions = v_permissions,
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
      p_workspace_id, v_actor.id, p_command_id, 'member.permissions.update',
      'member', p_member_id, array['permissions']
    );
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'member', jsonb_build_object(
      'id', v_member.id,
      'permissions', v_member.permissions,
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
    p_workspace_id, v_actor.id, p_command_id, 'member.permissions.update', v_response
  );
  return v_response;
end;
$$;

revoke all on function public.aitask_update_member_permissions(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.aitask_update_member_permissions(text, uuid, text, jsonb, bigint) to authenticated, service_role;

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
  v_client_key text := lower(btrim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
  v_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', p_old_data ->> 'createdBy', p_old_data ->> 'userId');
  v_notification_visible boolean := false;
  v_old_reads jsonb := coalesce(p_old_data -> 'readByUserIds', '[]'::jsonb);
  v_new_reads jsonb := coalesce(p_new_data -> 'readByUserIds', '[]'::jsonb);
  v_command_type text := current_setting('aitask.command_type', true);
  v_client_command_allowed boolean := current_setting('aitask.client_command_allowed', true) = 'true';
  v_parent_project_id text := nullif(btrim(coalesce(p_parent_id, '')), '');
  v_task_project_id text := nullif(btrim(coalesce(p_new_data ->> 'projectId', p_parent_id, '')), '');
  v_task_client_id text := nullif(btrim(coalesce(p_new_data ->> 'clientId', p_old_data ->> 'clientId', '')), '');
begin
  if v_member_id is null then return false; end if;
  if p_entity_type = 'task' and p_action in ('insert', 'update') then
    if v_parent_project_id is distinct from v_task_project_id
      or not private.aitask_task_project_link_is_valid(
        p_workspace_id, v_task_project_id, v_task_client_id, v_client_key
      )
      or not private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data) then
      return false;
    end if;
  end if;
  if private.aitask_is_super_admin(p_workspace_id) then
    if p_entity_type = 'custom_role' and p_entity_id = 'system-hod' and p_action = 'delete' then return false; end if;
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role in ('Admin', 'Staff') and v_creator = v_member_id
      when p_entity_type = 'project' then
        private.aitask_has_permission(p_workspace_id, 'createProjects')
        and v_creator = v_member_id
        and private.aitask_project_client_is_valid(p_workspace_id, p_new_data ->> 'clientId', v_client_key)
      when p_entity_type = 'client' then private.aitask_can_create_client(p_workspace_id)
      when p_entity_type in ('comment', 'approval') then
        v_creator = v_member_id and private.aitask_can_view_task(p_workspace_id, p_parent_id)
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
      when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id or private.aitask_is_admin(p_workspace_id)
      when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
      when p_entity_type = 'client' then private.aitask_can_delete_client(p_workspace_id)
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_entity_type = 'notification' then
    v_notification_visible :=
      coalesce(p_old_data ->> 'targetUserId', '') = v_member_id
      or coalesce(p_old_data ->> 'targetRole', '') = v_role
      or (v_role = 'Client' and lower(btrim(coalesce(p_old_data ->> 'targetClient', ''))) = private.aitask_member_client_key(p_workspace_id));
    return v_notification_visible
      and (p_old_data - 'readByUserIds' - 'isRead' - 'unreadByUserIds') = (p_new_data - 'readByUserIds' - 'isRead' - 'unreadByUserIds')
      and (
        v_new_reads = v_old_reads
        or (v_old_reads ? v_member_id and v_new_reads = (v_old_reads - v_member_id))
        or (not (v_old_reads ? v_member_id) and v_new_reads = (v_old_reads || jsonb_build_array(v_member_id)))
      );
  end if;

  return case
    when p_entity_type = 'task' then
      private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      or (v_role = 'Client' and v_command_type = 'approval.review' and v_client_command_allowed)
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
    when p_entity_type = 'project' then
      (coalesce(p_old_data ->> 'createdBy', '') = v_member_id or private.aitask_is_admin(p_workspace_id))
      and (
        coalesce(p_new_data ->> 'clientId', '') = coalesce(p_old_data ->> 'clientId', '')
        and lower(btrim(coalesce(p_new_data ->> 'clientName', ''))) = lower(btrim(coalesce(p_old_data ->> 'clientName', '')))
        or private.aitask_project_client_is_valid(p_workspace_id, p_new_data ->> 'clientId', v_client_key)
      )
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
begin
  if exists (
    select 1
    from unnest(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports']) permission_key
    where coalesce(v_permissions ->> permission_key, 'false') = 'true'
  ) then
    raise check_violation using message = 'Protected Boss Koo permissions cannot be delegated.';
  end if;
  if new.entity_id = 'system-hod' and (
    coalesce(new.data ->> 'baseRole', '') <> 'Staff'
    or coalesce(new.data ->> 'name', '') <> 'HOD'
    or coalesce((new.data ->> 'isProtected')::boolean, false) is not true
    or coalesce(new.data -> 'permissions' ->> 'manageCreatedTasks', 'false') <> 'true'
  ) then
    raise check_violation using message = 'The protected HOD identity cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_custom_role_scope() from public, anon, authenticated;
