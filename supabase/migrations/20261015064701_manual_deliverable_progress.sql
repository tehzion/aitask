-- With no same-client linked tasks, deliverables are tracked manually. Patch
-- only this branch so installed workflow review/signature gates stay intact.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_refresh_service_progress()'::regprocedure);
  previous text := 'when count(*)=0 then case when v_deliverable.data->>''status''=''Delivered'' then ''Delivered'' else ''Planned'' end';
  replacement text := 'when count(*)=0 then coalesce(v_deliverable.data->>''status'',''Planned'')';
begin
  if position(replacement in definition)>0 then return; end if;
  if position(previous in definition)=0 then
    raise exception 'Service progress task-free status branch is missing.';
  end if;
  execute replace(definition,previous,replacement);
end;
$migration$;
