-- Client service plans, monthly cycles, deliverables, comments, add-ons and private files.
-- The service command endpoint is intentionally separate from the established task command RPC.

alter table public.aitask_entities drop constraint if exists aitask_entities_entity_type_check;
alter table public.aitask_entities add constraint aitask_entities_entity_type_check check (entity_type in (
  'client', 'project', 'task', 'comment', 'approval', 'notification',
  'registration', 'custom_role', 'task_status', 'service_package',
  'client_plan', 'service_cycle', 'deliverable', 'cycle_comment', 'addon',
  'service_workflow_template', 'service_pricing_snapshot'
));

alter table public.aitask_members
  add column if not exists worker_type text not null default 'employee';
alter table public.aitask_members drop constraint if exists aitask_members_worker_type_check;
alter table public.aitask_members add constraint aitask_members_worker_type_check
  check (worker_type in ('employee', 'supplier', 'freelancer'));

create or replace function private.aitask_guard_worker_type()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is not null and new.worker_type is distinct from old.worker_type
    and not private.aitask_is_super_admin(old.workspace_id) then
    raise check_violation using message='Only the Super Admin can change worker type.';
  end if;
  return new;
end; $$;
drop trigger if exists aitask_guard_worker_type on public.aitask_members;
create trigger aitask_guard_worker_type before update on public.aitask_members
  for each row execute function private.aitask_guard_worker_type();
revoke all on function private.aitask_guard_worker_type() from public,anon,authenticated;

-- Extend backend fallback permissions to match the frontend service capabilities.
create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when member.permissions <> '{}'::jsonb then coalesce(member.permissions ->> p_permission = 'true', false)
      when custom_role.data is not null then coalesce(custom_role.data -> 'permissions' ->> p_permission = 'true', false)
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewAllTasks','viewAllClients',
        'manageAssignedClients','viewReports','viewSettings','createTasks','editTasks','createProjects',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewAssignedServiceClients','viewServicePrices','viewProductionReports'
      ]::text[])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewReports','viewSettings','createTasks',
        'viewAssignedServiceClients','viewProductionReports'
      ]::text[])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewReports','viewSettings','clientReview'
      ]::text[])
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;
revoke all on function private.aitask_has_permission(text,text) from public, anon;
grant execute on function private.aitask_has_permission(text,text) to authenticated, service_role;

-- Keep immutable audit history limited to the protected Boss identity. An
-- earlier compatibility migration temporarily broadened this policy to Admin.
drop policy if exists "mfa admins can read audit events" on public.aitask_audit_events;
drop policy if exists "admins can read audit events" on public.aitask_audit_events;
drop policy if exists "super admins can read audit events" on public.aitask_audit_events;
create policy "super admins can read audit events" on public.aitask_audit_events
  for select to authenticated
  using (private.aitask_is_super_admin(workspace_id));

alter table public.aitask_entities
  add column if not exists client_id text,
  add column if not exists plan_id text,
  add column if not exists cycle_id text,
  add column if not exists period_start date,
  add column if not exists next_cycle_start date;

create index if not exists aitask_entities_client_id_idx on public.aitask_entities(workspace_id, client_id);
create index if not exists aitask_entities_plan_id_idx on public.aitask_entities(workspace_id, plan_id);
create index if not exists aitask_entities_cycle_id_idx on public.aitask_entities(workspace_id, cycle_id);
drop index if exists public.aitask_service_cycle_period_uidx;
create unique index aitask_service_cycle_period_uidx
  on public.aitask_entities(workspace_id, client_id, period_start)
  where entity_type = 'service_cycle';
create unique index if not exists aitask_one_active_client_plan_uidx
  on public.aitask_entities(workspace_id, client_id)
  where entity_type = 'client_plan' and data ->> 'status' = 'Active';
create index if not exists aitask_service_due_plan_idx
  on public.aitask_entities(workspace_id, next_cycle_start)
  where entity_type = 'client_plan' and data ->> 'status' = 'Active' and next_cycle_start is not null;

