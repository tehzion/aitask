-- Project Manager portfolio task management.
--
-- 1. A Project Manager may manage every task inside their own portfolio: tasks
--    they created or are assigned to, plus tasks in a company or project they
--    own. This mirrors their task visibility so portfolio work is editable
--    (and, through the shared helper, commentable and deletable). Another
--    Project Manager's portfolio stays out of scope.
-- 2. Drop the unused `viewAllServiceClients` from the Project Manager default
--    permission set. Service access is ownership-scoped for a Project Manager,
--    so the key never granted anything (it remains available to custom roles).

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
        private.aitask_member_role(p_workspace_id) in ('Project Manager', 'Staff')
        and (
          task.assigned_to = private.aitask_member_id(p_workspace_id)
          or task.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
      or (
        private.aitask_member_role(p_workspace_id) = 'Project Manager'
        and (
          exists (
            select 1
            from public.aitask_entities client
            where client.workspace_id = p_workspace_id
              and client.entity_type = 'client'
              and client.client_key = task.client_key
              and client.created_by = private.aitask_member_id(p_workspace_id)
          )
          or exists (
            select 1
            from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and project.entity_id = task.parent_id
              and project.created_by = private.aitask_member_id(p_workspace_id)
          )
        )
      )
      or (
        private.aitask_role_is_department_scoped(p_workspace_id)
        and coalesce(task.data ->> 'department', '') = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.auth_user_id = (select auth.uid())
        ), array[]::text[]))
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

revoke all on function private.aitask_can_edit_task(text, text) from public, anon, authenticated;
grant execute on function private.aitask_can_edit_task(text, text) to authenticated, service_role;

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
      when member.role = 'HOD' and p_permission = any(array[
        'viewAllTasks','viewAllClients','viewApprovals',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ]) then false
      when p_permission = any(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports','viewApprovals']) then false
      when member.permissions ? p_permission then member.permissions ->> p_permission = 'true'
      when custom_role.data -> 'permissions' ? p_permission then custom_role.data -> 'permissions' ->> p_permission = 'true'
      when member.role = 'HOD' and builtin_role.data -> 'permissions' ? p_permission then builtin_role.data -> 'permissions' ->> p_permission = 'true'
      when p_permission = 'viewDeliveryTracker'
        and not (member.permissions ? p_permission)
        and not (custom_role.data -> 'permissions' ? p_permission)
        and (
          (member.permissions ? 'viewProjects' and member.permissions ->> 'viewProjects' = 'true')
          or (not (member.permissions ? 'viewProjects') and custom_role.data -> 'permissions' ->> 'viewProjects' = 'true')
        ) then true
      when member.permissions <> '{}'::jsonb then false
      when custom_role.data is not null then false
      when member.role = 'Project Manager' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createProjects','createClients','deleteClients','manageServiceCatalog',
        'manageTaskTemplates','manageClientPlans','manageServiceCycles','viewServicePrices'
      ])
      when member.role = 'HOD' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createClients','deleteClients','viewAssignedServiceClients'
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
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = 'builtin-hod'
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;
