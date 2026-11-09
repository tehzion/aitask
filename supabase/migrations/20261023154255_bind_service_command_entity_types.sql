-- Bind service RPC command intent to the entity types it is allowed to mutate.
--
-- The service RPC deliberately supports atomic multi-row writes. A deliverable
-- update may therefore include its derived service_cycle update, but unrelated
-- service commands must not be able to impersonate that intent. Without this
-- guard, the lifecycle trigger could be skipped by using another valid service
-- command type in the session setting.

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
    when 'deliverable' then p_command_type = 'deliverable.manage'
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
  if v_command in (
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

drop trigger if exists aitask_guard_service_command_entity_type on public.aitask_entities;
create trigger aitask_guard_service_command_entity_type
  before insert or update or delete on public.aitask_entities
  for each row execute function private.aitask_guard_service_command_entity_type();

-- The parent cycle is a legitimate part of deliverable completion. Apply the
-- same lifecycle rules to that derived command so the allowed exception cannot
-- be used to bypass Draft/Published/Completed transitions.
create or replace function private.aitask_guard_service_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old text := coalesce(old.data ->> 'status', 'Draft');
  v_new text := coalesce(new.data ->> 'status', 'Draft');
  v_command text := coalesce(current_setting('aitask.command_type', true), '');
begin
  if tg_op <> 'UPDATE' or v_new = v_old then return new; end if;

  if new.entity_type = 'service_cycle'
    and v_command in ('service_cycle.manage', 'deliverable.manage')
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