create or replace function private.aitask_project_service_entity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.client_id := nullif(btrim(new.data ->> 'clientId'), '');
  new.plan_id := nullif(btrim(coalesce(new.data ->> 'planId', case when new.entity_type = 'client_plan' then new.entity_id end)), '');
  new.cycle_id := nullif(btrim(coalesce(new.data ->> 'cycleId', case when new.entity_type = 'service_cycle' then new.entity_id end)), '');
  new.period_start := case
    when new.entity_type = 'service_cycle' and coalesce(new.data ->> 'periodStart', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.data ->> 'periodStart')::date
    else null
  end;
  new.next_cycle_start := case
    when new.entity_type = 'client_plan' and coalesce(new.data ->> 'nextCycleStart', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (new.data ->> 'nextCycleStart')::date
    else null
  end;
  return new;
end;
$$;

drop trigger if exists aitask_project_service_entity on public.aitask_entities;
create trigger aitask_project_service_entity
  before insert or update on public.aitask_entities
  for each row execute function private.aitask_project_service_entity();
revoke all on function private.aitask_project_service_entity() from public, anon, authenticated;

-- Create canonical client records for legacy name-only work, then link tasks and projects.
with discovered as (
  select workspace_id, client_key, max(data ->> 'clientName') as client_name
  from public.aitask_entities
  where entity_type in ('task', 'project') and coalesce(client_key, '') <> ''
  group by workspace_id, client_key
), missing as (
  select discovered.*,
    'CL-migrated-' || substr(md5(discovered.workspace_id || ':' || discovered.client_key), 1, 24) as client_id
  from discovered
  where not exists (
    select 1 from public.aitask_entities client
    where client.workspace_id = discovered.workspace_id
      and client.entity_type = 'client'
      and client.client_key = discovered.client_key
  )
)
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
select workspace_id, 'client', client_id, jsonb_build_object(
  'id', client_id, 'clientName', client_name,
  'createdAt', now(), 'updatedAt', now()
)
from missing
on conflict do nothing;

update public.aitask_entities work
set data = work.data || jsonb_build_object('clientId', client.entity_id),
    client_id = client.entity_id
from public.aitask_entities client
where work.workspace_id = client.workspace_id
  and work.entity_type in ('task', 'project')
  and client.entity_type = 'client'
  and work.client_key = client.client_key
  and coalesce(work.data ->> 'clientId', '') = '';

update public.aitask_entities
set client_id = nullif(btrim(data ->> 'clientId'), ''),
    plan_id = nullif(btrim(data ->> 'planId'), ''),
    cycle_id = nullif(btrim(data ->> 'cycleId'), ''),
    period_start = case when entity_type = 'service_cycle' and coalesce(data ->> 'periodStart', '') ~ '^\d{4}-\d{2}-\d{2}$' then (data ->> 'periodStart')::date else null end,
    next_cycle_start = case when entity_type = 'client_plan' and coalesce(data ->> 'nextCycleStart', '') ~ '^\d{4}-\d{2}-\d{2}$' then (data ->> 'nextCycleStart')::date else null end;

-- One-time conversion for any local pre-release service rows: preserve price
-- history in a protected entity, then redact operational rows in place.
with source as (
  select entity.*,
    'PRICE-migrated-'||substr(md5(entity.workspace_id||':'||entity.entity_type||':'||entity.entity_id),1,24) price_id,
    case when entity.entity_type='addon'
      then coalesce((entity.data->>'quantity')::integer,0)*coalesce((entity.data->>'unitPriceMinor')::integer,0)
      else coalesce((select sum(coalesce((item->>'quantity')::integer,0)*coalesce((item->>'unitPriceMinor')::integer,0)) from jsonb_array_elements(coalesce(entity.data->'serviceItems','[]'::jsonb)) item),0)
    end subtotal
  from public.aitask_entities entity where entity.entity_type in ('client_plan','service_cycle','addon')
), priced as (
  select source.*,
    case
      when coalesce(data->>'discountType','none')='percent' then round(subtotal*least(10000,greatest(0,coalesce((data->>'discountValue')::integer,0)))/10000.0)::integer
      when coalesce(data->>'discountType','none')='fixed' then least(subtotal,greatest(0,coalesce((data->>'discountValue')::integer,0)))
      else 0 end discount_minor
  from source
)
insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
select workspace_id,'service_pricing_snapshot',price_id,entity_id,jsonb_build_object(
  'id',price_id,'clientId',client_id,'parentType',case entity_type when 'client_plan' then 'client_plan' when 'service_cycle' then 'service_cycle' else 'addon' end,
  'parentId',entity_id,'currency','MYR','itemPrices',case when entity_type='addon' then '[]'::jsonb else (
    select coalesce(jsonb_agg(jsonb_build_object('serviceItemId',item->>'id','unitPriceMinor',coalesce((item->>'unitPriceMinor')::integer,0))),'[]'::jsonb)
    from jsonb_array_elements(coalesce(data->'serviceItems','[]'::jsonb)) item) end,
  'addonUnitPriceMinor',case when entity_type='addon' then coalesce((data->>'unitPriceMinor')::integer,0) else null end,
  'discountType',coalesce(data->>'discountType','none'),'discountValue',coalesce((data->>'discountValue')::integer,0),
  'taxRateBps',coalesce((data->>'taxRateBps')::integer,0),'subtotalMinor',subtotal,'discountMinor',discount_minor,
  'taxMinor',round(greatest(0,subtotal-discount_minor)*least(10000,greatest(0,coalesce((data->>'taxRateBps')::integer,0)))/10000.0)::integer,
  'totalMinor',greatest(0,subtotal-discount_minor)+round(greatest(0,subtotal-discount_minor)*least(10000,greatest(0,coalesce((data->>'taxRateBps')::integer,0)))/10000.0)::integer,
  'createdAt',coalesce(data->>'createdAt',now()::text),'updatedAt',now()
) from priced on conflict do nothing;

update public.aitask_entities entity set data=(entity.data||jsonb_build_object(
  'pricingSnapshotId','PRICE-migrated-'||substr(md5(entity.workspace_id||':'||entity.entity_type||':'||entity.entity_id),1,24),
  'serviceItems',(select coalesce(jsonb_agg(item||jsonb_build_object('unitPriceMinor',0)),'[]'::jsonb) from jsonb_array_elements(coalesce(entity.data->'serviceItems','[]'::jsonb)) item),
  'addonSnapshots',(select coalesce(jsonb_agg(item||jsonb_build_object('unitPriceMinor',0)),'[]'::jsonb) from jsonb_array_elements(coalesce(entity.data->'addonSnapshots','[]'::jsonb)) item),
  'discountType','none','discountValue',0,'taxRateBps',0,'updatedAt',now()
)) where entity.entity_type in ('client_plan','service_cycle');
update public.aitask_entities entity set data=(entity.data||jsonb_build_object(
  'pricingSnapshotId','PRICE-migrated-'||substr(md5(entity.workspace_id||':'||entity.entity_type||':'||entity.entity_id),1,24),
  'unitPriceMinor',0,'updatedAt',now()
)) where entity.entity_type='addon';

create or replace function private.aitask_can_access_service_client(p_workspace_id text, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.aitask_has_permission(p_workspace_id, 'viewAllServiceClients')
    or private.aitask_has_permission(p_workspace_id, 'manageClientPlans')
    or private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')
    or exists (
      select 1 from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.entity_id = p_client_id
        and client.client_key = private.aitask_member_client_key(p_workspace_id)
        and private.aitask_member_role(p_workspace_id) = 'Client'
    )
    or exists (
      select 1 from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_id = p_client_id
        and task.assigned_to = private.aitask_member_id(p_workspace_id)
        and private.aitask_member_role(p_workspace_id) = 'Staff'
        and private.aitask_has_permission(p_workspace_id, 'viewAssignedServiceClients')
    ), false
  );
$$;
revoke all on function private.aitask_can_access_service_client(text, text) from public, anon;
grant execute on function private.aitask_can_access_service_client(text, text) to authenticated, service_role;

alter policy "members can read scoped entities" on public.aitask_entities
  using (
    (entity_type = 'task' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type = 'task_status' and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'custom_role' and (private.aitask_member_role(workspace_id) <> 'Client' or exists (
      select 1 from public.aitask_members member where member.workspace_id = aitask_entities.workspace_id
        and member.auth_user_id = (select auth.uid()) and member.custom_role_id = aitask_entities.entity_id
    )))
    or (entity_type = 'registration' and private.aitask_is_super_admin(workspace_id))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client' and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
    or (entity_type = 'service_package' and private.aitask_has_permission(workspace_id, 'manageServiceCatalog'))
    or (entity_type = 'service_workflow_template' and private.aitask_has_permission(workspace_id, 'manageTaskTemplates'))
    or (entity_type = 'service_pricing_snapshot' and private.aitask_has_permission(workspace_id, 'viewServicePrices'))
    or (entity_type in ('client_plan', 'addon')
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_access_service_client(workspace_id, client_id))
    or (entity_type in ('service_cycle', 'deliverable', 'cycle_comment')
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_access_service_client(workspace_id, client_id))
  );

create or replace function public.aitask_execute_service_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_existing jsonb;
  v_op jsonb;
  v_type text;
  v_id text;
  v_action text;
  v_parent text;
  v_expected bigint;
  v_actual bigint;
  v_old jsonb;
  v_new jsonb;
  v_client_id text;
  v_version bigint;
  v_updated timestamptz;
  v_changed jsonb := '[]'::jsonb;
  v_deleted jsonb := '[]'::jsonb;
  v_workspace_version bigint;
  v_response jsonb;
begin
  if (select auth.uid()) is null or v_actor_id is null or v_role = 'Client' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service workspace membership required.');
  end if;
  if p_command_type not in ('service_package.manage', 'service_workflow.manage', 'client_plan.manage', 'service_cycle.manage', 'deliverable.manage', 'deliverable.workflow.generate', 'cycle_comment.manage', 'addon.manage')
    or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) < 1 or jsonb_array_length(p_operations) > 500 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid service command.');
  end if;
  if (p_command_type = 'service_package.manage' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCatalog'))
    or (p_command_type = 'service_workflow.manage' and not private.aitask_has_permission(p_workspace_id, 'manageTaskTemplates'))
    or (p_command_type in ('client_plan.manage','addon.manage') and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans'))
    or (p_command_type = 'deliverable.workflow.generate' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'The required service capability is missing.');
  end if;
  perform set_config('aitask.command_type', p_command_type, true);
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select response into v_existing from public.aitask_command_receipts
    where workspace_id = p_workspace_id and actor_member_id = v_actor_id and command_id = p_command_id;
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type := v_op ->> 'entityType'; v_id := v_op ->> 'entityId'; v_action := v_op ->> 'action';
    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    v_expected := coalesce((v_op ->> 'expectedVersion')::bigint, 0);
    if v_op ->> 'kind' <> 'entity' or v_action not in ('insert','update','delete')
      or v_type not in ('client','task','service_package','service_workflow_template','service_pricing_snapshot','client_plan','service_cycle','deliverable','cycle_comment','addon') or coalesce(v_id,'') = '' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed service operation.');
    end if;
    select version, data into v_actual, v_old from public.aitask_entities
      where workspace_id = p_workspace_id and entity_type = v_type and entity_id = v_id;
    if v_action = 'insert' and v_actual is not null then
      return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'The record already exists.');
    elsif v_action in ('update','delete') and v_actual is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'The record no longer exists.');
    elsif v_action in ('update','delete') and v_actual <> v_expected then
      return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'A newer record is available.', 'conflict',
        jsonb_build_object('entityType',v_type,'entityId',v_id,'expectedVersion',v_expected,'actualVersion',v_actual,'current',v_old));
    end if;
    v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');
    if v_type = 'client' and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Client plan management is required.');
    elsif v_type = 'service_package' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCatalog') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service catalog management is required.');
    elsif v_type = 'service_workflow_template' and not private.aitask_has_permission(p_workspace_id, 'manageTaskTemplates') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Task template management is required.');
    elsif v_type = 'service_pricing_snapshot' and not private.aitask_has_permission(p_workspace_id, 'viewServicePrices') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service price access is required.');
    elsif v_type in ('client_plan','addon') and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Client plan management is required.');
    elsif v_type in ('service_cycle','deliverable','cycle_comment')
      and not private.aitask_can_access_service_client(p_workspace_id, v_client_id) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This client is outside your assigned scope.');
    elsif v_type = 'cycle_comment' and v_action = 'insert' and v_new ->> 'userId' <> v_actor_id then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Comments must belong to the signed-in member.');
    elsif v_type = 'task' and p_command_type = 'deliverable.workflow.generate' and not (
      v_action = 'insert'
      and coalesce((v_new ->> 'generatedFromDeliverable')::boolean,false)
      and coalesce(v_new ->> 'createdBy','') = v_actor_id
      and coalesce(v_new ->> 'assignedTo','') = ''
      and coalesce(v_new ->> 'deliverableId','') <> ''
      and coalesce(v_new ->> 'serviceCycleId','') <> ''
      and coalesce(v_new ->> 'visibility','internal') in ('internal','client-visible')
      and private.aitask_can_access_service_client(p_workspace_id, v_client_id)
    ) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid generated workflow task.');
    elsif v_type = 'task' and p_command_type <> 'deliverable.workflow.generate' and not private.aitask_can_mutate_entity(p_workspace_id,v_action,v_type,v_id,v_parent,v_old,v_new) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'You cannot update this task.');
    end if;
    if v_type in ('client_plan','service_cycle') and (
      coalesce((v_new ->> 'discountValue')::integer,0) <> 0
      or coalesce((v_new ->> 'taxRateBps')::integer,0) <> 0
      or exists (select 1 from jsonb_array_elements(coalesce(v_new -> 'serviceItems','[]'::jsonb)) item where coalesce((item ->> 'unitPriceMinor')::integer,0) <> 0)
    ) then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Operational service rows cannot contain pricing.');
    elsif v_type = 'addon' and coalesce((v_new ->> 'unitPriceMinor')::integer,0) <> 0 then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Operational add-on rows cannot contain pricing.');
    end if;
    if v_role = 'Staff' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles') and v_action = 'update' then
      if v_type = 'service_cycle' and (v_old - array['status','publishedAt','updatedAt']::text[]) <> (v_new - array['status','publishedAt','updatedAt']::text[]) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Only cycle publication fields may be changed.');
      elsif v_type = 'deliverable' and (v_old - array['status','taskIds','workflowGeneratedAt','workflowGenerationId','updatedAt']::text[]) <> (v_new - array['status','taskIds','workflowGeneratedAt','workflowGenerationId','updatedAt']::text[]) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Only deliverable execution fields may be changed.');
      end if;
    end if;
    v_actual := null; v_old := null;
  end loop;

  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type := v_op ->> 'entityType'; v_id := v_op ->> 'entityId'; v_action := v_op ->> 'action';
    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    if v_action = 'insert' then
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(p_workspace_id,v_type,v_id,v_parent,v_new) returning version,updated_at into v_version,v_updated;
    elsif v_action = 'update' then
      update public.aitask_entities set parent_id=v_parent,data=v_new
      where workspace_id=p_workspace_id and entity_type=v_type and entity_id=v_id returning version,updated_at into v_version,v_updated;
    else
      delete from public.aitask_entities where workspace_id=p_workspace_id and entity_type=v_type and entity_id=v_id;
      v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('entityType',v_type,'entityId',v_id));
    end if;
    insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata)
    values(p_workspace_id,v_actor_id,p_command_id,v_action,v_type,v_id,private.aitask_json_changed_fields('{}'::jsonb,v_new),jsonb_build_object('parentId',v_parent));
    if v_action <> 'delete' then v_changed := v_changed || jsonb_build_array(jsonb_build_object('entityType',v_type,'entityId',v_id,'version',v_version,'updatedAt',v_updated)); end if;
  end loop;
  update public.aitask_workspaces set version=version+1,updated_at=now() where id=p_workspace_id returning version into v_workspace_version;
  v_response := jsonb_build_object('ok',true,'commandId',p_command_id,'workspaceVersion',v_workspace_version,'changed',v_changed,'deleted',v_deleted,'refreshScope',case when jsonb_array_length(p_operations)>20 then 'workspace' else 'rows' end);
  insert into public.aitask_command_receipts(workspace_id,actor_member_id,command_id,command_type,response)
  values(p_workspace_id,v_actor_id,p_command_id,p_command_type,v_response);
  return v_response;
