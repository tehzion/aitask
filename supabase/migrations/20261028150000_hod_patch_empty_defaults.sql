-- HOD saves from the app were rejected for most ordinary tasks. The HOD
-- execution patch validator compared restricted fields with "is distinct
-- from", but the app's payload differs from the stored row in harmless ways:
--   * it fills absent fields with their defaults (predecessorTaskIds: [],
--     generatedFromDeliverable: false, requiresInternalApproval: true,
--     recurrenceFrequency: "None");
--   * it omits accountableLeadId and reviewCover, which
--     aitask_guard_task_review_config restores from the stored task;
--   * it strips server-owned review and workflow state (workflowStepKind,
--     workflowOutputVersion, workflowDependenciesReady, internalReview,
--     reviewDecision, reviewAccess, reviewEvidence), which the server
--     recomputes or stamps on every write.
-- Treat those as unchanged. Any real change to a restricted field is still
-- denied.
--
-- The full validator is restated rather than patched by text.

create or replace function private.aitask_restricted_task_field_changed(p_field text, p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    -- Server-owned review and workflow state: aitask_guard_workflow_task and
    -- aitask_stamp_task_review_decision replace whatever a client sends, and
    -- the app strips these fields before saving.
    when p_field in (
      'workflowStepKind', 'workflowOutputVersion', 'workflowDependenciesReady', 'internalReview',
      'reviewDecision', 'reviewAccess', 'reviewEvidence'
    ) then false
    -- aitask_guard_task_review_config restores an omitted lead or cover from
    -- the stored task, so leaving them out of a payload changes nothing.
    when p_field in ('accountableLeadId', 'reviewCover') and p_new is null then false
    -- An absent requiresInternalApproval means approval is required.
    when p_field = 'requiresInternalApproval'
      then coalesce(p_old, 'true'::jsonb) is distinct from coalesce(p_new, 'true'::jsonb)
    -- An absent recurrenceFrequency means the task does not repeat.
    when p_field = 'recurrenceFrequency'
      then coalesce(p_old, '"None"'::jsonb) is distinct from coalesce(p_new, '"None"'::jsonb)
    when p_old is not distinct from p_new then false
    when coalesce(p_old, 'null'::jsonb) in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb, '""'::jsonb)
      and coalesce(p_new, 'null'::jsonb) in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb, '""'::jsonb) then false
    else true
  end;
$$;

revoke all on function private.aitask_restricted_task_field_changed(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

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
      if private.aitask_restricted_task_field_changed(v_field, p_old_data -> v_field, p_new_data -> v_field) then
        return false;
      end if;
    end loop;
  else
    foreach v_field in array v_restricted_fields loop
      if v_field not in ('assignedBy', 'responsibleHodId', 'assignmentState')
        and private.aitask_restricted_task_field_changed(v_field, p_old_data -> v_field, p_new_data -> v_field) then
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
