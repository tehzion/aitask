-- The service command entity-type guard (20261023180000) binds an RPC's
-- command intent to the rows that RPC writes. It also fired for rows the
-- database maintains itself: a task update cascades through the progress
-- triggers into its deliverable and service cycle, and those derived writes
-- were rejected because the command type did not name them. Check only the
-- command's own statements (trigger depth 1); derived rows keep their own
-- lifecycle guards.
--
-- Workflow generation (deliverable.workflow.generate) also saves the
-- deliverable's task list together with the generated tasks, which the
-- mapping rejected, so generating a workflow from the app failed. Allow the
-- generate command to update its deliverable; the deliverable status and
-- lifecycle guards still apply.

create or replace function private.aitask_guard_service_command_entity_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command text := coalesce(current_setting('aitask.command_type', true), '');
  v_workspace text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
begin
  if pg_trigger_depth() = 1
  and v_command in (
    'service_package.manage', 'service_workflow.manage', 'client_plan.manage',
    'service_cycle.manage', 'deliverable.manage', 'deliverable.workflow.generate',
    'cycle_comment.manage', 'addon.manage'
  )
  and private.aitask_member_id(v_workspace) is not null
  and not private.aitask_service_command_allows_entity(v_command, v_entity_type) then
    raise check_violation using message = 'Service command does not match entity type.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_guard_service_command_entity_type() from public, anon, authenticated;

create or replace function private.aitask_service_command_allows_entity(
  p_command_type text,
  p_entity_type text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'client' then p_command_type = 'client_plan.manage'
    when 'service_package' then p_command_type = 'service_package.manage'
    when 'service_workflow_template' then p_command_type = 'service_workflow.manage'
    when 'service_pricing_snapshot' then p_command_type = 'client_plan.manage'
    when 'client_plan' then p_command_type = 'client_plan.manage'
    -- A deliverable save may include its derived cycle transition atomically.
    when 'service_cycle' then p_command_type in ('service_cycle.manage', 'deliverable.manage')
    -- Workflow generation records the generated task ids on its deliverable.
    when 'deliverable' then p_command_type in ('deliverable.manage', 'deliverable.workflow.generate')
    when 'cycle_comment' then p_command_type = 'cycle_comment.manage'
    when 'addon' then p_command_type = 'addon.manage'
    -- Tasks are also accepted by the service RPC for generated workflow rows;
    -- their existing generated-task validation remains authoritative.
    when 'task' then p_command_type in (
      'deliverable.workflow.generate', 'service_package.manage',
      'service_workflow.manage', 'client_plan.manage', 'service_cycle.manage',
      'deliverable.manage', 'cycle_comment.manage', 'addon.manage'
    )
    else true
  end;
$$;

revoke all on function private.aitask_service_command_allows_entity(text, text) from public, anon, authenticated;