exception when check_violation or not_null_violation or invalid_text_representation then
  return jsonb_build_object('ok',false,'code','VALIDATION','error','The service command contains invalid data.');
end;
$$;
revoke all on function public.aitask_execute_service_command(text,uuid,text,jsonb) from public, anon;
grant execute on function public.aitask_execute_service_command(text,uuid,text,jsonb) to authenticated, service_role;

-- Intent-specific entry points prevent scoped staff from writing complete rows
-- assembled from redacted projections.
create or replace function public.aitask_set_service_cycle_status(
  p_workspace_id text, p_command_id uuid, p_cycle_id text, p_expected_version bigint, p_status text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.aitask_entities%rowtype; v_data jsonb;
begin
  if p_status not in ('Draft','Published','Completed') then
    return jsonb_build_object('ok',false,'code','VALIDATION','error','Invalid cycle status.');
  end if;
  select * into v_row from public.aitask_entities where workspace_id=p_workspace_id and entity_type='service_cycle' and entity_id=p_cycle_id;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','error','Cycle not found.'); end if;
  v_data := jsonb_set(v_row.data,'{status}',to_jsonb(p_status));
  v_data := jsonb_set(v_data,'{updatedAt}',to_jsonb(now()::text));
  if p_status='Published' and coalesce(v_data->>'publishedAt','')='' then v_data:=jsonb_set(v_data,'{publishedAt}',to_jsonb(now()::text)); end if;
  return public.aitask_execute_service_command(p_workspace_id,p_command_id,'service_cycle.manage',jsonb_build_array(jsonb_build_object(
    'kind','entity','action','update','entityType','service_cycle','entityId',p_cycle_id,'parentId',v_row.parent_id,
    'expectedVersion',p_expected_version,'data',v_data
  )));
end; $$;

create or replace function public.aitask_set_deliverable_status(
  p_workspace_id text, p_command_id uuid, p_deliverable_id text, p_expected_version bigint, p_status text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.aitask_entities%rowtype; v_data jsonb;
begin
  if p_status not in ('Planned','In Progress','Ready','Delivered') then
    return jsonb_build_object('ok',false,'code','VALIDATION','error','Invalid deliverable status.');
  end if;
  select * into v_row from public.aitask_entities where workspace_id=p_workspace_id and entity_type='deliverable' and entity_id=p_deliverable_id;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND','error','Deliverable not found.'); end if;
  v_data:=jsonb_set(jsonb_set(v_row.data,'{status}',to_jsonb(p_status)),'{updatedAt}',to_jsonb(now()::text));
  return public.aitask_execute_service_command(p_workspace_id,p_command_id,'deliverable.manage',jsonb_build_array(jsonb_build_object(
    'kind','entity','action','update','entityType','deliverable','entityId',p_deliverable_id,'parentId',v_row.parent_id,
    'expectedVersion',p_expected_version,'data',v_data
  )));
end; $$;

create or replace function public.aitask_generate_deliverable_task_chain(
  p_workspace_id text, p_command_id uuid, p_operations jsonb
)
returns jsonb language sql security definer set search_path='' as $$
  select public.aitask_execute_service_command(p_workspace_id,p_command_id,'deliverable.workflow.generate',p_operations);
$$;

revoke all on function public.aitask_set_service_cycle_status(text,uuid,text,bigint,text) from public,anon;
revoke all on function public.aitask_set_deliverable_status(text,uuid,text,bigint,text) from public,anon;
revoke all on function public.aitask_generate_deliverable_task_chain(text,uuid,jsonb) from public,anon;
grant execute on function public.aitask_set_service_cycle_status(text,uuid,text,bigint,text) to authenticated,service_role;
grant execute on function public.aitask_set_deliverable_status(text,uuid,text,bigint,text) to authenticated,service_role;
grant execute on function public.aitask_generate_deliverable_task_chain(text,uuid,jsonb) to authenticated,service_role;

create or replace function private.aitask_refresh_service_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_workspace text:=coalesce(new.workspace_id,old.workspace_id); v_deliverable text; v_status text; v_current text;
begin
  if coalesce(new.entity_type,old.entity_type) <> 'task' then return coalesce(new,old); end if;
  v_deliverable:=coalesce(new.data->>'deliverableId',old.data->>'deliverableId');
  if coalesce(v_deliverable,'')='' then return coalesce(new,old); end if;
  select data->>'status' into v_current from public.aitask_entities
    where workspace_id=v_workspace and entity_type='deliverable' and entity_id=v_deliverable;
  if not found then return coalesce(new,old); end if;
  select case
    when count(*) filter(where coalesce((data->>'workflowStepRequired')::boolean,true)) > 0
      and bool_and(case when coalesce((data->>'workflowStepRequired')::boolean,true) then coalesce((data->>'isCompleted')::boolean,false) or data->>'status'='Completed' else true end)
      then case when v_current='Delivered' then 'Delivered' else 'Ready' end
    when bool_or(data->>'status'<>'Pending' or coalesce((data->>'completionPercentage')::integer,0)>0 or coalesce((data->>'revisionCount')::integer,0)>0) then 'In Progress'
    else 'Planned' end into v_status
  from public.aitask_entities where workspace_id=v_workspace and entity_type='task' and data->>'deliverableId'=v_deliverable;
  update public.aitask_entities set data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(coalesce(v_status,'Planned'))),'{updatedAt}',to_jsonb(now()::text))
    where workspace_id=v_workspace and entity_type='deliverable' and entity_id=v_deliverable and data->>'status' is distinct from coalesce(v_status,'Planned');
  return coalesce(new,old);
