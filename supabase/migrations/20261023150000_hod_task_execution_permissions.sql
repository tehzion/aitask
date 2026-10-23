-- Keep HOD task management focused on execution. HODs may update the brief,
-- dates, priority and assignment inside an authorized project/department, but
-- may not move the task between projects, companies, services or departments.

create or replace function private.aitask_hod_task_execution_patch_is_valid(
  p_workspace_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_field text;
  v_route_changed boolean := (
    p_old_data ->> 'assignedTo' is distinct from p_new_data ->> 'assignedTo'
    or p_old_data ->> 'responsibleHodId' is distinct from p_new_data ->> 'responsibleHodId'
    or p_old_data ->> 'assignmentState' is distinct from p_new_data ->> 'assignmentState'
  );
  v_restricted_fields text[] := array[
    'projectId', 'projectName', 'clientId', 'clientName', 'serviceType',
    'serviceCycleId', 'deliverableId', 'milestoneId', 'department',
    'visibility', 'customerDetails', 'facebookPage', 'website',
    'isRecurring', 'recurrenceFrequency', 'assignedBy', 'assignedAt',
    'responsibleHodId', 'assignmentState', 'assignmentOverride',
    'reviewEvidence', 'reviewAccess', 'reviewDecision', 'reviewCover',
    'accountableLeadId', 'requiresInternalApproval', 'approvalMode',
    'outputAttachments', 'workflowStepKind', 'workflowStepId',
    'workflowStepOrder', 'workflowStepRequired', 'workflowTemplateId',
    'workflowTemplateRevision', 'generatedFromDeliverable',
    'predecessorTaskIds', 'workflowOutputVersion',
    'workflowDependenciesReady', 'internalReview', 'reviewOverrideReason'
  ];
begin
  if not private.aitask_is_hod(p_workspace_id) then return true; end if;
  -- Assignment metadata is server-shaped by the client store, then checked by
  -- aitask_task_assignment_is_valid below. It may change only in the same
  -- patch as a real route transition; a metadata-only forgery remains denied.
  if not v_route_changed then
    foreach v_field in array v_restricted_fields loop
      if (p_old_data -> v_field) is distinct from (p_new_data -> v_field) then
        return false;
      end if;
    end loop;
  else
    foreach v_field in array v_restricted_fields loop
      if v_field not in ('assignedBy', 'responsibleHodId', 'assignmentState')
        and (p_old_data -> v_field) is distinct from (p_new_data -> v_field) then
        return false;
      end if;
    end loop;
    -- Assignment attribution is not client-authored metadata. The entity
    -- trigger stamps it when assignedTo changes; route-only edits must keep
    -- the stored timestamp and may name only the authenticated HOD as actor.
    if p_old_data -> 'assignedAt' is distinct from p_new_data -> 'assignedAt'
      or p_new_data ->> 'assignedBy' is distinct from private.aitask_member_id(p_workspace_id) then
      return false;
    end if;
  end if;
  return true;
end;
$$;

revoke all on function private.aitask_hod_task_execution_patch_is_valid(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- A HOD may route pending work in the HOD's own department and explicit
-- project scope. Legacy projectless tasks remain routable without first
-- requiring a PM to stamp a new routing field.
do $$
declare
  definition text;
  updated text;
begin
  definition := pg_get_functiondef(
    'private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure
  );
  updated := replace(
    definition,
    $block$
    if v_old_hod <> v_actor_member_id and v_old_assignee <> v_actor_member_id then
      return false;
    end if;
    $block$,
    $block$
    if v_old_hod <> v_actor_member_id
      and v_old_assignee <> v_actor_member_id
      and not (
        v_actor_is_hod
        and v_old_department = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.id = v_actor_member_id
        ), array[]::text[]))
        and (v_project_id is null or private.aitask_hod_is_assigned(p_workspace_id, v_project_id))
      ) then
      return false;
    end if;
    $block$
  );
  if updated = definition then
    raise exception 'HOD assignment boundary was not found; review the current function before applying.';
  end if;
  execute updated;
end;
$$;

-- Explicit project PM assignments are also valid notification recipients.
-- The client already includes projectManagerIds in the fan-out; keep the
-- server audience guard aligned so a valid HOD save cannot roll back merely
-- because the assigned PM is not the project creator.
do $$
declare
  definition text;
  updated text;
  old_block text := $block$
          or recipient.id = (
            select project.created_by from public.aitask_entities project
            where project.workspace_id = new.workspace_id
              and project.entity_type = 'project'
              and project.entity_id = nullif(btrim(coalesce(v_task ->> 'projectId', '')), '')
            limit 1
          )
