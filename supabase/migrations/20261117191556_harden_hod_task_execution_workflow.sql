begin;

-- HOD execution uploads are validated by the dedicated output-file trigger.
-- Keep the generic HOD patch allow-list aligned so it does not reject the
-- mutation before that stricter validator runs.
do $migration$
declare
  definition text;
  updated text;
  old_allowed text := $old$'dueReminderSent', 'comments', 'supportingAttachments',$old$;
  new_allowed text := $new$'dueReminderSent', 'comments', 'supportingAttachments', 'outputAttachments',$new$;
  old_restricted text := $old$'outputAttachments', 'workflowStepKind'$old$;
  new_restricted text := $new$'workflowStepKind'$new$;
begin
  definition := pg_get_functiondef('private.aitask_hod_task_execution_patch_is_valid(text,jsonb,jsonb)'::regprocedure);
  updated := replace(definition, old_allowed, new_allowed);
  if updated = definition then
    raise exception 'HOD task output allow-list marker was not found.';
  end if;

  definition := updated;
  updated := replace(definition, old_restricted, new_restricted);
  if updated = definition then
    raise exception 'HOD task output restriction marker was not found.';
  end if;
  execute updated;
end;
$migration$;

-- A HOD may delegate assigned work after starting it. This is an assignment
-- action, so it must satisfy the canonical routing validator. It does not make
-- the HOD a reviewer or grant any revision/approval authority.
do $migration$
declare
  definition text;
  updated text;
  anchor text := $anchor$        or (v_old->>'status'='In Progress'
          and new.data->>'status'='Completed'
          and v_old->>'assignedTo'=v_actor$anchor$;
  replacement text := $replacement$        or (
          private.aitask_is_hod(new.workspace_id)
          and v_old->>'status' in ('Pending','In Progress','Revision')
          and new.data->>'status'='Pending'
          and v_old->>'assignedTo' is distinct from new.data->>'assignedTo'
          and private.aitask_task_assignment_is_valid(new.workspace_id,'update',v_old,new.data)
        )
        or (v_old->>'status'='In Progress'
          and new.data->>'status'='Completed'
          and v_old->>'assignedTo'=v_actor$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  updated := replace(definition, anchor, replacement);
  if updated = definition then
    raise exception 'Task workflow transition marker was not found.';
  end if;
  execute updated;
end;
$migration$;

commit;
