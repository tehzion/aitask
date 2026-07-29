-- AiTask v1.6.12 follow-up: Staff may create tasks only in their own departments.
-- Existing assignments remain valid unless their assignee or department changes.

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
  v_actor_member_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
begin
  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department then
    return true;
  end if;
  if v_new_assignee = '' or v_new_department is null then return false; end if;

  if p_action = 'insert' and v_actor_role = 'Staff' and not exists (
    select 1
    from public.aitask_members actor
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
