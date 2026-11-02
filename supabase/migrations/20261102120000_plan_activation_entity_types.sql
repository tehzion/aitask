-- Activating a client plan creates its first service cycle and that cycle's
-- deliverables in the same client_plan.manage command (with its pricing
-- snapshot). Since 20261023180000 bound each service command to its entity
-- types, client_plan.manage could not write service_cycle or deliverable rows,
-- so every plan activation was rejected with "The service command contains
-- invalid data." Let a plan save insert new cycles and deliverables only; it
-- still cannot update or delete existing ones (those stay with the cycle and
-- deliverable commands). The entity mapping itself is unchanged.

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
  and not private.aitask_service_command_allows_entity(v_command, v_entity_type)
  -- Plan activation creates the plan's first cycle and its deliverables.
  and not (v_command = 'client_plan.manage' and tg_op = 'INSERT' and v_entity_type in ('service_cycle', 'deliverable')) then
    raise check_violation using message = 'Service command does not match entity type.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_guard_service_command_entity_type() from public, anon, authenticated;

-- Restore the mapping to its 20261028130000 form (an earlier hotfix of this
-- migration widened it for updates as well).
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
