-- Adding an add-on saves the add-on, its pricing snapshot and the add-on
-- listed on the plan's draft cycles in one addon.manage command. The service
-- command entity binding (20261023180000) allowed only addon rows, so every
-- add-on (including "Log extra request") failed with "The service command
-- contains invalid data." since 23 Oct. Let addon.manage insert pricing
-- snapshots and update draft cycles; published cycles stay protected.

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
  and not (v_command = 'client_plan.manage' and tg_op = 'INSERT' and v_entity_type in ('service_cycle', 'deliverable'))
  -- Adding an add-on saves its pricing snapshot and lists it on draft cycles.
  and not (v_command = 'addon.manage' and (
    (tg_op = 'INSERT' and v_entity_type = 'service_pricing_snapshot')
    or (tg_op = 'UPDATE' and v_entity_type = 'service_cycle' and old.data ->> 'status' = 'Draft')
  )) then
    raise check_violation using message = 'Service command does not match entity type.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_guard_service_command_entity_type() from public, anon, authenticated;
