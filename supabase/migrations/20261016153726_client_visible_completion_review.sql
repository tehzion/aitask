-- Align the database completion trigger with the client-review flow.
--
-- private.aitask_guard_task_stage_progress() used to force
-- clientApprovalStatus='Approved' whenever a non-client actor completed a task.
-- In the secure backend that silently recorded customer acceptance, so a
-- client-visible task could never be reviewed after a project manager completed
-- it, and no approval-history event was written (getClientApprovalDate returned
-- null). The frontend was changed to keep client-visible completions at
-- 'Pending' so the client can review; this makes the database agree.
--
-- Internal tasks keep the historical immediate acceptance. A client-visible task
-- that was already approved stays approved.
do $migration$
declare
  v_definition text;
  v_anchor text;
begin
  v_definition := pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  v_anchor := 'if new.data->>''status''=''Completed'' and v_changed then';
  if strpos(v_definition, v_anchor) = 0 then
    raise exception 'Expected task completion auto-approval anchor';
  end if;
  if strpos(v_definition, 'client-visible') = 0 then
    execute replace(
      v_definition,
      v_anchor,
      'if new.data->>''status''=''Completed'' and v_changed and (coalesce(new.data->>''visibility'',''internal'') <> ''client-visible'' or coalesce(v_old->>''clientApprovalStatus'',''Pending'') = ''Approved'' or coalesce(new.data->>''clientApprovalStatus'',''Pending'') = ''Approved'') then'
    );
  end if;
end;
$migration$;
