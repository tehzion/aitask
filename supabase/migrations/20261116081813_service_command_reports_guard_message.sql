-- aitask_execute_service_command swallowed every check_violation into the
-- generic "The service command contains invalid data." message, so a Project
-- Manager whose service save was refused (for example a deliverable status the
-- server will not accept) could not tell why. The guard triggers raise short,
-- user-facing messages on purpose; return them. A built-in constraint violation
-- ("new row for relation ...") keeps the generic text so table and constraint
-- names never reach the browser.
do $migration$
declare
  fn record;
  definition text;
  anchor text := E'exception when check_violation or not_null_violation or invalid_text_representation then\n  return jsonb_build_object(''ok'',false,''code'',''VALIDATION'',''error'',''The service command contains invalid data.'');';
  replacement text := E'exception when check_violation then\n  return jsonb_build_object(''ok'',false,''code'',''VALIDATION'',''error'',case\n    when sqlerrm like ''new row for relation%'' or length(sqlerrm) > 300 then ''The service command contains invalid data.''\n    else sqlerrm end);\n  when not_null_violation or invalid_text_representation then\n  return jsonb_build_object(''ok'',false,''code'',''VALIDATION'',''error'',''The service command contains invalid data.'');';
  patched integer := 0;
begin
  for fn in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'aitask_execute_service_command'
  loop
    definition := pg_get_functiondef(fn.oid);
    if position(anchor in definition) > 0 then
      execute replace(definition, anchor, replacement);
      patched := patched + 1;
    end if;
  end loop;
  if patched = 0 then
    raise exception 'Expected aitask_execute_service_command to contain the generic invalid-data handler';
  end if;
end;
$migration$;
