-- Internal revision and assignment transitions must not write a Client's
-- separate delivery decision. Preserve existing stored values and approval
-- history; this only changes future internal task transitions.
do $$
declare
  definition text;
  updated text;
  old_assignment text := $old$new.data := new.data || jsonb_build_object('status','Pending','clientApprovalStatus','Pending');$old$;
  new_assignment text := $new$new.data := new.data || jsonb_build_object('status','Pending');$new$;
  old_revision text := $old$new.data := new.data || jsonb_build_object('clientApprovalStatus','Rejected','revisionCount',coalesce((v_old->>'revisionCount')::integer,0)+1);$old$;
  new_revision text := $new$new.data := new.data || jsonb_build_object('revisionCount',coalesce((v_old->>'revisionCount')::integer,0)+1);$new$;
  old_completion text := $old$new.data := new.data || jsonb_build_object('clientApprovalStatus','Approved');$old$;
  old_progress text := $old$when new.data->>'clientApprovalStatus'='Rejected' or new.data->>'status'='Revision' then 50$old$;
  new_progress text := $new$ when new.data->>'status'='Revision' or (new.data->>'status'='In Progress' and coalesce((new.data->>'revisionCount')::integer,0)>0) then 50 $new$;
begin
  definition := pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  updated := replace(definition, old_assignment, new_assignment);
  if updated = definition then
    raise exception 'Task assignment reset marker was not found; inspect the current stage-progress guard.';
  end if;
  definition := updated;
  updated := replace(definition, old_revision, new_revision);
  if updated = definition then
    raise exception 'Task internal revision marker was not found; inspect the current stage-progress guard.';
  end if;
  definition := updated;
  updated := replace(definition, old_completion, 'null;');
  if updated = definition then
    raise exception 'Task internal completion marker was not found; inspect the current stage-progress guard.';
  end if;
  definition := updated;
  updated := replace(definition, old_progress, new_progress);
  if updated = definition then
    raise exception 'Task revision progress marker was not found; inspect the current stage-progress guard.';
  end if;
  execute updated;
end;
$$;
