-- Seed the Staff task context from comments and approvals too.
--
-- aitask_seed_staff_task_context only collected operations whose entityType is
-- 'task'. A Staff comment command carries no task operation (only the comment
-- and its notifications), so the context stayed empty and
-- aitask_guard_staff_notification_insert rejected the otherwise valid
-- notifications with check_violation ("Staff notifications must belong to the
-- task changed by this command."). Include the task referenced by comment and
-- approval operations so Staff work updates and approvals can notify the
-- assignee, owning Project Manager, and super admin.

create or replace function private.aitask_seed_staff_task_context(
  p_workspace_id text,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := '[]'::jsonb;
begin
  if private.aitask_member_role(p_workspace_id) = 'Staff'
    and jsonb_typeof(p_operations) = 'array' then
    select coalesce(jsonb_agg(distinct task_id), '[]'::jsonb)
      into v_context
    from (
      select nullif(btrim(operation ->> 'entityId'), '') as task_id
      from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity'
        and operation ->> 'entityType' = 'task'
        and operation ->> 'action' in ('insert', 'update', 'delete')
      union
      select nullif(btrim(coalesce(operation -> 'data' ->> 'taskId', operation ->> 'parentId')), '') as task_id
      from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity'
        and operation ->> 'entityType' in ('comment', 'approval')
    ) task_refs
    where task_id is not null;
  end if;

  perform set_config('aitask.staff_task_context', v_context::text, true);
  perform set_config('aitask.staff_delete_notice_context', '[]', true);
end;
$$;

revoke all on function private.aitask_seed_staff_task_context(text, jsonb)
  from public, anon, authenticated, service_role;
