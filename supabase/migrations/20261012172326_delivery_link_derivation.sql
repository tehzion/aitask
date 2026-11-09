-- Match frontend derivation for both link forms and exclude foreign-company
-- tasks. Installing this function does not recompute existing records.
create or replace function private.aitask_refresh_service_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_workspace text := coalesce(new.workspace_id,old.workspace_id);
  v_task_id text := coalesce(new.entity_id,old.entity_id);
  v_old_link text;
  v_new_link text;
  v_deliverable record;
  v_status text;
begin
  if coalesce(new.entity_type,old.entity_type) <> 'task' then return coalesce(new,old); end if;
  if tg_op <> 'INSERT' then v_old_link := old.data->>'deliverableId'; end if;
  if tg_op <> 'DELETE' then v_new_link := new.data->>'deliverableId'; end if;
  for v_deliverable in
    select entity_id,data from public.aitask_entities
    where workspace_id=v_workspace and entity_type='deliverable'
      and (entity_id=v_old_link or entity_id=v_new_link or coalesce(data->'taskIds','[]'::jsonb) ? v_task_id)
  loop
    select case
      when count(*)=0 then case when v_deliverable.data->>'status'='Delivered' then 'Delivered' else 'Planned' end
      when count(*) filter(where coalesce((task.data->>'workflowStepRequired')::boolean,true))>0
        and bool_and(case when coalesce((task.data->>'workflowStepRequired')::boolean,true)
          then coalesce((task.data->>'isCompleted')::boolean,false) or task.data->>'status'='Completed' else true end)
        then case when v_deliverable.data->>'status'='Delivered' then 'Delivered' else 'Ready' end
      when bool_or(task.data->>'status'<>'Pending' or coalesce((task.data->>'completionPercentage')::integer,0)>0 or coalesce((task.data->>'revisionCount')::integer,0)>0)
        then 'In Progress'
      else 'Planned' end into v_status
    from public.aitask_entities task
    where task.workspace_id=v_workspace and task.entity_type='task'
      and task.client_id=v_deliverable.data->>'clientId'
      and (task.data->>'deliverableId'=v_deliverable.entity_id or coalesce(v_deliverable.data->'taskIds','[]'::jsonb) ? task.entity_id);
    update public.aitask_entities
      set data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(v_status)),'{updatedAt}',to_jsonb(now()::text))
      where workspace_id=v_workspace and entity_type='deliverable' and entity_id=v_deliverable.entity_id
        and data->>'status' is distinct from v_status;
  end loop;
  return coalesce(new,old);
end;
$$;
revoke all on function private.aitask_refresh_service_progress() from public,anon,authenticated;