end; $$;

create or replace function private.aitask_refresh_cycle_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_cycle text:=coalesce(new.cycle_id,old.cycle_id); v_workspace text:=coalesce(new.workspace_id,old.workspace_id); v_status text;
begin
  if coalesce(new.entity_type,old.entity_type)<>'deliverable' or coalesce(v_cycle,'')='' then return coalesce(new,old); end if;
  select case
    when count(*)>0 and bool_and(data->>'status'='Delivered') then 'Completed'
    when exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=v_workspace and cycle.entity_type='service_cycle' and cycle.entity_id=v_cycle and cycle.data->>'status'='Completed') then 'Published'
    else null end into v_status
  from public.aitask_entities where workspace_id=v_workspace and entity_type='deliverable' and cycle_id=v_cycle;
  if v_status is not null then
    update public.aitask_entities set data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(v_status)),'{updatedAt}',to_jsonb(now()::text))
      where workspace_id=v_workspace and entity_type='service_cycle' and entity_id=v_cycle and data->>'status'<>'Draft' and data->>'status' is distinct from v_status;
  end if;
  return coalesce(new,old);
end; $$;

drop trigger if exists aitask_refresh_service_progress on public.aitask_entities;
create trigger aitask_refresh_service_progress after insert or update or delete on public.aitask_entities
  for each row execute function private.aitask_refresh_service_progress();
