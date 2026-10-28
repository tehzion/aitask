-- A task that does not require internal approval can still sit in Waiting
-- Approval: it was submitted before approval was switched off, or before the
-- 20261023170000 guards. The app lets its responsible Project Manager
-- complete it, but those guards only allowed PM completion from Approved, so
-- such tasks could only be closed by Boss Koo. Restore the responsible PM
-- path for approval mode "none", excluding internal review steps.
--
-- The same guards treated a new task as a Staff status change from nothing
-- to Pending, so Staff could not create tasks at all, including self-assigned
-- tasks they are permitted to create. A new task may start in Pending; every
-- later Staff status change still has to be an available task action.
--
-- That action list also caught HODs, who are stored with the Staff member
-- role: unless an HOD could sign off the specific task, any status move other
-- than start/submit/complete was rejected, including moving department work
-- back to Pending. The list is meant for ordinary Staff; HODs keep their
-- department status management, and approval, completion and revision rules
-- are unchanged.
--
-- The full trigger function is restated rather than patched by text.

create or replace function private.aitask_guard_task_stage_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_hod boolean := private.aitask_is_hod(new.workspace_id) and private.aitask_can_sign_task_review(new.workspace_id,case when tg_op='UPDATE' then old.data else new.data end);
  v_boss boolean := private.aitask_is_super_admin(new.workspace_id);
  v_changed boolean := v_old->>'status' is distinct from new.data->>'status';
  v_percent integer;
  v_system_reopen boolean := false;
begin
  if new.entity_type <> 'task' then return new; end if;
  -- A dependency trigger may withdraw stale downstream review. A direct API
  -- update cannot obtain trigger depth > 1, and every non-reset field must stay
  -- identical. This exception permits no assignee, identity or output change.
  if tg_op='UPDATE' and pg_trigger_depth()>1
    and (coalesce((v_old->>'generatedFromDeliverable')::boolean,false) or coalesce(v_old->>'workflowStepId','')<>'')
    and v_old->>'status' in ('Waiting Approval','Approved','Completed')
    and new.data->>'status'='Pending'
    and new.data->>'isCompleted'='false' and new.data->>'clientApprovalStatus'='Pending'
    and (v_old-array['status','isCompleted','clientApprovalStatus','completionPercentage','internalReview','completedAt'])
      = (new.data-array['status','isCompleted','clientApprovalStatus','completionPercentage','internalReview','completedAt']) then
    v_system_reopen := true;
  end if;

  if v_actor is not null and v_role <> 'Client' then if tg_op='UPDATE' and not v_changed and v_old->>'clientApprovalStatus'='Approved' and new.data->>'clientApprovalStatus' is distinct from 'Approved' and v_old->>'assignedTo' is not distinct from new.data->>'assignedTo' and v_old->>'department' is not distinct from new.data->>'department' then new.data:=new.data||jsonb_build_object('clientApprovalStatus','Approved'); end if;
    if v_old->>'status' in ('Approved','Completed') and new.data->>'status' in ('Approved','Completed')
      and exists(select 1 from unnest(case when v_old->>'status'='Approved'
        then array['title','description','notes','attachmentLink','attachmentName'] else array['title','description','attachmentLink','attachmentName'] end) field
        where coalesce(v_old->>field,'') is distinct from coalesce(new.data->>field,'')) then
      raise check_violation using message='Ask the HOD or project manager to return approved work for revision.';
    end if;
    if new.data->>'clientApprovalStatus'='Approved' and v_old->>'clientApprovalStatus' is distinct from 'Approved'
      and not (new.data->>'status'='Completed' and (v_role='Project Manager' or v_boss)) then
      raise check_violation using message='Only the client can record customer acceptance before final completion.';
    end if;
    if v_changed and new.data->>'status' in ('Approved','Completed') and (v_old->>'assignedTo' is distinct from new.data->>'assignedTo' or v_old->>'department' is distinct from new.data->>'department') then raise check_violation using message='Reassign work before submitting it for review.'; end if; 
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
 then raise check_violation using message='Only an authorized project manager, department reviewer, or Boss Koo can approve submitted work.'; end if;
    if ((new.data->>'status' = 'Completed' and v_changed)
      or (coalesce((new.data->>'isCompleted')::boolean,false) and not coalesce((v_old->>'isCompleted')::boolean,false)))
      and not (
        v_boss
        or (v_role='Project Manager' and v_old->>'status'='Approved')
        or (
          v_role='Project Manager'
          and v_old->>'status'='Waiting Approval'
          and private.aitask_effective_task_approval_mode(new.workspace_id,v_old)='none'
          and coalesce(v_old->>'workflowStepKind','') <> 'internal_review'
          and private.aitask_can_edit_task(new.workspace_id,new.entity_id)
        )
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
    -- HODs are stored with the Staff member role; they manage department task
    -- status and are not limited to the ordinary Staff action list.
    if v_role='Staff' and not private.aitask_is_hod(new.workspace_id) and not v_boss and not v_system_reopen and v_changed
      and not (
        -- A new task starts in Pending; only later status moves are actions.
        (tg_op='INSERT' and new.data->>'status'='Pending')
        or (v_old->>'status' in ('Pending','Revision')
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
  end if;
  if tg_op='UPDATE' and v_actor is not null and v_role <> 'Client' then
    if (v_old->>'assignedTo' is distinct from new.data->>'assignedTo' or v_old->>'department' is distinct from new.data->>'department')
      and v_old->>'status' not in ('Completed','Cancelled') and not v_changed then
      new.data := new.data || jsonb_build_object('status','Pending','clientApprovalStatus','Pending');
    elsif new.data->>'status' in ('In Progress','Revision') and v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed') then
      new.data := new.data || jsonb_build_object('clientApprovalStatus','Rejected','revisionCount',coalesce((v_old->>'revisionCount')::integer,0)+1);
    end if;
    if new.data->>'status'='Completed' and v_changed and (coalesce(new.data->>'visibility','internal') <> 'client-visible' or coalesce(v_old->>'clientApprovalStatus','Pending') = 'Approved' or coalesce(new.data->>'clientApprovalStatus','Pending') = 'Approved') then
      new.data := new.data || jsonb_build_object('clientApprovalStatus','Approved');
    end if;
  end if;
  v_percent := case
    when new.data->>'status'='Cancelled' then 0
    when new.data->>'status'='Completed' then 100
    when new.data->>'status'='Approved' then 80
    when new.data->>'status'='Waiting Approval' then 60
    when new.data->>'clientApprovalStatus'='Rejected' or new.data->>'status'='Revision' then 50
    when new.data->>'status'='In Progress'
      or (nullif(new.data->>'assignedTo','') is not null and new.data->'workState'->>'acceptedBy'=new.data->>'assignedTo') then 30
    when nullif(btrim(new.data->>'assignedTo'),'') is null then 0
    when exists(select 1 from public.aitask_members m where m.workspace_id=new.workspace_id and m.id=new.data->>'assignedTo'
      and (m.role in ('HOD','Project Manager') or m.custom_role_id='builtin-hod')) then 10
    else 20 end;
  new.data := new.data || jsonb_build_object('completionPercentage',v_percent,'isCompleted',new.data->>'status'='Completed');
  return new;
end;
$$
;

revoke all on function private.aitask_guard_task_stage_progress() from public, anon, authenticated;
