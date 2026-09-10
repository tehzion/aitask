-- Companies/client tracker split and Boss-only Staff/HOD permission management.

-- Repeat the secure-cutover privilege boundary in this forward migration so a
-- repaired or manually-restored production grant converges to the same state.
revoke all on function public.aitask_is_internal_app_origin() from public, anon, authenticated;
revoke all on function public.aitask_app_state_health() from public, anon, authenticated;
revoke all on function private.aitask_app_state_health() from public, anon, authenticated;
revoke usage on schema private from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
revoke insert, update, delete, truncate, trigger, references
  on public.aitask_members, public.aitask_entities
  from authenticated;
revoke all on public.aitask_app_state from anon, authenticated;
revoke all on public.aitask_command_receipts, public.aitask_release_notice_acknowledgements
  from authenticated;
grant select on public.aitask_workspaces, public.aitask_members, public.aitask_entities
  to authenticated;
grant select on public.aitask_audit_events to authenticated;

-- Preserve existing access when introducing the dedicated tracker permission.
update public.aitask_entities
set data = jsonb_set(
      jsonb_set(
        data,
        '{permissions}',
        (
          coalesce(data -> 'permissions', '{}'::jsonb)
          - 'editTasks' - 'manageUsers' - 'approveRegistrations' - 'deleteUsers' - 'viewProductionReports'
        ) || jsonb_build_object(
          'editTasks', false,
          'manageUsers', false,
          'approveRegistrations', false,
          'deleteUsers', false,
          'viewProductionReports', false
        ),
        true
      ),
      '{permissions,viewDeliveryTracker}',
      to_jsonb(coalesce(
        (data -> 'permissions' ->> 'viewDeliveryTracker')::boolean,
        (data -> 'permissions' ->> 'viewProjects')::boolean,
        false
      )),
      true
    ),
    version = version + 1,
    updated_at = now()
where entity_type = 'custom_role'
  and data ? 'permissions';

update public.aitask_members
set permissions = jsonb_set(
      (
        coalesce(permissions, '{}'::jsonb)
        - 'editTasks' - 'manageUsers' - 'approveRegistrations' - 'deleteUsers' - 'viewProductionReports'
      ) || jsonb_build_object(
        'editTasks', false,
        'manageUsers', false,
        'approveRegistrations', false,
        'deleteUsers', false,
        'viewProductionReports', false
      ),
      '{viewDeliveryTracker}',
      to_jsonb(coalesce((permissions ->> 'viewDeliveryTracker')::boolean, (permissions ->> 'viewProjects')::boolean, false)),
      true
    ),
    version = version + 1,
    updated_at = now()
where permissions <> '{}'::jsonb
  and permissions is not null;

update public.aitask_entities
set data = jsonb_set(
      data,
      '{permissions}',
      coalesce(data -> 'permissions', '{}'::jsonb) || jsonb_build_object(
        'editTasks', false,
        'manageUsers', false,
        'approveRegistrations', false,
        'deleteUsers', false,
        'viewProductionReports', false
      ),
      true
    ),
    version = version + 1,
    updated_at = now()
where entity_type = 'custom_role'
  and exists (
    select 1
    from unnest(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports']) permission_key
    where coalesce(data -> 'permissions' ->> permission_key, 'false') <> 'false'
  );

update public.aitask_members
set permissions = permissions || jsonb_build_object(
      'editTasks', false,
      'manageUsers', false,
      'approveRegistrations', false,
      'deleteUsers', false,
      'viewProductionReports', false
    ),
    version = version + 1,
    updated_at = now()
where permissions <> '{}'::jsonb
  and exists (
    select 1
    from unnest(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports']) permission_key
    where coalesce(permissions ->> permission_key, 'false') <> 'false'
  );

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
        'manageAssignedClients','viewReports','viewSettings','createTasks','manageCreatedTasks','createProjects',
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

-- HOD remains an immutable protected identity, but Boss Koo may change its safe
-- permission matrix through the standard optimistic workspace command.
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
  if private.aitask_is_super_admin(p_workspace_id) then
    if p_entity_type = 'custom_role' and p_entity_id = 'system-hod' and p_action = 'delete' then return false; end if;
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role in ('Admin', 'Staff') and v_creator = v_member_id
      when p_entity_type = 'project' then private.aitask_has_permission(p_workspace_id, 'createProjects') and v_creator = v_member_id
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
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
    when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;

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
  ) then
    raise check_violation using message = 'The protected HOD identity cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_custom_role_scope() from public, anon, authenticated;

create or replace function private.aitask_guard_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_data jsonb;
begin
  if exists (
    select 1
    from unnest(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports']) permission_key
    where coalesce(new.permissions ->> permission_key, 'false') = 'true'
  ) then
    raise check_violation using message = 'Protected Boss Koo permissions cannot be delegated.';
  end if;
  if new.custom_role_id is null then return new; end if;
  select entity.data into v_role_data
  from public.aitask_entities entity
  where entity.workspace_id = new.workspace_id
    and entity.entity_type = 'custom_role'
    and entity.entity_id = new.custom_role_id;
  if v_role_data is null or v_role_data ->> 'baseRole' is distinct from new.role then
    raise check_violation using message = 'Custom role base role must match the member role.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_member_role_scope() from public, anon, authenticated;

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
    'manageAssignedClients','viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks','createProjects',
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

revoke all on function public.aitask_update_member_permissions(text, uuid, text, jsonb, bigint)
  from public, anon;
grant execute on function public.aitask_update_member_permissions(text, uuid, text, jsonb, bigint)
  to authenticated, service_role;

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
    'memberPermissionManagement', v_member_permission_management
  );
end;
$$;

revoke all on function public.aitask_get_backend_capabilities(text) from public, anon;
grant execute on function public.aitask_get_backend_capabilities(text) to authenticated, service_role;

notify pgrst, 'reload schema';