drop trigger if exists aitask_refresh_cycle_completion on public.aitask_entities;
create trigger aitask_refresh_cycle_completion after insert or update or delete on public.aitask_entities
  for each row execute function private.aitask_refresh_cycle_completion();
revoke all on function private.aitask_refresh_service_progress() from public,anon,authenticated;
revoke all on function private.aitask_refresh_cycle_completion() from public,anon,authenticated;

create or replace function private.aitask_next_billing_date(p_after date, p_billing_day integer)
returns date language sql immutable set search_path = '' as $$
  with month_candidates as (
    select date_trunc('month', p_after)::date as month_start
    union all select (date_trunc('month', p_after) + interval '1 month')::date
  ), candidates as (
    select least(
      month_start + (greatest(1,least(31,p_billing_day))-1),
      (month_start + interval '1 month - 1 day')::date
    )::date as candidate from month_candidates
  ) select min(candidate) from candidates where candidate > p_after;
$$;
revoke all on function private.aitask_next_billing_date(date,integer) from public, anon, authenticated;

-- Final cycle generator: switches scheduled revisions at the boundary and
-- copies pricing separately from operational cycle data.
create or replace function private.aitask_generate_due_service_cycles(p_workspace_id text, p_today date default ((now() at time zone 'Asia/Kuala_Lumpur')::date))
returns integer language plpgsql security definer set search_path='' as $$
declare
  v_plan public.aitask_entities%rowtype; v_revision public.aitask_entities%rowtype;
  v_start date; v_next date; v_end date; v_cycle_id text; v_deliverable_id text; v_price_id text;
  v_cycle_data jsonb; v_item jsonb; v_count integer:=0; v_command_id uuid:=gen_random_uuid();
