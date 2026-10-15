-- Required ordinary tasks gate delivery too; a missing frozen workflow must
-- never become ready just because its existing subset is complete.
create or replace function private.aitask_workflow_deliverable_ready(p_workspace text,p_output jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_workflow jsonb; v_step jsonb;
begin
  select item.value->'workflow' into v_workflow from public.aitask_entities cycle
  cross join lateral jsonb_array_elements(coalesce(cycle.data->'serviceItems','[]'::jsonb)) item(value)
  where cycle.workspace_id=p_workspace and cycle.entity_type='service_cycle' and cycle.entity_id=p_output->>'cycleId'
    and cycle.data->>'clientId'=p_output->>'clientId' and item.value->>'id'=p_output->>'serviceItemId';
  for v_step in select value from jsonb_array_elements(coalesce(v_workflow->'steps','[]'::jsonb)) where coalesce((value->>'required')::boolean,true) loop
    if not exists(select 1 from public.aitask_entities task where task.workspace_id=p_workspace and task.entity_type='task'
      and task.data->>'deliverableId'=p_output->>'id' and task.data->>'clientId'=p_output->>'clientId'
      and task.data->>'workflowStepId'=v_step->>'id' and private.aitask_workflow_task_satisfied(p_workspace,task.data)) then return false; end if;
  end loop;
  return not exists(select 1 from public.aitask_entities task where task.workspace_id=p_workspace and task.entity_type='task'
    and (task.data->>'deliverableId'=p_output->>'id' or coalesce(p_output->'taskIds','[]'::jsonb) ? task.entity_id)
    and task.data->>'clientId'=p_output->>'clientId' and coalesce((task.data->>'workflowStepRequired')::boolean,true)
    and not private.aitask_workflow_task_satisfied(p_workspace,task.data));
end;
$$;

create or replace function private.aitask_resolve_deliverable_status(p_workspace text,p_output jsonb)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_count bigint; v_started boolean; v_ready boolean;
begin
  select count(*),bool_or(task.data->>'status'<>'Pending'
    or coalesce((task.data->>'completionPercentage')::integer,0)>0
    or coalesce((task.data->>'revisionCount')::integer,0)>0)
  into v_count,v_started from public.aitask_entities task
  where task.workspace_id=p_workspace and task.entity_type='task' and task.client_id=p_output->>'clientId'
    and (task.data->>'deliverableId'=p_output->>'id' or coalesce(p_output->'taskIds','[]'::jsonb) ? task.entity_id);
  v_ready := private.aitask_workflow_deliverable_ready(p_workspace,p_output);
  if v_count=0 then
    if not v_ready and p_output->>'status' in ('Ready','Delivered') then return 'Planned'; end if;
    return coalesce(p_output->>'status','Planned');
  end if;
  if v_ready then return case when p_output->>'status'='Delivered' then 'Delivered' else 'Ready' end; end if;
  return case when v_started then 'In Progress' else 'Planned' end;
end;
$$;

-- Enforce the same rules for direct RPC writes and normalize delivery evidence.
create or replace function private.aitask_guard_deliverable_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.entity_type<>'deliverable' then return new; end if;
  if coalesce(new.data->>'status','') not in ('Planned','In Progress','Ready','Delivered')
    or (new.data->>'status' in ('Ready','Delivered') and not private.aitask_workflow_deliverable_ready(new.workspace_id,new.data)) then
    raise check_violation using message='Deliverable status must match the progress of its required tasks.';
  end if;
  if new.data->>'status'='Delivered' then
    new.data := jsonb_set(new.data,'{deliveredAt}',coalesce(nullif(new.data->'deliveredAt','null'::jsonb),to_jsonb(now()::text)));
  else
    new.data := new.data-'deliveredAt';
  end if;
  return new;
end;
$$;
drop trigger if exists aitask_zz_guard_deliverable_progress on public.aitask_entities;
create trigger aitask_zz_guard_deliverable_progress before insert or update on public.aitask_entities
for each row execute function private.aitask_guard_deliverable_progress();

create or replace function private.aitask_refresh_service_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_workspace text := coalesce(new.workspace_id,old.workspace_id);
  v_task_id text := coalesce(new.entity_id,old.entity_id);
  v_old_link text; v_new_link text; v_deliverable record; v_status text;
begin
  if coalesce(new.entity_type,old.entity_type)<>'task' then return coalesce(new,old); end if;
  if tg_op<>'INSERT' then v_old_link := old.data->>'deliverableId'; end if;
  if tg_op<>'DELETE' then v_new_link := new.data->>'deliverableId'; end if;
  for v_deliverable in
    select entity_id,data from public.aitask_entities where workspace_id=v_workspace and entity_type='deliverable'
      and (entity_id=v_old_link or entity_id=v_new_link or coalesce(data->'taskIds','[]'::jsonb) ? v_task_id)
  loop
    v_status := private.aitask_resolve_deliverable_status(v_workspace,v_deliverable.data);
    update public.aitask_entities
      set data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(v_status)),'{updatedAt}',to_jsonb(now()::text))
      where workspace_id=v_workspace and entity_type='deliverable' and entity_id=v_deliverable.entity_id
        and (data->>'status' is distinct from v_status or (v_status<>'Delivered' and data ? 'deliveredAt'));
  end loop;
  return coalesce(new,old);
end;
$$;
revoke all on function private.aitask_workflow_deliverable_ready(text,jsonb),
  private.aitask_resolve_deliverable_status(text,jsonb),private.aitask_guard_deliverable_progress(),
  private.aitask_refresh_service_progress() from public,anon,authenticated;

-- Cancelled cycles must not become client-visible again when work changes.
do $$
declare definition text := pg_get_functiondef('private.aitask_refresh_cycle_completion()'::regprocedure);
  previous text := 'data->>''status''<>''Draft''';
  replacement text := 'data->>''status'' in (''Published'',''Completed'')';
begin
  if position(replacement in definition)>0 then return; end if;
  if position(previous in definition)=0 then raise exception 'Cycle completion publication guard is missing.'; end if;
  execute replace(definition,previous,replacement);
end;
$$;
