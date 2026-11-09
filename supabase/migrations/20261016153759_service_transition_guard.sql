-- Enforce service-cycle transition legality at the database, matching the store's
-- allowedServiceCycleTransitions, and block reopening an Active plan that already
-- has started cycles. The frontend already validates these; this closes the
-- direct-RPC path so a crafted command cannot store an impossible state.
--
-- The guard is deliberately narrow: it only runs for the intent-specific
-- service commands from a signed-in member. Server-derived transitions (the
-- progress triggers), cron generation, migrations and test fixture setup carry a
-- different command type or no member context and are left untouched.
create or replace function private.aitask_guard_service_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old text := coalesce(old.data ->> 'status', 'Draft');
  v_new text := coalesce(new.data ->> 'status', 'Draft');
  v_command text := coalesce(current_setting('aitask.command_type', true), '');
begin
  if tg_op <> 'UPDATE' or v_new = v_old then return new; end if;

  if new.entity_type = 'service_cycle' and v_command = 'service_cycle.manage'
    and private.aitask_member_id(new.workspace_id) is not null then
    if not (
      (v_old = 'Draft' and v_new in ('Published', 'Cancelled'))
      or (v_old = 'Published' and v_new in ('Completed', 'Cancelled'))
    ) then
      raise check_violation using message = 'This cycle status transition is not allowed.';
    end if;
    if v_new = 'Completed' then
      if not exists (
        select 1 from public.aitask_entities deliverable
        where deliverable.workspace_id = new.workspace_id
          and deliverable.entity_type = 'deliverable'
          and deliverable.cycle_id = new.entity_id
      ) or exists (
        select 1 from public.aitask_entities deliverable
        where deliverable.workspace_id = new.workspace_id
          and deliverable.entity_type = 'deliverable'
          and deliverable.cycle_id = new.entity_id
          and coalesce(deliverable.data ->> 'status', 'Planned') <> 'Delivered'
      ) then
        raise check_violation using message = 'Complete every required delivery before completing this cycle.';
      end if;
    end if;
  end if;

  if new.entity_type = 'client_plan' and v_command = 'client_plan.manage'
    and v_old = 'Active' and v_new = 'Draft'
    and private.aitask_member_id(new.workspace_id) is not null then
    if exists (
      select 1 from public.aitask_entities cycle
      where cycle.workspace_id = new.workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.client_id = new.client_id
        and coalesce(cycle.data ->> 'status', 'Draft') <> 'Draft'
    ) then
      raise check_violation using message = 'Active plans with started cycles cannot return to Draft.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.aitask_guard_service_status() from public, anon, authenticated;

drop trigger if exists aitask_guard_service_status on public.aitask_entities;
create trigger aitask_guard_service_status before update of data on public.aitask_entities
  for each row execute function private.aitask_guard_service_status();