begin
  for v_plan in select * from public.aitask_entities
    where workspace_id=p_workspace_id and entity_type='client_plan' and data->>'status'='Active'
      and coalesce(nullif(data->>'nextCycleStart','')::date,nullif(data->>'startDate','')::date)<=p_today
    order by entity_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id||':service-client:'||v_plan.client_id,0));
    select * into v_plan from public.aitask_entities
      where workspace_id=p_workspace_id and entity_type='client_plan' and entity_id=v_plan.entity_id and data->>'status'='Active' for update;
    if not found then continue; end if;
    v_start:=coalesce(nullif(v_plan.data->>'nextCycleStart','')::date,nullif(v_plan.data->>'startDate','')::date);
    while v_start<=p_today loop
      select * into v_revision from public.aitask_entities
        where workspace_id=p_workspace_id and entity_type='client_plan' and data->>'status'='Draft'
          and data->>'supersedesPlanId'=v_plan.entity_id
          and nullif(data->>'effectiveFromCycleStart','')::date<=v_start
        order by coalesce((data->>'revision')::integer,1) desc limit 1 for update;
      if found then
        update public.aitask_entities set data=jsonb_set(jsonb_set(data,'{status}','"Ended"'::jsonb),'{updatedAt}',to_jsonb(now()::text))
          where workspace_id=p_workspace_id and entity_type='client_plan' and entity_id=v_plan.entity_id;
        update public.aitask_entities set data=jsonb_set(jsonb_set(jsonb_set(data,'{status}','"Active"'::jsonb),'{nextCycleStart}',to_jsonb(v_start::text)),'{updatedAt}',to_jsonb(now()::text))
          where workspace_id=p_workspace_id and entity_type='client_plan' and entity_id=v_revision.entity_id;
        select * into v_plan from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client_plan' and entity_id=v_revision.entity_id;
      end if;
      v_next:=private.aitask_next_billing_date(v_start,coalesce((v_plan.data->>'billingDay')::integer,1));
      v_end:=v_next-1; v_cycle_id:='CY-'||replace(gen_random_uuid()::text,'-','');
      v_price_id:='PRICE-'||replace(gen_random_uuid()::text,'-','');
      v_cycle_data:=jsonb_build_object(
        'id',v_cycle_id,'clientId',v_plan.client_id,'clientName',v_plan.data->>'clientName','planId',v_plan.entity_id,
        'planRevision',coalesce((v_plan.data->>'revision')::integer,1),'periodStart',v_start,'periodEnd',v_end,
        'status','Draft','currency','MYR','pricingSnapshotId',v_price_id,
        'serviceItems',coalesce(v_plan.data->'serviceItems','[]'::jsonb),
        'addonSnapshots',(select coalesce(jsonb_agg(addon.data order by addon.entity_id),'[]'::jsonb) from public.aitask_entities addon
          where addon.workspace_id=p_workspace_id and addon.entity_type='addon' and addon.client_id=v_plan.client_id
            and addon.data->>'billingMode'='monthly' and coalesce((addon.data->>'isActive')::boolean,false)
            and (addon.data->>'effectiveFrom')::date<=v_start
            and (coalesce(addon.data->>'effectiveUntil','')='' or (addon.data->>'effectiveUntil')::date>=v_start)),
        'discountType','none','discountValue',0,'taxRateBps',0,'createdAt',now(),'updatedAt',now()
      );
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(p_workspace_id,'service_cycle',v_cycle_id,v_plan.entity_id,v_cycle_data) on conflict do nothing;
      if found then
        insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
        select p_workspace_id,'service_pricing_snapshot',v_price_id,v_cycle_id,
          jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(price.data,'{id}',to_jsonb(v_price_id)),'{parentType}','"service_cycle"'::jsonb),'{parentId}',to_jsonb(v_cycle_id)),'{createdAt}',to_jsonb(now()::text)),'{updatedAt}',to_jsonb(now()::text))
        from public.aitask_entities price where price.workspace_id=p_workspace_id and price.entity_type='service_pricing_snapshot' and price.data->>'parentId'=v_plan.entity_id limit 1;
        for v_item in select value from jsonb_array_elements(coalesce(v_plan.data->'serviceItems','[]'::jsonb)) loop
          for v_sequence in 1..greatest(0,least(500,coalesce((v_item->>'quantity')::integer,0))) loop
            v_deliverable_id:='DL-'||replace(gen_random_uuid()::text,'-','');
            insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
            values(p_workspace_id,'deliverable',v_deliverable_id,v_cycle_id,jsonb_build_object(
              'id',v_deliverable_id,'clientId',v_plan.client_id,'clientName',v_plan.data->>'clientName','planId',v_plan.entity_id,
              'cycleId',v_cycle_id,'serviceItemId',v_item->>'id','sequence',v_sequence,'title',(v_item->>'name')||' '||v_sequence,
              'status','Planned','taskIds','[]'::jsonb,'attachments','[]'::jsonb,'createdAt',now(),'updatedAt',now()));
          end loop;
        end loop;
        v_count:=v_count+1;
        insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata)
        values(p_workspace_id,null,v_command_id,'insert','service_cycle',v_cycle_id,array['periodStart','periodEnd','status'],jsonb_build_object('source','cron','planId',v_plan.entity_id,'revision',v_plan.data->>'revision'));
      end if;
      v_start:=v_next;
    end loop;
    update public.aitask_entities set data=jsonb_set(jsonb_set(data,'{nextCycleStart}',to_jsonb(v_start::text)),'{updatedAt}',to_jsonb(now()::text))
      where workspace_id=p_workspace_id and entity_type='client_plan' and entity_id=v_plan.entity_id and data->>'status'='Active';
  end loop;
  if v_count>0 then update public.aitask_workspaces set version=version+1,updated_at=now() where id=p_workspace_id; end if;
  return v_count;
