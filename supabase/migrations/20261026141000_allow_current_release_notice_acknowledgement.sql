-- Keep the acknowledgement RPC contract aligned with the active notice ID.
-- Retain the prior ID so older clients remain compatible during rollout.
do $$
declare
  target regprocedure;
  definition text;
  updated text;
  old_marker text := $old$if p_notice_id <> '2026-08-service-operations' then$old$;
  new_marker text := $new$if p_notice_id not in ('2026-08-service-operations', '2026-10-project-workflows') then$new$;
begin
  foreach target in array array[
    'public.aitask_get_release_notice_acknowledgement(text,text)'::regprocedure,
    'public.aitask_acknowledge_release_notice(text,text)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    updated := replace(definition, old_marker, new_marker);
    if updated = definition then
      raise exception 'Release notice ID validation marker was not found in %.', target;
    end if;
    execute updated;
  end loop;
end;
$$;
