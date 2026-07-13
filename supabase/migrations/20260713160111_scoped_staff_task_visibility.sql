-- Scope Staff task reads to assigned or created work unless explicitly elevated.

create or replace function private.aitask_can_view_task(p_workspace_id text, p_task_id text)
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
        or private.aitask_has_permission(p_workspace_id, 'editTasks')
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
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

create or replace function private.aitask_can_edit_task(p_workspace_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.aitask_is_admin(p_workspace_id)
      or (
        private.aitask_member_role(p_workspace_id) = 'Staff'
        and (
          private.aitask_has_permission(p_workspace_id, 'editTasks')
          or task.assigned_to = private.aitask_member_id(p_workspace_id)
          or task.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_view_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.aitask_member_role(p_workspace_id)
    when 'Admin' then true
    when 'Client' then p_client_key = private.aitask_member_client_key(p_workspace_id)
    when 'Staff' then private.aitask_has_permission(p_workspace_id, 'viewAllClients') or exists (
      select 1
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_key = p_client_key
        and private.aitask_can_view_task(p_workspace_id, task.entity_id)
    )
    else false
  end;
$$;

create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
      when 'Client' then project.client_key = private.aitask_member_client_key(p_workspace_id)
      when 'Staff' then project.created_by = private.aitask_member_id(p_workspace_id) or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.parent_id = p_project_id
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
      else false
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
    limit 1
  ), false);
$$;

drop policy if exists "members can update authorized entities" on public.aitask_entities;
create policy "members can update authorized entities" on public.aitask_entities
  for update to authenticated
  using (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task' and private.aitask_can_edit_task(workspace_id, entity_id))
    or (entity_type = 'client' and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'project' and created_by = private.aitask_member_id(workspace_id))
    or (entity_type in ('comment', 'approval') and created_by = private.aitask_member_id(workspace_id))
  )
  with check (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task'
      and private.aitask_member_role(workspace_id) = 'Staff'
      and (
        private.aitask_has_permission(workspace_id, 'editTasks')
        or assigned_to = private.aitask_member_id(workspace_id)
        or created_by = private.aitask_member_id(workspace_id)
      ))
    or (entity_type = 'client' and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'project' and created_by = private.aitask_member_id(workspace_id))
    or (entity_type in ('comment', 'approval') and created_by = private.aitask_member_id(workspace_id))
  );

revoke all on function private.aitask_can_view_task(text, text) from public;
revoke all on function private.aitask_can_edit_task(text, text) from public;
revoke all on function private.aitask_can_view_client(text, text) from public;
revoke all on function private.aitask_can_view_project(text, text) from public;
grant execute on function private.aitask_can_view_task(text, text) to authenticated;
grant execute on function private.aitask_can_edit_task(text, text) to authenticated;
grant execute on function private.aitask_can_view_client(text, text) to authenticated;
grant execute on function private.aitask_can_view_project(text, text) to authenticated;
