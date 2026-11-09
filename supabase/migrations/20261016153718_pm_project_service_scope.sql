-- Align PM service-client access with the client helper.
--
-- canOpenServiceClient grants a Project Manager access to a company they own, a
-- company with a task they created/were assigned, or a company with a project
-- they can see (getVisibleProjects -> project.created_by). The database branch of
-- aitask_can_access_service_client checked only client ownership and viewable
-- tasks, so a PM-owned project on a company with no tasks passed the browser but
-- was rejected by aitask_guard_pm_service_scope ("This company is outside your
-- portfolio."). Add the PM-created-project clause.

create or replace function private.aitask_can_access_service_client(p_workspace_id text, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.aitask_is_super_admin(p_workspace_id) then true
    when private.aitask_member_role(p_workspace_id) = 'Project Manager' then
      exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.entity_id = p_client_id
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
      or exists (
        select 1
        from public.aitask_entities task
        join public.aitask_entities client
          on client.workspace_id = task.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and (task.client_id = p_client_id or task.client_key = client.client_key)
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
      or exists (
        select 1
        from public.aitask_entities project
        join public.aitask_entities client
          on client.workspace_id = project.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where project.workspace_id = p_workspace_id
          and project.entity_type = 'project'
          and project.created_by = private.aitask_member_id(p_workspace_id)
          and (project.parent_id = p_client_id or project.client_key = client.client_key)
      )
    else
      coalesce(
        private.aitask_has_permission(p_workspace_id, 'viewAllServiceClients')
        or private.aitask_has_permission(p_workspace_id, 'manageClientPlans')
        or private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.entity_id = p_client_id
            and client.client_key = private.aitask_member_client_key(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Client'
        )
        or exists (
          select 1 from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.client_id = p_client_id
            and task.assigned_to = private.aitask_member_id(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Staff'
            and private.aitask_has_permission(p_workspace_id, 'viewAssignedServiceClients')
        ), false
      )
  end;
$$;
revoke all on function private.aitask_can_access_service_client(text, text) from public, anon;
grant execute on function private.aitask_can_access_service_client(text, text) to authenticated, service_role;
