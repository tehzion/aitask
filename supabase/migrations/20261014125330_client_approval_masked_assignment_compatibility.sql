-- Older projected clients submit a masked blank; canonical assignment stays server-owned.
do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_client_command_allowed(text,text,jsonb)'::regprocedure);
  v_anchor text := 'where v_new_task ? key and v_new_task -> key is distinct from v_old_task -> key';
begin
  if position(v_anchor in v_definition)=0 then raise exception 'Client approval compatibility anchor is missing'; end if;
  if position('and not (key = ''assignedTo'' and coalesce(v_new_task ->> ''assignedTo'', '''') = '''')' in v_definition)=0 then
    execute replace(v_definition,v_anchor,v_anchor || E'\n      and not (key = ''assignedTo'' and coalesce(v_new_task ->> ''assignedTo'', '''') = '''')');
  end if;
end;
$migration$;
