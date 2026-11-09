-- Bind task status transitions to the workflow action they represent.
-- The client exposes contextual actions, but the trigger remains the final
-- authority for direct RPC callers and forged generic task.update payloads.

do $$
declare
  definition text;
  updated text;
  old_completion text := $block$
    if ((new.data->>'status' = 'Completed' and v_changed)
      or (coalesce((new.data->>'isCompleted')::boolean,false) and not coalesce((v_old->>'isCompleted')::boolean,false)))
      and not (v_boss or (v_role='Project Manager' and (v_old->>'status'='Approved' or (v_old->>'status'='Waiting Approval' and coalesce((v_old->>'requiresInternalApproval')::boolean, true) = false and coalesce(v_old->>'workflowStepKind', '') <> 'internal_review')))) then
      raise check_violation using message='Only a project manager can confirm completion after internal approval.';
    end if;
$block$;
  new_completion text := $block$
    if ((new.data->>'status' = 'Completed' and v_changed)
      or (coalesce((new.data->>'isCompleted')::boolean,false) and not coalesce((v_old->>'isCompleted')::boolean,false)))
      and not (
        v_boss
        or (v_role='Project Manager' and v_old->>'status'='Approved')
        or (
          v_role='Staff'
          and not v_hod
          and v_old->>'status'='In Progress'
          and v_old->>'assignedTo'=v_actor
          and private.aitask_effective_task_approval_mode(new.workspace_id,v_old)='none'
          and coalesce(v_old->>'workflowStepKind','') <> 'internal_review'
        )
      ) then
      raise check_violation using message='Only the assigned Staff member can complete a task without internal approval.';
    end if;
$block$;
  old_approval text := $block$if new.data->>'status'='Approved' and v_changed and not(v_old->>'status'='Waiting Approval' and private.aitask_can_sign_task_review(new.workspace_id,v_old,new.data->>'reviewOverrideReason'))$block$;
  new_approval text := $block$
if new.data->>'status'='Waiting Approval' and v_changed
      and coalesce(v_old->>'workflowStepKind','') <> 'internal_review'
      and private.aitask_effective_task_approval_mode(new.workspace_id,v_old)='none' then
      raise check_violation using message='This task does not require internal approval. Complete the task instead.';
    end if;
    if new.data->>'status'='Waiting Approval' and v_changed
      and not (
        v_boss
        or v_old->>'assignedTo'=v_actor
        or (v_role='Project Manager' and private.aitask_can_edit_task(new.workspace_id,new.entity_id))
      ) then
      raise check_violation using message='Only the assigned executor or responsible Project Manager can submit this task for review.';
    end if;
if new.data->>'status'='Approved' and v_changed and not(v_old->>'status'='Waiting Approval' and private.aitask_can_sign_task_review(new.workspace_id,v_old,new.data->>'reviewOverrideReason'))
$block$;
  old_staff_guard text := $block$
    if v_role='Staff' and not v_hod and not v_boss and not v_system_reopen and (
      (v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed'))
      or (v_changed and new.data->>'status'='Revision')
      or coalesce((new.data->>'revisionCount')::integer,0)>coalesce((v_old->>'revisionCount')::integer,0)
      or (new.data->>'clientApprovalStatus'='Rejected' and v_old->>'clientApprovalStatus' is distinct from 'Rejected')
    ) then raise check_violation using message='Ask the HOD or project manager to return approved work for revision.'; end if;
$block$;
  new_staff_guard text := $block$
    if v_role='Staff' and not v_hod and not v_boss and not v_system_reopen and v_changed
      and not (
        (v_old->>'status' in ('Pending','Revision')
          and new.data->>'status'='In Progress'
          and v_old->>'assignedTo'=v_actor)
        or (v_old->>'status'='In Progress'
          and new.data->>'status'='Waiting Approval'
          and v_old->>'assignedTo'=v_actor)
        or (v_old->>'status'='In Progress'
          and new.data->>'status'='Completed'
          and v_old->>'assignedTo'=v_actor
          and private.aitask_effective_task_approval_mode(new.workspace_id,v_old)='none'
          and coalesce(v_old->>'workflowStepKind','') <> 'internal_review')
      ) then
      raise check_violation using message='Use the available task action for this workflow stage.';
    end if;
    if v_role='Staff' and not v_hod and not v_boss and not v_system_reopen and (
      (v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed'))
      or (v_changed and new.data->>'status'='Revision')
      or coalesce((new.data->>'revisionCount')::integer,0)>coalesce((v_old->>'revisionCount')::integer,0)
      or (new.data->>'clientApprovalStatus'='Rejected' and v_old->>'clientApprovalStatus' is distinct from 'Rejected')
    ) then raise check_violation using message='Ask the HOD or project manager to return approved work for revision.'; end if;
$block$;
begin
  definition := pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  updated := replace(definition, old_completion, new_completion);
  if updated = definition then
    raise exception 'Task completion guard was not found; review the current function before applying.';
  end if;
  if position(old_approval in updated) = 0 then
    raise exception 'Task approval guard was not found; review the current function before applying.';
  end if;
  updated := replace(updated, old_approval, new_approval);
  if position(old_staff_guard in updated) = 0 then
    raise exception 'Task Staff transition guard was not found; review the current function before applying.';
  end if;
  updated := replace(updated, old_staff_guard, new_staff_guard);
  execute updated;
end;
$$;

