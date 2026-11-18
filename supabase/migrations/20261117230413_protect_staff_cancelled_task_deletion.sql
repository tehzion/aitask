-- Cancelled work is terminal and must retain its audit trail. Ordinary Staff
-- may still delete Pending and Revision work, but cannot erase a cancelled
-- task. HOD, portfolio PM, and Boss Koo deletion authority remains unchanged.
create or replace function private.aitask_can_delete_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_can_delete_task_legacy_role(p_workspace_id, p_task_id)
    and (
      private.aitask_is_super_admin(p_workspace_id)
      or private.aitask_member_role(p_workspace_id) <> 'Staff'
      or private.aitask_is_hod(p_workspace_id)
      or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.entity_id = p_task_id
          and coalesce(task.data ->> 'status', '') <> 'Cancelled'
      )
    )
    and (
      private.aitask_is_super_admin(p_workspace_id)
      or private.aitask_member_role(p_workspace_id) <> 'Project Manager'
      or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.entity_id = p_task_id
          and (
            task.created_by = private.aitask_member_id(p_workspace_id)
            or (
              nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is not null
              and private.aitask_project_manager_id_is_assigned(
                p_workspace_id,
                coalesce(task.data ->> 'projectId', task.parent_id),
                private.aitask_member_id(p_workspace_id)
              )
            )
            or (
              nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
              and exists (
                select 1
                from public.aitask_entities client
                where client.workspace_id = p_workspace_id
                  and client.entity_type = 'client'
                  and (
                    (task.client_id is not null and client.entity_id = task.client_id)
                    or (task.client_id is null and client.client_key = task.client_key)
                  )
                  and client.created_by = private.aitask_member_id(p_workspace_id)
              )
            )
          )
      )
    );
$$;

revoke all on function private.aitask_can_delete_task(text,text)
  from public, anon, authenticated, service_role;