end; $$;
revoke all on function private.aitask_generate_due_service_cycles(text,date) from public,anon,authenticated;
grant execute on function private.aitask_generate_due_service_cycles(text,date) to service_role;

create or replace function private.aitask_generate_all_due_service_cycles(p_today date default ((now() at time zone 'Asia/Kuala_Lumpur')::date))
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace record; v_count integer; v_total integer:=0; v_results jsonb:='[]'::jsonb; v_run uuid:=gen_random_uuid();
begin
  for v_workspace in select id from public.aitask_workspaces order by id loop
    v_count:=private.aitask_generate_due_service_cycles(v_workspace.id,p_today); v_total:=v_total+v_count;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('workspaceId',v_workspace.id,'cyclesCreated',v_count));
  end loop;
  return jsonb_build_object('runId',v_run,'runAt',now(),'date',p_today,'cyclesCreated',v_total,'workspaces',v_results);
end; $$;
revoke all on function private.aitask_generate_all_due_service_cycles(date) from public,anon,authenticated;
grant execute on function private.aitask_generate_all_due_service_cycles(date) to service_role;

create extension if not exists pg_cron;
select cron.schedule('aitask-service-cycles-daily','5 16 * * *', $$select private.aitask_generate_all_due_service_cycles();$$)
where not exists (select 1 from cron.job where jobname='aitask-service-cycles-daily');

insert into storage.buckets(id,name,public,file_size_limit)
values('client-service-files','client-service-files',false,104857600)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

create or replace function private.aitask_can_read_service_file(p_workspace_id text,p_client_id text,p_cycle_id text,p_object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    (private.aitask_member_role(p_workspace_id)<>'Client' and private.aitask_can_access_service_client(p_workspace_id,p_client_id))
    or (
      private.aitask_member_role(p_workspace_id)='Client'
      and private.aitask_can_access_service_client(p_workspace_id,p_client_id)
      and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=p_cycle_id and cycle.client_id=p_client_id and cycle.data->>'status' in ('Published','Completed'))
      and exists(
        select 1 from public.aitask_entities comment
        cross join lateral jsonb_array_elements(coalesce(comment.data->'attachments','[]'::jsonb)) attachment
        where comment.workspace_id=p_workspace_id and comment.entity_type='cycle_comment' and comment.client_id=p_client_id
          and comment.cycle_id=p_cycle_id and comment.data->>'visibility'='client-visible' and attachment->>'path'=p_object_name
      )
    ),false
  );
$$;
revoke all on function private.aitask_can_read_service_file(text,text,text,text) from public,anon;
grant execute on function private.aitask_can_read_service_file(text,text,text,text) to authenticated,service_role;

drop policy if exists "service files read" on storage.objects;
create policy "service files read" on storage.objects for select to authenticated using (
  bucket_id='client-service-files'
  and array_length(storage.foldername(name),1)=3
  and private.aitask_can_read_service_file((storage.foldername(name))[1],(storage.foldername(name))[2],(storage.foldername(name))[3],name)
);
drop policy if exists "service files insert" on storage.objects;
create policy "service files insert" on storage.objects for insert to authenticated with check (
  bucket_id='client-service-files' and array_length(storage.foldername(name),1)=3
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_access_service_client((storage.foldername(name))[1],(storage.foldername(name))[2])
  and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=(storage.foldername(name))[1] and cycle.entity_type='service_cycle' and cycle.entity_id=(storage.foldername(name))[3] and cycle.client_id=(storage.foldername(name))[2])
);
drop policy if exists "service files update" on storage.objects;
create policy "service files update" on storage.objects for update to authenticated
  using (
    bucket_id='client-service-files' and array_length(storage.foldername(name),1)=3
    and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
    and private.aitask_can_access_service_client((storage.foldername(name))[1],(storage.foldername(name))[2])
    and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=(storage.foldername(name))[1] and cycle.entity_type='service_cycle' and cycle.entity_id=(storage.foldername(name))[3] and cycle.client_id=(storage.foldername(name))[2])
    and ((select auth.uid())::text=owner_id or private.aitask_has_permission((storage.foldername(name))[1],'manageServiceCycles'))
  )
  with check (
    bucket_id='client-service-files' and array_length(storage.foldername(name),1)=3
    and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
    and private.aitask_can_access_service_client((storage.foldername(name))[1],(storage.foldername(name))[2])
    and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=(storage.foldername(name))[1] and cycle.entity_type='service_cycle' and cycle.entity_id=(storage.foldername(name))[3] and cycle.client_id=(storage.foldername(name))[2])
  );
