-- Project Manager portfolio task reassignment.
--
-- `aitask_can_edit_task` already lets a Project Manager manage every task in
-- their own portfolio (created/assigned, or inside a company/project they own),
-- but `aitask_task_assignment_is_valid` still rejected any assignee or
-- department change when the actor was not the task creator. That made a PM
-- reassignment of someone else's portfolio task fail with
-- "You do not have permission to make this change." and left the change stuck
-- as a retry.
--
-- This aligns the assignment helper with `aitask_can_edit_task`: a Project
-- Manager may change the assignee/department of a portfolio task. Every other
-- rule is unchanged (creator is immutable, Staff rules untouched, and the new
-- assignee must still be a non-client member in the task department).

create or replace function private.aitask_task_assignment_is_valid(
  p_workspace_id text,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
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
  if v_new_department is null then return false; end if;

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
    if v_new_assignee <> ''
      and v_new_assignee <> v_actor_member_id
      and not private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks') then
      return false;
    end if;
  end if;

  if p_action = 'update'
    and not private.aitask_is_super_admin(p_workspace_id)
    and not (
      v_old_creator = v_actor_member_id
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
    )
    and not (
      v_actor_role = 'Project Manager'
      and (
        v_old_assignee = v_actor_member_id
        or v_old_creator = v_actor_member_id
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')))
            and client.created_by = v_actor_member_id
        )
        or exists (
          select 1 from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = nullif(btrim(coalesce(p_new_data ->> 'projectId', p_old_data ->> 'projectId', '')), '')
            and project.created_by = v_actor_member_id
        )
      )
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

  if v_new_assignee = '' then return true; end if;

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
