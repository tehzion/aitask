-- Deleting a project unlinks its tasks in the same command: the client sends
-- the task updates first and the project delete last. The client can only
-- unlink tasks it can see, so a member who cannot see every task in a project
-- (an HOD or Staff creator, for example) could delete the project and leave
-- other members' tasks pointing at a project that no longer exists. Those
-- tasks then fail project-scoped access checks for their PM and HOD.
--
-- Refuse a member's project delete while any task still links to it. Tasks
-- unlinked earlier in the same command are already updated when this runs,
-- so an ordinary delete by someone who sees every task is unaffected.
-- check_violation keeps the rejection a validation result of the command RPC.
-- Deletes without a signed-in member (service role, workspace cleanup) skip
-- the check, matching the other entity guards. So does company deletion
-- (aitask.cascade_delete), which removes the company's projects and tasks in
-- one statement, so its projects are deleted while their tasks still exist.

create or replace function private.aitask_guard_project_delete_linked_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.entity_type <> 'project' or (select auth.uid()) is null
    or coalesce(current_setting('aitask.cascade_delete', true), '') = 'true' then
    return old;
  end if;
  if exists (
    select 1
    from public.aitask_entities task
    where task.workspace_id = old.workspace_id
      and task.entity_type = 'task'
      and task.data ->> 'projectId' = old.entity_id
  ) then
    raise check_violation using
      message = 'This project still has linked tasks. Unlink them before deleting the project.';
  end if;
  return old;
end;
$$;

revoke all on function private.aitask_guard_project_delete_linked_tasks() from public, anon, authenticated, service_role;

drop trigger if exists aitask_guard_project_delete_linked_tasks on public.aitask_entities;
create trigger aitask_guard_project_delete_linked_tasks
  before delete on public.aitask_entities
  for each row execute function private.aitask_guard_project_delete_linked_tasks();