drop policy if exists "service files delete" on storage.objects;
create policy "service files delete" on storage.objects for delete to authenticated using (
  bucket_id='client-service-files' and array_length(storage.foldername(name),1)=3
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_access_service_client((storage.foldername(name))[1],(storage.foldername(name))[2])
  and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=(storage.foldername(name))[1] and cycle.entity_type='service_cycle' and cycle.entity_id=(storage.foldername(name))[3] and cycle.client_id=(storage.foldername(name))[2])
  and ((select auth.uid())::text=owner_id or private.aitask_has_permission((storage.foldername(name))[1],'manageServiceCycles'))
);

create or replace function private.aitask_public_service_items(p_items jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(value - 'unitPriceMinor' - 'workflow'),'[]'::jsonb) from jsonb_array_elements(coalesce(p_items,'[]'::jsonb));
$$;
revoke all on function private.aitask_public_service_items(jsonb) from public,anon,authenticated;

create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientName',p_data->'clientName','projectId',p_data->'projectId','projectName',p_data->'projectName',
    'serviceCycleId',p_data->'serviceCycleId','deliverableId',p_data->'deliverableId','visibility',p_data->'visibility',
    'workflowStepOrder',p_data->'workflowStepOrder','workflowStepRequired',p_data->'workflowStepRequired',
    'serviceType',p_data->'serviceType','title',p_data->'title','description',p_data->'description','assignedTo',p_data->'assignedTo',
    'startDate',p_data->'startDate','dueDate',p_data->'dueDate','status',p_data->'status','completionPercentage',p_data->'completionPercentage',
    'attachmentLink',p_data->'attachmentLink','attachmentName',p_data->'attachmentName','website',p_data->'website','facebookPage',p_data->'facebookPage',
    'isCompleted',p_data->'isCompleted','completedAt',p_data->'completedAt','revisionCount',p_data->'revisionCount','clientApprovalStatus',p_data->'clientApprovalStatus'
  ));
$$;
revoke all on function private.aitask_client_task_projection(jsonb) from public,anon,authenticated;

create or replace function public.aitask_read_client_portal(p_workspace_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_member public.aitask_members%rowtype; v_key text; v_client_id text;
  v_tasks jsonb; v_projects jsonb; v_clients jsonb; v_contacts jsonb;
  v_plans jsonb; v_cycles jsonb; v_deliverables jsonb; v_comments jsonb;
begin
  if (select auth.uid()) is null then raise insufficient_privilege using message='Authentication required.'; end if;
  select member.* into v_member from public.aitask_members member
    where member.workspace_id=p_workspace_id
      and member.auth_user_id=(select auth.uid())
      and member.role = 'Client'
    limit 1;
  if not found then raise insufficient_privilege using message='Client workspace membership required.'; end if;
  v_key:=lower(btrim(coalesce(v_member.client_name,'')));
  select entity_id into v_client_id from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key limit 1;
  select coalesce(jsonb_agg(private.aitask_client_task_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at) order by updated_at desc),'[]') into v_tasks from public.aitask_entities
    where workspace_id=p_workspace_id and entity_type='task' and client_key=v_key
      and coalesce(data->>'visibility','client-visible')='client-visible'
      and (coalesce(data->>'serviceCycleId','')='' or exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=(aitask_entities.data->>'serviceCycleId') and cycle.data->>'status' in ('Published','Completed')));
  select coalesce(jsonb_agg(private.aitask_client_project_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at) order by updated_at desc),'[]') into v_projects from public.aitask_entities where workspace_id=p_workspace_id and entity_type='project' and client_key=v_key;
  select coalesce(jsonb_agg(private.aitask_client_profile_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_clients from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'avatar',m.avatar) order by m.name),'[]') into v_contacts from public.aitask_members m where m.workspace_id=p_workspace_id and m.id in (select distinct assigned_to from public.aitask_entities where workspace_id=p_workspace_id and entity_type='task' and client_key=v_key and assigned_to is not null);
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at)),'[]') into v_plans from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client_plan' and client_id=v_client_id and data->>'status'='Active';
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps'-'addonSnapshots')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at) order by period_start desc),'[]') into v_cycles from public.aitask_entities where workspace_id=p_workspace_id and entity_type='service_cycle' and client_id=v_client_id and data->>'status' in ('Published','Completed');
  select coalesce(jsonb_agg(data||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_deliverables from public.aitask_entities where workspace_id=p_workspace_id and entity_type='deliverable' and client_id=v_client_id and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  select coalesce(jsonb_agg(data||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_comments from public.aitask_entities where workspace_id=p_workspace_id and entity_type='cycle_comment' and client_id=v_client_id and data->>'visibility'='client-visible' and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  return jsonb_build_object('workspaceId',p_workspace_id,'clientName',v_member.client_name,'tasks',v_tasks,'projects',v_projects,'clients',v_clients,'contacts',v_contacts,'clientPlans',v_plans,'serviceCycles',v_cycles,'deliverables',v_deliverables,'cycleComments',v_comments);
end;
$$;
revoke all on function public.aitask_read_client_portal(text) from public,anon;
grant execute on function public.aitask_read_client_portal(text) to authenticated,service_role;
