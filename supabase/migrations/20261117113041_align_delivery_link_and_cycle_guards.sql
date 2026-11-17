-- Compare the assigned worker's cycle update against the full stored record.
-- Older published cycles can retain an add-on snapshot that current clients
-- omit. Normalize that omission before authorization; the pricing trigger
-- preserves the stored value when the service command writes the row.
do $migration$
declare
  signature regprocedure;
  definition text;
  anchor text := $old$    if v_role = 'Staff' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles') and v_action = 'update' then
      if v_type = 'service_cycle' and$old$;
  replacement text := $new$    if v_role = 'Staff' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles') and v_action = 'update' then
      if v_type = 'service_cycle' and coalesce(v_old ->> 'publishedAt', '') <> ''
        and v_old ? 'addonSnapshots' and not (v_new ? 'addonSnapshots') then
        v_new := jsonb_set(v_new, '{addonSnapshots}', v_old -> 'addonSnapshots');
      end if;
      if v_type = 'service_cycle' and$new$;
  write_anchor text := $old$    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    if v_action = 'insert' then$old$;
  write_replacement text := $new$    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    if p_command_type = 'deliverable.manage' and v_type = 'service_cycle' and v_action = 'update' then
      select data, parent_id, version, updated_at into v_old, v_cycle_parent, v_version, v_updated
      from public.aitask_entities
      where workspace_id=p_workspace_id and entity_type=v_type and entity_id=v_id;
      if coalesce(v_old ->> 'publishedAt', '') <> '' and v_old ? 'addonSnapshots' and not (v_new ? 'addonSnapshots') then
        v_new := jsonb_set(v_new, '{addonSnapshots}', v_old -> 'addonSnapshots');
      end if;
      -- The preceding deliverable write can already have updated the cycle.
      -- Acknowledge that result without attempting a second cycle transition.
      if v_cycle_parent is not distinct from v_parent and (v_old - 'updatedAt') = (v_new - 'updatedAt') then
        v_changed := v_changed || jsonb_build_array(jsonb_build_object('entityType',v_type,'entityId',v_id,'version',v_version,'updatedAt',v_updated));
        continue;
      end if;
    end if;
    if v_action = 'insert' then$new$;
begin
  foreach signature in array array[
    'public.aitask_execute_service_command(text,uuid,text,jsonb)'::regprocedure,
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
      raise exception 'Expected one cycle publication guard in %', signature;
    end if;
    if (length(definition) - length(replace(definition, write_anchor, ''))) / length(write_anchor) <> 1 then
      raise exception 'Expected one service write loop in %', signature;
    end if;
    definition := replace(definition, '  v_parent text;', E'  v_parent text;\n  v_cycle_parent text;');
    definition := replace(definition, anchor, replacement);
    definition := replace(definition, write_anchor, write_replacement);
    -- Keep clearing deliveredAt on reopen consistent with the current RPC.
    definition := replace(definition,
      'array[''status'',''taskIds'',''workflowGeneratedAt'',''workflowGenerationId'',''updatedAt'']',
      'array[''status'',''taskIds'',''workflowGeneratedAt'',''workflowGenerationId'',''deliveredAt'',''updatedAt'']');
    execute definition;
  end loop;
end;
$migration$;

-- Enforce the same reopen requirement as the task form on both sides of a
-- task link. A routine edit of an existing link remains valid.
create or replace function private.aitask_guard_delivered_task_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_id text := nullif(new.data ->> 'deliverableId', '');
  target_status text;
begin
  if new.entity_type = 'task' and target_id is not null
    and (tg_op = 'INSERT' or target_id is distinct from old.data ->> 'deliverableId') then
    -- Serialize with an in-flight confirmation of the same deliverable.
    select deliverable.data ->> 'status' into target_status
    from public.aitask_entities deliverable
    where deliverable.workspace_id = new.workspace_id
      and deliverable.entity_type = 'deliverable'
      and deliverable.entity_id = target_id
      and deliverable.client_id = new.data ->> 'clientId'
    for no key update;
    if target_status = 'Delivered' then
      raise check_violation using message = 'Reopen the delivery before adding task links.';
    end if;
  elsif new.entity_type = 'deliverable' and tg_op = 'UPDATE' and old.data ->> 'status' = 'Delivered'
    and new.data -> 'taskIds' is distinct from old.data -> 'taskIds'
    and exists (
      select 1
      from jsonb_array_elements_text(coalesce(nullif(new.data -> 'taskIds', 'null'::jsonb), '[]'::jsonb)) as linked(task_id)
      where not coalesce(old.data -> 'taskIds', '[]'::jsonb) ? linked.task_id
        and not exists (
          select 1 from public.aitask_entities task
          where task.workspace_id = new.workspace_id and task.entity_type = 'task'
            and task.entity_id = linked.task_id and task.data ->> 'deliverableId' = new.entity_id
        )
    ) then
    raise check_violation using message = 'Reopen the delivery before adding task links.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_delivered_task_links() from public, anon, authenticated;
create trigger aitask_01_guard_delivered_task_links
  before insert or update of data on public.aitask_entities
  for each row when (new.entity_type in ('task', 'deliverable'))
  execute function private.aitask_guard_delivered_task_links();
