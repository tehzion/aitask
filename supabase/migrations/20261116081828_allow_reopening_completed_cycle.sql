-- Reopening a delivered deliverable (Delivered -> Ready) makes the cycle
-- completion trigger move its cycle from Completed back to Published, but the
-- cycle status guard only allowed Draft -> Published and Published ->
-- Completed/Cancelled for service commands. The save was refused ("This cycle
-- status transition is not allowed."), so the screen showed Ready for a moment
-- and then jumped back to Delivered. Allow Completed -> Published, but only
-- while at least one deliverable in the cycle is no longer Delivered.
do $migration$
declare
  definition text;
  anchor text := E'      or (v_old = ''Published'' and v_new in (''Completed'', ''Cancelled''))\n    ) then';
  replacement text := E'      or (v_old = ''Published'' and v_new in (''Completed'', ''Cancelled''))\n      or (\n        v_old = ''Completed'' and v_new = ''Published''\n        and exists (\n          select 1 from public.aitask_entities deliverable\n          where deliverable.workspace_id = new.workspace_id\n            and deliverable.entity_type = ''deliverable''\n            and deliverable.cycle_id = new.entity_id\n            and coalesce(deliverable.data ->> ''status'', ''Planned'') <> ''Delivered''\n        )\n      )\n    ) then';
begin
  definition := pg_get_functiondef('private.aitask_guard_service_status()'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one cycle status transition list in aitask_guard_service_status';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
