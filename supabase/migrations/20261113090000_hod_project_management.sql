-- An HOD assigned to a project may update its execution details and staff
-- membership. Company, PM, HOD-membership and creator boundaries stay with
-- Boss Koo and the responsible Project Manager.
begin;

do $migration$
declare
  definition text;
  anchor text;
  replacement text;
begin
  definition := pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  anchor := '  return private.aitask_can_mutate_entity_legacy(';
  replacement := $body$  if p_action = 'update' and p_entity_type = 'project'
    and private.aitask_is_hod(p_workspace_id)
    and private.aitask_hod_is_assigned(p_workspace_id, p_entity_id)
    and (p_new_data -> 'clientId') is not distinct from (p_old_data -> 'clientId')
    and lower(btrim(coalesce(p_new_data ->> 'clientName', ''))) = lower(btrim(coalesce(p_old_data ->> 'clientName', '')))
    and (p_new_data -> 'projectManagerIds') is not distinct from (p_old_data -> 'projectManagerIds')
    and (p_new_data -> 'hodMemberIds') is not distinct from (p_old_data -> 'hodMemberIds')
    and coalesce(p_new_data ->> 'createdBy', '') = coalesce(p_old_data ->> 'createdBy', '')
  then
    return true;
  end if;
$body$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one project mutation fallback';
  end if;
  execute replace(definition, anchor, replacement || E'\n' || anchor);
end;
$migration$;

commit;
