-- Older tasks store assignedAt as Postgres wrote it
-- ("2026-07-21T11:01:04.630301+00:00"); the app sends the same moment back as
-- a JavaScript ISO string ("2026-07-21T11:01:04.630Z"). The HOD execution
-- check compared the raw text, saw a changed restricted field, and rejected
-- every HOD save on those tasks with "You do not have permission to make this
-- change." Compare assignedAt as an instant (to the millisecond, as the
-- browser parses it). aitask_guard_entity still restores the stored value
-- whenever the assignee is unchanged, so nothing new can be written.

create or replace function private.aitask_task_instant(p_value jsonb)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_value) = 'string'
      and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$'
    then date_trunc('milliseconds', (p_value #>> '{}')::timestamptz)
  end;
$$;

revoke all on function private.aitask_task_instant(jsonb) from public, anon, authenticated;

create or replace function private.aitask_restricted_task_field_changed(p_field text, p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
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
    -- The same instant written in another timestamp format is not a change.
    when p_field = 'assignedAt'
      and private.aitask_task_instant(p_old) is not null
      and private.aitask_task_instant(p_old) = private.aitask_task_instant(p_new) then false
    when coalesce(p_old, 'null'::jsonb) in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb, '""'::jsonb)
      and coalesce(p_new, 'null'::jsonb) in ('null'::jsonb, '[]'::jsonb, '{}'::jsonb, 'false'::jsonb, '""'::jsonb) then false
    else true
  end;
$$;

revoke all on function private.aitask_restricted_task_field_changed(text, jsonb, jsonb) from public, anon, authenticated;

-- The route-change branch of the HOD check compared assignedAt the same raw
-- way. Patch that one comparison in place so the rest stays byte-identical.
do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_hod_task_execution_patch_is_valid(text,jsonb,jsonb)'::regprocedure);
  v_anchor constant text := 'if p_old_data -> ''assignedAt'' is distinct from p_new_data -> ''assignedAt''';
  v_replacement constant text := 'if private.aitask_restricted_task_field_changed(''assignedAt'', p_old_data -> ''assignedAt'', p_new_data -> ''assignedAt'')';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'HOD assignedAt anchor must occur exactly once';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;
