-- v2.1.5: HOD task ownership permissions.
--
-- The legacy editTasks key remains readable for old snapshots, but only the
-- super-admin may use it. Staff-based HOD access is creator/assignee scoped.

create or replace function private.aitask_has_permission(
  p_workspace_id text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when p_permission = 'editTasks' then false
      when member.permissions <> '{}'::jsonb then coalesce(member.permissions ->> p_permission = 'true', false)
      when custom_role.data is not null then coalesce(custom_role.data -> 'permissions' ->> p_permission = 'true', false)
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewAllTasks','viewAllClients',
        'manageAssignedClients','viewReports','viewSettings','createTasks','manageCreatedTasks','createProjects',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewAssignedServiceClients','viewServicePrices','viewProductionReports'
      ]::text[])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewReports','viewSettings','createTasks',
        'viewAssignedServiceClients','viewProductionReports'
      ]::text[])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewReports','viewSettings','clientReview'
      ]::text[])
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
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated;

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
  v_old_creator text := coalesce(p_old_data ->> 'createdBy', p_old_data ->> 'userId', '');
  v_new_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', '');
  v_actor_member_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
begin
  if p_action = 'update' and v_old_creator is distinct from v_new_creator then
    return false;
  end if;

  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department then
    return true;
  end if;
  if v_new_assignee = '' or v_new_department is null then return false; end if;

  if p_action = 'insert' and v_actor_role = 'Staff' then
    if v_new_creator <> v_actor_member_id
      or not exists (
        select 1 from public.aitask_members actor
        where actor.workspace_id = p_workspace_id
          and actor.id = v_actor_member_id
          and v_new_department = any(actor.departments)
      ) then
      return false;
    end if;
    if v_new_assignee <> v_actor_member_id
      and not private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks') then
      return false;
    end if;
  end if;

  if p_action = 'update'
    and not private.aitask_is_super_admin(p_workspace_id)
    and not (
      v_old_creator = v_actor_member_id
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
    ) then
    return false;
  end if;

  if p_action = 'update'
    and v_actor_role = 'Staff'
    and not exists (
      select 1 from public.aitask_members actor
      where actor.workspace_id = p_workspace_id
        and actor.id = v_actor_member_id
        and v_new_department = any(actor.departments)
    ) then
    return false;
  end if;

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

revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb)
  from public, anon, authenticated;

-- Remove the Admin-wide mutation bypass while preserving Admin visibility.
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
    if p_entity_type = 'custom_role' and p_entity_id = 'system-hod' then return false; end if;
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role in ('Admin', 'Staff') and v_creator = v_member_id
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

-- Custom roles cannot grant global editing and the protected HOD role cannot be
-- modified through the generic workspace command path.
create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
begin
  if v_permissions ->> 'editTasks' = 'true' then
    raise check_violation using message = 'Only Boss Koo can manage every task.';
  end if;
  if new.entity_id = 'system-hod' and (
    coalesce(new.data ->> 'baseRole', '') <> 'Staff'
    or coalesce(new.data ->> 'name', '') <> 'HOD'
    or coalesce((new.data ->> 'isProtected')::boolean, false) is not true
    or coalesce(v_permissions ->> 'manageCreatedTasks', 'false') <> 'true'
  ) then
    raise check_violation using message = 'The protected HOD role cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_custom_role_scope() from public, anon, authenticated;
drop trigger if exists aitask_00_guard_custom_role_scope on public.aitask_entities;
create trigger aitask_00_guard_custom_role_scope
  before insert or update on public.aitask_entities
  for each row
  when (new.entity_type = 'custom_role')
  execute function private.aitask_guard_custom_role_scope();

create or replace function private.aitask_guard_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_data jsonb;
begin
  if new.permissions ->> 'editTasks' = 'true' then
    raise check_violation using message = 'Only Boss Koo can manage every task.';
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
drop trigger if exists aitask_00_guard_member_role_scope on public.aitask_members;
create trigger aitask_00_guard_member_role_scope
  before insert or update on public.aitask_members
  for each row
  execute function private.aitask_guard_member_role_scope();

-- Add the protected role once per workspace. No existing member is promoted.
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data, created_at, updated_at)
select
  workspace.id,
  'custom_role',
  'system-hod',
  jsonb_build_object(
    'id', 'system-hod',
    'name', 'HOD',
    'description', 'Staff lead who manages tasks they create and tasks assigned to them.',
    'baseRole', 'Staff',
    'isProtected', true,
    'permissions', jsonb_build_object(
      'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true, 'viewProjects', true,
      'viewAllTasks', false, 'viewAllClients', false, 'manageAssignedClients', false,
      'viewReports', true, 'viewApprovals', false, 'viewSettings', true,
      'createTasks', true, 'editTasks', false, 'manageCreatedTasks', true,
      'createProjects', false, 'manageUsers', false, 'approveRegistrations', false,
      'deleteUsers', false, 'clientReview', false, 'manageServiceCatalog', false,
      'manageTaskTemplates', false, 'manageClientPlans', false, 'manageServiceCycles', false,
      'viewAllServiceClients', false, 'viewAssignedServiceClients', true,
      'viewServicePrices', false, 'viewProductionReports', true
    ),
    'createdAt', now(),
    'updatedAt', now()
  ),
  now(),
  now()
from public.aitask_workspaces workspace
where not exists (
  select 1 from public.aitask_entities existing
  where existing.workspace_id = workspace.id
    and existing.entity_type = 'custom_role'
    and existing.entity_id = 'system-hod'
);

-- Make old and new clients stop mutating while this authorization contract is
-- being cut over. The frontend requires exact schema version 3.
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

  return jsonb_build_object(
    'ok', v_workspace_optimistic_lock and v_service_operations and v_release_notice_acknowledgements,
    'schemaVersion', 3,
    'workspaceOptimisticLock', v_workspace_optimistic_lock,
    'serviceOperations', v_service_operations,
    'releaseNoticeAcknowledgements', v_release_notice_acknowledgements
  );
end;
$$;

notify pgrst, 'reload schema';
