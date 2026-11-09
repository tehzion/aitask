-- Private notes remain editable after completion without replacing signed output.
do $migration$
declare
  v_definition text:=pg_get_functiondef('private.aitask_guard_workflow_task()'::regprocedure);
  v_anchor text:='v_output_changed := exists(select 1 from unnest(v_output) field where';
begin
  if position(v_anchor in v_definition)=0 then raise exception 'Completed review output anchor is missing'; end if;
  execute replace(v_definition,v_anchor,v_anchor || ' not (field=''notes'' and old.data->>''status''=''Completed'' and new.data->>''status''=''Completed'') and');
end;
$migration$;
