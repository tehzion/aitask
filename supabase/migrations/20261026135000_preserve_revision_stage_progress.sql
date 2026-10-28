-- A later stage-progress trigger recomputes the cached percentage after the
-- workflow guard. Keep internal revision progress at 50% in that final pass.
do $$
declare
  definition text;
  updated text;
  old_revision text := $old$when new.data->>'clientApprovalStatus'='Rejected' or new.data->>'status'='Revision' then 50$old$;
  new_revision text := $new$when new.data->>'status'='Revision'
   or (new.data->>'status'='In Progress' and coalesce((new.data->>'revisionCount')::integer,0)>0)
   or new.data->>'clientApprovalStatus'='Rejected' then 50$new$;
begin
  definition := pg_get_functiondef('private.aitask_finalize_task_stage_progress()'::regprocedure);
  updated := replace(definition, old_revision, new_revision);
  if updated = definition then
    raise exception 'Final task stage-progress revision marker was not found; inspect the current finalizer.';
  end if;
  execute updated;
end;
$$;