$block$;
  new_block text := $block$
          or recipient.id = (
            select project.created_by from public.aitask_entities project
            where project.workspace_id = new.workspace_id
              and project.entity_type = 'project'
              and project.entity_id = nullif(btrim(coalesce(v_task ->> 'projectId', '')), '')
            limit 1
          )
          or (
            recipient.role = 'Project Manager'
            and recipient.id in (
              select jsonb_array_elements_text(
                case
                  when jsonb_typeof(project.data -> 'projectManagerIds') = 'array'
                    then project.data -> 'projectManagerIds'
                  else '[]'::jsonb
                end
              )
              from public.aitask_entities project
              where project.workspace_id = new.workspace_id
                and project.entity_type = 'project'
                and project.entity_id = nullif(btrim(coalesce(v_task ->> 'projectId', '')), '')
            )
          )
$block$;
begin
  definition := pg_get_functiondef(
    'private.aitask_guard_staff_notification_insert()'::regprocedure
  );
  updated := replace(definition, old_block, new_block);
  if updated = definition then
    raise exception 'Project Manager notification audience branch was not found; review the current function before applying.';
  end if;
  execute updated;
end;
$$;

-- Extend the latest task mutator wrapper without replacing the historical
-- validator wholesale. The assignment validator remains authoritative for
-- route changes; the execution patch validator covers every other HOD update.
do $$
declare
  definition text;
  updated text;
  old_block text := $block$
  -- HODs are represented as Staff by the historical member-role projection.
  -- Handle an explicit route handoff before the legacy edit gate so an HOD
  -- who currently owns the task can delegate it without gaining broad Staff
  -- mutation authority.
  if p_action = 'update' and p_entity_type = 'task'
    and private.aitask_is_hod(p_workspace_id)
    and (p_old_data ->> 'assignedTo' = v_member_id or p_old_data ->> 'responsibleHodId' = v_member_id)
    and (
      p_old_data ->> 'assignedTo' is distinct from p_new_data ->> 'assignedTo'
      or p_old_data ->> 'responsibleHodId' is distinct from p_new_data ->> 'responsibleHodId'
      or p_old_data ->> 'assignmentState' is distinct from p_new_data ->> 'assignmentState'
    ) then
    return private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);
  end if;
$block$;
  new_block text := $block$
  if p_action = 'update' and p_entity_type = 'task'
    and private.aitask_is_hod(p_workspace_id) then
    if not private.aitask_hod_task_execution_patch_is_valid(p_workspace_id, p_old_data, p_new_data) then
      return false;
    end if;
    if (
      p_old_data ->> 'assignedTo' is distinct from p_new_data ->> 'assignedTo'
      or p_old_data ->> 'responsibleHodId' is distinct from p_new_data ->> 'responsibleHodId'
      or p_old_data ->> 'assignmentState' is distinct from p_new_data ->> 'assignmentState'
    ) then
      return private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);
    end if;
  end if;
$block$;
begin
  definition := pg_get_functiondef(
    'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure
  );
  updated := replace(definition, old_block, new_block);
  if updated = definition then
    raise exception 'Task mutator HOD route block was not found; review the current function before applying.';
  end if;
  execute updated;
end;
$$;

-- Staff-normalized HOD commands can notify the assigned Staff and accountable
-- PM/contact when task execution details change. The trigger still rewrites
-- message text from canonical task data and enforces the same audience rules.
do $$
declare
  definition text;
  updated text;
  old_block text := $block$
    when v_title = 'Task Status Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" was moved to '
        || left(coalesce(v_task ->> 'status', 'Updated'), 80) || ' by ' || v_actor_name || '.'
$block$;
  new_block text := $block$
    when v_title = 'Task Status Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" was moved to '
        || left(coalesce(v_task ->> 'status', 'Updated'), 80) || ' by ' || v_actor_name || '.'
    when v_title = 'Task Dates Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then 'The dates for "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" were updated by ' || v_actor_name || '.'
    when v_title = 'Task Instructions Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then 'The instructions for "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" were updated by ' || v_actor_name || '.'
$block$;
begin
  definition := pg_get_functiondef(
    'private.aitask_guard_staff_notification_insert()'::regprocedure
  );
  updated := replace(definition, old_block, new_block);
  if updated = definition then
    raise exception 'Staff notification status branch was not found; review the current function before applying.';
  end if;
  execute updated;
end;
$$;
