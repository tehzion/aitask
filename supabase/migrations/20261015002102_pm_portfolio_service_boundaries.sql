-- PM service capabilities never grant access to another portfolio's records.
-- Restrict pricing reads as well as writes: the older pricing SELECT branch
-- checked viewServicePrices but did not bind the snapshot to its client.
create policy "PM service records stay in portfolio" on public.aitask_entities
  as restrictive for all to authenticated
  using (
    private.aitask_is_super_admin(workspace_id)
    or private.aitask_member_role(workspace_id) <> 'Project Manager'
    or entity_type not in ('client_plan','addon','service_pricing_snapshot','service_cycle','deliverable','cycle_comment')
    or private.aitask_can_access_service_client(workspace_id, client_id)
  )
  with check (
    private.aitask_is_super_admin(workspace_id)
    or private.aitask_member_role(workspace_id) <> 'Project Manager'
    or entity_type not in ('client_plan','addon','service_pricing_snapshot','service_cycle','deliverable','cycle_comment')
    or private.aitask_can_access_service_client(workspace_id, client_id)
  );

-- RPCs run as their owner. Check the old target before applying any operation,
-- including deletion and attempts to relabel a foreign record as an owned one.
-- Validate inserts at the trigger after an atomic new-company insert has run.
do $$
declare
  definition text := pg_get_functiondef('public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure);
  original text := definition;
begin
  definition := replace(definition,
    'v_client_id := coalesce(v_new ->> ''clientId'', v_old ->> ''clientId'');',
    'v_client_id := coalesce(v_new ->> ''clientId'', v_old ->> ''clientId'');
    if v_role = ''Project Manager'' and not private.aitask_is_super_admin(p_workspace_id)
      and v_type in (''client_plan'',''addon'',''service_pricing_snapshot'',''service_cycle'',''deliverable'',''cycle_comment'')
      and v_action in (''update'',''delete'')
      and not private.aitask_can_access_service_client(p_workspace_id, v_old ->> ''clientId'') then
      return jsonb_build_object(''ok'',false,''code'',''FORBIDDEN'',''error'',''This company is outside your portfolio.'');
    end if;');
  if definition = original then raise exception 'Service command target predicate was not found.'; end if;
  execute definition;
end;
$$;

create or replace function private.aitask_guard_pm_service_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_client_id text := new.data->>'clientId';
  v_parent_id text;
  v_parent_type text;
  v_parent_client text;
begin
  if (select auth.uid()) is null
    or private.aitask_is_super_admin(new.workspace_id)
    or private.aitask_member_role(new.workspace_id) <> 'Project Manager' then return new; end if;
  if not private.aitask_can_access_service_client(new.workspace_id,v_client_id)
    or (tg_op = 'UPDATE' and not private.aitask_can_access_service_client(old.workspace_id,old.data->>'clientId')) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;
  if tg_op = 'UPDATE' and new.data->>'clientId' is distinct from old.data->>'clientId' then
    raise check_violation using message = 'Service company identity cannot be changed.';
  end if;
  -- An owned clientId must not be used to smuggle a foreign parent into scope.
  v_parent_type := case new.entity_type
    when 'client_plan' then 'client'
    when 'service_cycle' then 'client_plan'
    when 'addon' then 'client_plan'
    when 'deliverable' then 'service_cycle'
    when 'cycle_comment' then 'service_cycle'
    when 'service_pricing_snapshot' then new.data->>'parentType' end;
  v_parent_id := case new.entity_type
    when 'client_plan' then v_client_id
    when 'service_cycle' then new.data->>'planId'
    when 'addon' then new.data->>'planId'
    when 'deliverable' then new.data->>'cycleId'
    when 'cycle_comment' then new.data->>'cycleId'
    when 'service_pricing_snapshot' then new.data->>'parentId' end;
  if v_parent_id is not null and (tg_op='INSERT'
    or (new.data->>'planId',new.data->>'cycleId',new.data->>'parentId',new.data->>'parentType')
      is distinct from (old.data->>'planId',old.data->>'cycleId',old.data->>'parentId',old.data->>'parentType')) then
    select case when parent.entity_type='client' then parent.entity_id else parent.data->>'clientId' end
      into v_parent_client from public.aitask_entities parent
      where parent.workspace_id=new.workspace_id and parent.entity_type=v_parent_type and parent.entity_id=v_parent_id;
    if v_parent_client is distinct from v_client_id then
      raise check_violation using message = 'Service records must belong to the same company as their parent.';
    end if;
  end if;
  if new.entity_type='addon' and nullif(new.data->>'targetCycleId','') is not null
    and not exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=new.workspace_id
      and cycle.entity_type='service_cycle' and cycle.entity_id=new.data->>'targetCycleId'
      and cycle.data->>'clientId'=v_client_id and cycle.data->>'planId'=new.data->>'planId') then
    raise check_violation using message = 'Choose a cycle from this client plan.';
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_pm_service_scope() from public,anon,authenticated;
create trigger aitask_guard_pm_service_scope before insert or update on public.aitask_entities
  for each row when (new.entity_type in ('client_plan','addon','service_pricing_snapshot','service_cycle','deliverable','cycle_comment'))
  execute function private.aitask_guard_pm_service_scope();
