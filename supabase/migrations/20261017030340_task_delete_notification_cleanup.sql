-- Task deletion must not require permission to delete notification records.
-- The task command remains the authorization boundary; this trigger removes
-- only task-linked notices in the same workspace after that deletion succeeds.
create or replace function private.aitask_cleanup_deleted_task_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.aitask_entities notice
  where notice.workspace_id = old.workspace_id
    and notice.entity_type = 'notification'
    and notice.data -> 'route' ->> 'page' = 'tasks'
    and notice.data -> 'route' ->> 'entityId' = old.entity_id
    -- Retain the deletion notice, including PM/Boss notices inserted before
    -- the task DELETE in the same command.
    and coalesce(notice.data ->> 'title', '') <> 'Task Deleted';
  return old;
end;
$$;
revoke all on function private.aitask_cleanup_deleted_task_notifications()
  from public, anon, authenticated, service_role;

create trigger aitask_cleanup_deleted_task_notifications
  after delete on public.aitask_entities
  for each row when (old.entity_type = 'task')
  execute function private.aitask_cleanup_deleted_task_notifications();
