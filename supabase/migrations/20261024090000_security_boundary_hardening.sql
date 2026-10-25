-- Security re-audit hardening.
--
-- This migration closes five boundaries without changing the legacy command
-- protocol: service-file references carry uploader provenance, Auth owns
-- email-change confirmation, feedback throttling no longer trusts forwarding
-- headers, HOD task patches use an explicit field allow-list, and staging QA
-- is isolated from pull-request revisions in the workflow file.

-- The task-stage migration replaced the earlier Client merge trigger and
-- regressed PM-completed deliveries: an approval changed them back to 80% and
-- cleared isCompleted. Preserve the canonical task completion when the Client
-- records the separate acceptance decision.
create or replace function private.aitask_merge_client_approval_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_type = 'task'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true'
    and private.aitask_member_role(old.workspace_id) = 'Client' then
    new.data := old.data || jsonb_build_object(
      'clientApprovalStatus', new.data -> 'clientApprovalStatus',
      'status', case
        when new.data ->> 'clientApprovalStatus' = 'Approved'
          and (coalesce((old.data ->> 'isCompleted')::boolean, false)
            or old.data ->> 'status' = 'Completed') then old.data -> 'status'
        when new.data ->> 'clientApprovalStatus' = 'Approved' then to_jsonb('Approved'::text)
        else to_jsonb('In Progress'::text)
      end,
      'isCompleted', case
        when new.data ->> 'clientApprovalStatus' = 'Approved'
          and (coalesce((old.data ->> 'isCompleted')::boolean, false)
            or old.data ->> 'status' = 'Completed') then old.data -> 'isCompleted'
        else 'false'::jsonb
      end,
      'completionPercentage', case
        when new.data ->> 'clientApprovalStatus' = 'Approved'
          and (coalesce((old.data ->> 'isCompleted')::boolean, false)
            or old.data ->> 'status' = 'Completed') then old.data -> 'completionPercentage'
        when new.data ->> 'clientApprovalStatus' = 'Approved' then to_jsonb(80)
        else to_jsonb(50)
      end,
      'revisionCount', coalesce((old.data ->> 'revisionCount')::integer, 0)
        + case when new.data ->> 'clientApprovalStatus' = 'Rejected' then 1 else 0 end,
      'completedAt', case
        when new.data ->> 'clientApprovalStatus' = 'Approved'
          and (coalesce((old.data ->> 'isCompleted')::boolean, false)
            or old.data ->> 'status' = 'Completed') then old.data -> 'completedAt'
        else 'null'::jsonb
      end
    );
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_merge_client_approval_task()
  from public, anon, authenticated;

create or replace function private.aitask_guard_scoped_staff_service_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
  v_actor_id text := private.aitask_member_id(v_workspace_id);
  v_expected_cycle_status text;
  v_cycle_id text;
  v_client_id text;
  v_attachments jsonb;
begin
  if v_entity_type not in ('service_cycle', 'deliverable', 'cycle_comment') then
    return coalesce(new, old);
  end if;
  if private.aitask_member_role(v_workspace_id) is distinct from 'Staff'
    or private.aitask_has_permission(v_workspace_id, 'manageServiceCycles') then
    return coalesce(new, old);
  end if;

  if v_entity_type = 'service_cycle' then
    if tg_op <> 'UPDATE'
      or (old.data - array['status', 'publishedAt', 'updatedAt']::text[])
        is distinct from (new.data - array['status', 'publishedAt', 'updatedAt']::text[]) then
      raise check_violation using message = 'Staff cannot administer service cycles.';
    end if;

    select case
      when count(*) > 0 and bool_and(deliverable.data ->> 'status' = 'Delivered') then 'Completed'
      when old.data ->> 'status' = 'Completed' then 'Published'
      else null
    end into v_expected_cycle_status
    from public.aitask_entities deliverable
    where deliverable.workspace_id = v_workspace_id
      and deliverable.entity_type = 'deliverable'
      and deliverable.cycle_id = old.entity_id;
    if v_expected_cycle_status is null or new.data ->> 'status' <> v_expected_cycle_status then
      raise check_violation using message = 'Staff cannot publish or manually change service cycles.';
    end if;
    return new;
  end if;

  if v_entity_type = 'deliverable' then
    if tg_op <> 'UPDATE'
      or (
        not private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'deliveredAt', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'deliveredAt', 'updatedAt']::text[])
      )
      or (
        private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'taskIds', 'deliveredAt', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'taskIds', 'deliveredAt', 'updatedAt']::text[])
      )
      or new.data ->> 'status' not in ('Planned', 'In Progress', 'Ready', 'Delivered') then
      raise check_violation using message = 'Staff may update deliverable execution fields only.';
    end if;
    return new;
  end if;

  if v_entity_type = 'cycle_comment' then
    v_cycle_id := coalesce(new.data ->> 'cycleId', old.data ->> 'cycleId');
    v_client_id := coalesce(new.data ->> 'clientId', old.data ->> 'clientId');
    if not exists (
      select 1
      from public.aitask_entities cycle
      where cycle.workspace_id = v_workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.entity_id = v_cycle_id
        and cycle.client_id = v_client_id
    ) then
      raise check_violation using message = 'Cycle comment scope is invalid.';
    end if;

    v_attachments := coalesce(new.data -> 'attachments', '[]'::jsonb);
    if jsonb_typeof(v_attachments) <> 'array'
      or exists (
        select 1
        from jsonb_array_elements(case when jsonb_typeof(v_attachments) = 'array' then v_attachments else '[]'::jsonb end) attachment
        where jsonb_typeof(attachment) <> 'object'
          or attachment ->> 'bucket' <> 'client-service-files'
          or nullif(btrim(attachment ->> 'path'), '') is null
          or attachment ->> 'uploadedBy' is distinct from new.data ->> 'userId'
      ) then
      raise check_violation using message = 'Cycle comment attachments must retain uploader provenance.';
    end if;

    if tg_op = 'INSERT' then
      if new.data ->> 'userId' <> v_actor_id
        or btrim(coalesce(new.data ->> 'text', '')) = ''
        or length(new.data ->> 'text') > 10000
        or new.data ->> 'visibility' not in ('internal', 'client-visible') then
        raise check_violation using message = 'Staff comments must be valid and owned by the signed-in member.';
      end if;
      return new;
    elsif tg_op = 'UPDATE' then
      if old.data ->> 'userId' <> v_actor_id
        or new.data ->> 'userId' <> v_actor_id
        or (old.data - array['attachments', 'updatedAt']::text[])
          is distinct from (new.data - array['attachments', 'updatedAt']::text[]) then
        raise check_violation using message = 'Staff may update attachments on their own cycle comments only.';
      end if;
      return new;
    end if;
  end if;

  raise check_violation using message = 'Staff cannot create or delete service-management records.';
end;
$$;

revoke all on function private.aitask_guard_scoped_staff_service_write()
  from public, anon, authenticated, service_role;

create or replace function private.aitask_can_read_service_file(p_workspace_id text,p_client_id text,p_cycle_id text,p_object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    private.aitask_can_read_review_output_file(p_workspace_id,p_client_id,p_cycle_id,p_object_name)
    or (private.aitask_member_role(p_workspace_id)<>'Client' and private.aitask_can_access_service_client(p_workspace_id,p_client_id))
    or (
      private.aitask_member_role(p_workspace_id)='Client'
      and private.aitask_can_access_service_client(p_workspace_id,p_client_id)
      and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=p_cycle_id and cycle.client_id=p_client_id and cycle.data->>'status' in ('Published','Completed'))
      and exists(
        select 1
        from public.aitask_entities comment
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(comment.data->'attachments') = 'array' then comment.data->'attachments' else '[]'::jsonb end
        ) attachment
        join public.aitask_members uploader
          on uploader.workspace_id=p_workspace_id
         and uploader.id=attachment->>'uploadedBy'
        join storage.objects object
          on object.bucket_id='client-service-files'
         and object.name=p_object_name
         and object.owner_id=uploader.auth_user_id::text
        where comment.workspace_id=p_workspace_id and comment.entity_type='cycle_comment' and comment.client_id=p_client_id
          and comment.cycle_id=p_cycle_id and comment.data->>'visibility'='client-visible'
          and comment.data->>'userId'=attachment->>'uploadedBy'
          and attachment->>'bucket'='client-service-files'
          and attachment->>'path'=p_object_name
      )
    ),false
  );
$$;

revoke all on function private.aitask_can_read_service_file(text,text,text,text) from public,anon;
grant execute on function private.aitask_can_read_service_file(text,text,text,text) to authenticated,service_role;

-- A department reviewer can approve a task they do not otherwise edit. The
-- task command already validates that review, but its paired status notice was
-- still checked against the narrower task-edit predicate and rolled back the
-- entire command. Allow only the canonical approval notice after a successful
-- reviewer transition; keep the existing task-context and recipient checks.
do $review_notifications$
declare
  definition text;
  old_block text := $old$
  if v_task is null or not private.aitask_can_edit_task(new.workspace_id, v_task_id) then
    raise check_violation using message = 'Staff notifications require an editable task.';
  end if;
$old$;
  new_block text := $new$
  if v_task is null or not (
    private.aitask_can_edit_task(new.workspace_id, v_task_id)
    or (
      v_command_type = 'task.update'
      and v_title = 'Task Status Updated'
      and v_task ->> 'status' = 'Approved'
      and private.aitask_can_sign_task_review(new.workspace_id, v_task)
    )
  ) then
    raise check_violation using message = 'Staff notifications require an editable task or an authorized review.';
  end if;
$new$;
begin
  definition := pg_get_functiondef('private.aitask_guard_staff_notification_insert()'::regprocedure);
  if (length(definition) - length(replace(definition, old_block, ''))) / length(old_block) <> 1 then
    raise exception 'Expected one Staff notification task-edit guard';
  end if;
  execute replace(definition, old_block, new_block);
end;
$review_notifications$;

-- A command whose response was lost must replay its receipt before checking a
-- now-stale workspace version. Keep authorization and the actor-scoped receipt
-- lock in front of the version check, and acquire the command lock before row
-- locks so concurrent retries follow one lock order.
do $idempotent_workspace_retries$
declare
  signature text;
  definition text;
  version_guard text := $version$  if p_expected_workspace_version is not null then
    select workspace.version, workspace.updated_at into v_workspace_version, v_workspace_updated
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if v_workspace_version is distinct from p_expected_workspace_version then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT',
        'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
        'conflict', jsonb_build_object(
          'entityType', 'workspace', 'entityId', p_workspace_id,
          'expectedVersion', p_expected_workspace_version, 'actualVersion', v_workspace_version,
          'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
        )
      );
    end if;
  end if;
$version$;
  service_version_guard text := $service_version$  if p_expected_workspace_version is not null then
    select workspace.version, workspace.updated_at into v_workspace_version, v_workspace_updated
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if v_workspace_version is distinct from p_expected_workspace_version then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT',
        'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
        'conflict', jsonb_build_object(
          'entityType', 'workspace',
          'entityId', p_workspace_id,
          'expectedVersion', p_expected_workspace_version,
          'actualVersion', v_workspace_version,
          'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
        )
      );
    end if;
  end if;
$service_version$;
  command_receipt text := $receipt$perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_existing_command_response
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_actor_id
    and receipt.command_id = p_command_id;
  if v_existing_command_response is not null then
    return v_existing_command_response || jsonb_build_object('replayed', true);
  end if;
$receipt$;
  cascade_receipt text := $cascade$perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_existing
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_actor_id
    and receipt.command_id = p_command_id;
  if v_existing is not null then
    return v_existing || jsonb_build_object('replayed', true);
  end if;
$cascade$;
  old_service_receipt text := '  if v_existing is not null then return v_existing || jsonb_build_object(''replayed'', true); end if;';
begin
  signature := 'public.aitask_execute_command_with_lock_before_staff_context(text,uuid,text,jsonb,bigint)';
  definition := pg_get_functiondef(signature::regprocedure);
  if (length(definition) - length(replace(definition, version_guard, ''))) / length(version_guard) <> 1 then
    raise exception 'Expected one workspace version guard in %.', signature;
  end if;
  definition := replace(definition, version_guard, '');
  if strpos(definition, '  v_workspace_updated timestamptz;' || chr(10)) = 0 then
    raise exception 'Expected workspace version declarations in %.', signature;
  end if;
  definition := replace(definition, '  v_workspace_updated timestamptz;' || chr(10), '  v_workspace_updated timestamptz;' || chr(10) || '  v_existing_command_response jsonb;' || chr(10));
  if strpos(definition, '  perform set_config(''aitask.command_type'', p_command_type, true);') = 0 then
    raise exception 'Expected command execution tail in %.', signature;
  end if;
  definition := replace(
    definition,
    '  perform set_config(''aitask.command_type'', p_command_type, true);',
    command_receipt || version_guard || '  perform set_config(''aitask.command_type'', p_command_type, true);'
  );
  execute definition;

  signature := 'private.aitask_delete_client_cascade(text,uuid,jsonb,bigint)';
  definition := pg_get_functiondef(signature::regprocedure);
  if strpos(definition, '  select workspace.version, workspace.updated_at' || chr(10) || '  into v_workspace_version, v_workspace_updated') = 0 then
    raise exception 'Expected company cascade workspace lock in %.', signature;
  end if;
  definition := replace(
    definition,
    '  select workspace.version, workspace.updated_at' || chr(10) || '  into v_workspace_version, v_workspace_updated',
    cascade_receipt || '  select workspace.version, workspace.updated_at' || chr(10) || '  into v_workspace_version, v_workspace_updated'
  );
  execute definition;

  signature := 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)';
  definition := pg_get_functiondef(signature::regprocedure);
  if (length(definition) - length(replace(definition, service_version_guard, ''))) / length(service_version_guard) <> 1 then
    raise exception 'Expected one workspace version guard in %.', signature;
  end if;
  definition := replace(definition, service_version_guard, '');
  if strpos(definition, old_service_receipt) = 0 then
    raise exception 'Expected service receipt result in %.', signature;
  end if;
  definition := replace(definition, old_service_receipt, old_service_receipt || chr(10) || service_version_guard);
  execute definition;
end;
$idempotent_workspace_retries$;

-- Auth's secure email-change flow is the source of truth. Once the new
-- address is confirmed, mirror it into the workspace member projection.
create or replace function private.aitask_sync_member_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null
    and (
      new.email is distinct from old.email
      or new.email_confirmed_at is distinct from old.email_confirmed_at
    ) then
    update public.aitask_members
    set email = lower(new.email), updated_at = now()
    where auth_user_id = new.id
      and lower(coalesce(email, '')) is distinct from lower(new.email);
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_sync_member_email_from_auth() from public, anon, authenticated;
drop trigger if exists aitask_sync_member_email_from_auth on auth.users;
create trigger aitask_sync_member_email_from_auth
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.aitask_sync_member_email_from_auth();

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
  v_server_context_field text;
  v_omitted_server_context_fields text[] := array[
    'reviewAccess', 'reviewEvidence', 'reviewDecision',
    'workflowStepKind', 'workflowOutputVersion',
    'workflowDependenciesReady', 'internalReview'
  ];
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
    'clientApprovalStatus', 'reviewEvidence', 'reviewAccess', 'reviewDecision', 'reviewCover',
    'accountableLeadId', 'requiresInternalApproval', 'approvalMode',
    'outputAttachments', 'workflowStepKind', 'workflowStepId',
    'workflowStepOrder', 'workflowStepRequired', 'workflowTemplateId',
    'workflowTemplateRevision', 'generatedFromDeliverable',
    'predecessorTaskIds', 'workflowOutputVersion',
    'workflowDependenciesReady', 'internalReview', 'reviewOverrideReason'
  ];
  v_allowed_fields text[] := array[
    'title', 'description', 'startDate', 'dueDate', 'priority', 'status',
    'completionPercentage', 'attachmentLink', 'attachmentName', 'notes',
    'assignedTo', 'clientApprovalStatus', 'workState', 'workHistory',
    'updatedAt', 'isCompleted', 'completedAt', 'revisionCount',
    'assignedBy', 'assignedAt', 'responsibleHodId', 'assignmentState',
    'dueReminderSent', 'comments',
    'assignmentOverride'
  ];
begin
  -- Review configuration is inserted by the server-side trigger. Older or
  -- already-open clients may submit a complete task snapshot that predates
  -- those fields; the trigger itself restores omitted configuration. Compare
  -- against the same canonical values here, while continuing to reject any
  -- explicit client-authored change.
  if p_old_data ? 'accountableLeadId' and not (coalesce(p_new_data, '{}'::jsonb) ? 'accountableLeadId') then
    p_new_data := coalesce(p_new_data, '{}'::jsonb) || jsonb_build_object('accountableLeadId', p_old_data -> 'accountableLeadId');
  end if;
  if p_old_data ? 'reviewCover' and not (coalesce(p_new_data, '{}'::jsonb) ? 'reviewCover') then
    p_new_data := coalesce(p_new_data, '{}'::jsonb) || jsonb_build_object('reviewCover', p_old_data -> 'reviewCover');
  end if;
  -- These values are loaded from the canonical workflow-context RPC and are
  -- deliberately omitted from workspace entity writes. Treat omission as an
  -- unchanged server-owned value; an explicit client-authored difference is
  -- still rejected by the allow-list and restricted-field checks below.
  foreach v_server_context_field in array v_omitted_server_context_fields loop
    if p_old_data ? v_server_context_field
      and not (coalesce(p_new_data, '{}'::jsonb) ? v_server_context_field) then
      p_new_data := coalesce(p_new_data, '{}'::jsonb)
        || jsonb_build_object(v_server_context_field, p_old_data -> v_server_context_field);
    end if;
  end loop;
  if not private.aitask_is_hod(p_workspace_id) then return true; end if;

  -- The old deny-list allowed a newly introduced JSON field to become an
  -- authorization bypass. Unknown changed fields are now denied by default.
  for v_field in
    select key
    from jsonb_object_keys(coalesce(p_old_data, '{}'::jsonb) || coalesce(p_new_data, '{}'::jsonb)) as keys(key)
  loop
    if (p_old_data -> v_field) is distinct from (p_new_data -> v_field)
      and not (v_field = any(v_allowed_fields)) then
      return false;
    end if;
  end loop;

  -- Client approval is a workflow transition, not an arbitrary HOD-owned
  -- field. HODs may record a rejection only while returning work to revision.
  if p_old_data ->> 'clientApprovalStatus' is distinct from p_new_data ->> 'clientApprovalStatus'
    and (
      p_old_data ->> 'status' is not distinct from p_new_data ->> 'status'
      or p_old_data ->> 'status' not in ('Waiting Approval', 'Approved', 'Completed')
      or p_new_data ->> 'status' not in ('In Progress', 'Revision')
      or p_new_data ->> 'clientApprovalStatus' <> 'Rejected'
    ) then
    return false;
  end if;

  -- Revision requests may append one comment authored by the current HOD;
  -- rewriting old comments or injecting another author's comment is denied.
  if coalesce(p_old_data -> 'comments', '[]'::jsonb) is distinct from coalesce(p_new_data -> 'comments', '[]'::jsonb) then
    if jsonb_typeof(coalesce(p_old_data -> 'comments', '[]'::jsonb)) is distinct from 'array'
      or jsonb_typeof(coalesce(p_new_data -> 'comments', '[]'::jsonb)) is distinct from 'array'
      or jsonb_array_length(coalesce(p_new_data -> 'comments', '[]'::jsonb)) < jsonb_array_length(coalesce(p_old_data -> 'comments', '[]'::jsonb))
      or exists (
        select 1
        from generate_series(0, jsonb_array_length(coalesce(p_old_data -> 'comments', '[]'::jsonb)) - 1) as comment_index(i)
        where (coalesce(p_old_data -> 'comments', '[]'::jsonb) -> i) is distinct from (coalesce(p_new_data -> 'comments', '[]'::jsonb) -> i)
      )
      or (coalesce(p_new_data -> 'comments', '[]'::jsonb) -> (jsonb_array_length(coalesce(p_new_data -> 'comments', '[]'::jsonb)) - 1)) ->> 'userId'
        is distinct from private.aitask_member_id(p_workspace_id) then
      return false;
    end if;
  end if;

  -- Date edits may clear the reminder marker, but cannot suppress reminders
  -- by setting an arbitrary truthy value.
  if p_old_data -> 'dueReminderSent' is distinct from p_new_data -> 'dueReminderSent'
    and p_new_data ->> 'dueReminderSent' is distinct from 'false' then
    return false;
  end if;

  -- Identity and creator attribution are never HOD-editable, even when a
  -- future migration adds a field to the normal execution allow-list.
  if p_old_data ->> 'createdBy' is distinct from p_new_data ->> 'createdBy'
    or p_old_data ->> 'userId' is distinct from p_new_data ->> 'userId' then
    return false;
  end if;

  if not v_route_changed then
    foreach v_field in array v_restricted_fields loop
      if v_field <> 'clientApprovalStatus'
        and (p_old_data -> v_field) is distinct from (p_new_data -> v_field) then
        return false;
      end if;
    end loop;
  else
    foreach v_field in array v_restricted_fields loop
      if v_field not in ('assignedBy', 'responsibleHodId', 'assignmentState', 'clientApprovalStatus')
        and (p_old_data -> v_field) is distinct from (p_new_data -> v_field) then
        return false;
      end if;
    end loop;
    -- Assignment attribution is server-shaped; route-only edits cannot forge
    -- the actor or timestamp.
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

-- The HOD patch guard already limits execution fields, but the existing task
-- mutator then fell through to its historical Staff authorization branch.
-- HODs are projected as Staff there, so a department-authorized HOD who was
-- neither the task assignee nor creator could not save an otherwise valid
-- execution edit. Keep route changes on the assignment validator and require
-- the established task-scope predicate for every other HOD task update.
do $hod_task_mutation$
declare
  definition text;
  updated text;
  old_block text := $old$
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
$old$;
  new_block text := $new$
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
    return private.aitask_can_edit_task(p_workspace_id, p_entity_id);
  end if;
$new$;
begin
  definition := pg_get_functiondef(
    'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure
  );
  updated := replace(definition, old_block, new_block);
  if updated = definition then
    raise exception 'Expected one HOD task mutation branch; review the current mutator before applying.';
  end if;
  execute updated;
end;
$hod_task_mutation$;

-- A workflow-generation service command may update the parent deliverable only
-- to attach the generated tasks created by that same atomic command.
create or replace function private.aitask_workflow_generation_deliverable_is_valid(
  p_workspace_id text,
  p_operations jsonb,
  p_deliverable_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_operations) is distinct from 'array'
    or jsonb_typeof(p_old_data -> 'taskIds') is distinct from 'array'
    or jsonb_typeof(p_new_data -> 'taskIds') is distinct from 'array'
    or (p_old_data - array['taskIds', 'workflowGeneratedAt', 'workflowGenerationId', 'updatedAt']::text[])
      is distinct from (p_new_data - array['taskIds', 'workflowGeneratedAt', 'workflowGenerationId', 'updatedAt']::text[])
    or not ((p_new_data -> 'taskIds') @> (p_old_data -> 'taskIds'))
    or nullif(btrim(p_new_data ->> 'workflowGenerationId'), '') is null
    or nullif(btrim(p_new_data ->> 'workflowGeneratedAt'), '') is null
    or nullif(btrim(p_old_data ->> 'workflowGenerationId'), '') is not null
    or exists (
      select 1 from public.aitask_entities task
      where task.workspace_id = p_workspace_id and task.entity_type = 'task'
        and task.data ->> 'deliverableId' = p_deliverable_id
        and coalesce((task.data ->> 'generatedFromDeliverable')::boolean, false)
    )
    or exists (
      select 1 from jsonb_array_elements_text(p_new_data -> 'taskIds') linked(value)
      group by linked.value having count(*) > 1
    ) then
    return false;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_operations) operation
    where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'task'
      and operation ->> 'action' = 'insert'
      and operation -> 'data' ->> 'deliverableId' = p_deliverable_id
      and operation -> 'data' ->> 'clientId' = p_old_data ->> 'clientId'
      and operation -> 'data' ->> 'serviceCycleId' = p_old_data ->> 'cycleId'
      and coalesce((operation -> 'data' ->> 'generatedFromDeliverable')::boolean, false)
      and (p_new_data -> 'taskIds') ? (operation ->> 'entityId')
  ) then
    return false;
  end if;

  if exists (
    select 1 from jsonb_array_elements_text(p_new_data -> 'taskIds') linked(value)
    where not ((coalesce(p_old_data -> 'taskIds', '[]'::jsonb)) ? linked.value)
      and not exists (
        select 1 from jsonb_array_elements(p_operations) operation
        where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'task'
          and operation ->> 'action' = 'insert' and operation ->> 'entityId' = linked.value
          and operation -> 'data' ->> 'deliverableId' = p_deliverable_id
          and operation -> 'data' ->> 'clientId' = p_old_data ->> 'clientId'
          and operation -> 'data' ->> 'serviceCycleId' = p_old_data ->> 'cycleId'
          and coalesce((operation -> 'data' ->> 'generatedFromDeliverable')::boolean, false)
      )
  ) or exists (
    select 1 from jsonb_array_elements(p_operations) operation
    where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'task'
      and operation ->> 'action' = 'insert'
      and operation -> 'data' ->> 'deliverableId' = p_deliverable_id
      and (not coalesce((operation -> 'data' ->> 'generatedFromDeliverable')::boolean, false)
        or not ((p_new_data -> 'taskIds') ? (operation ->> 'entityId'))
        or operation -> 'data' ->> 'clientId' is distinct from p_old_data ->> 'clientId'
        or operation -> 'data' ->> 'serviceCycleId' is distinct from p_old_data ->> 'cycleId')
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.aitask_workflow_generation_deliverable_is_valid(text, jsonb, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- Plan activation is the one client_plan.manage operation that may create a
-- service cycle and its deliverables. Keep cycle/deliverable updates bound to
-- their dedicated commands and validate activation as one atomic bundle.
create or replace function private.aitask_client_plan_activation_bundle_is_valid(
  p_workspace_id text,
  p_operations jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan_operation jsonb;
  v_cycle_operation jsonb;
  v_price_operation jsonb;
  v_plan_id text;
  v_cycle_id text;
  v_old_plan jsonb;
  v_plan_price jsonb;
  v_new_plan jsonb;
  v_cycle jsonb;
  v_price jsonb;
  v_expected_deliverables integer;
  v_actual_deliverables integer;
begin
  if jsonb_typeof(p_operations) is distinct from 'array'
    or (select count(*) from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'client_plan' and operation ->> 'action' = 'update') <> 1
    or (select count(*) from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'service_cycle' and operation ->> 'action' = 'insert') <> 1
    or (select count(*) from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity' and operation ->> 'entityType' = 'service_pricing_snapshot'
        and operation ->> 'action' = 'insert' and operation -> 'data' ->> 'parentType' = 'service_cycle') <> 1
    or exists (
      select 1 from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' is distinct from 'entity'
        or operation ->> 'entityType' not in ('client_plan', 'service_cycle', 'deliverable', 'service_pricing_snapshot')
        or (operation ->> 'entityType' = 'client_plan' and operation ->> 'action' <> 'update')
        or (operation ->> 'entityType' <> 'client_plan' and operation ->> 'action' <> 'insert')
        or (operation ->> 'entityType' = 'service_pricing_snapshot' and operation -> 'data' ->> 'parentType' <> 'service_cycle')
    ) then
    return false;
  end if;

  select operation into v_plan_operation from jsonb_array_elements(p_operations) operation
    where operation ->> 'entityType' = 'client_plan';
  select operation into v_cycle_operation from jsonb_array_elements(p_operations) operation
    where operation ->> 'entityType' = 'service_cycle';
  select operation into v_price_operation from jsonb_array_elements(p_operations) operation
    where operation ->> 'entityType' = 'service_pricing_snapshot';
  v_plan_id := v_plan_operation ->> 'entityId';
  v_cycle_id := v_cycle_operation ->> 'entityId';
  v_new_plan := v_plan_operation -> 'data';
  v_cycle := v_cycle_operation -> 'data';
  v_price := v_price_operation -> 'data';

  if jsonb_typeof(v_new_plan) is distinct from 'object'
    or jsonb_typeof(v_cycle) is distinct from 'object'
    or jsonb_typeof(v_price) is distinct from 'object' then
    return false;
  end if;

  select data into v_old_plan from public.aitask_entities
    where workspace_id = p_workspace_id and entity_type = 'client_plan' and entity_id = v_plan_id;
  select data into v_plan_price from public.aitask_entities
    where workspace_id = p_workspace_id and entity_type = 'service_pricing_snapshot'
      and data ->> 'parentType' = 'client_plan' and data ->> 'parentId' = v_plan_id
      and data ->> 'clientId' = v_old_plan ->> 'clientId'
    order by updated_at desc, entity_id limit 1;
  if v_old_plan is null
    or v_plan_price is null
    or v_plan_operation ->> 'expectedVersion' is distinct from (
      select version::text from public.aitask_entities
      where workspace_id = p_workspace_id and entity_type = 'client_plan' and entity_id = v_plan_id
    )
    or (v_old_plan ->> 'status' is distinct from 'Draft' and v_old_plan ->> 'status' is distinct from 'Paused')
    or v_new_plan ->> 'status' is distinct from 'Active'
    or v_new_plan ->> 'id' is distinct from v_plan_id
    or v_new_plan ->> 'clientId' is distinct from v_old_plan ->> 'clientId'
    or coalesce(v_new_plan ->> 'nextCycleStart', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(v_new_plan -> 'serviceItems') is distinct from 'array'
    or jsonb_typeof(v_cycle -> 'serviceItems') is distinct from 'array'
    or v_cycle ->> 'id' is distinct from v_cycle_id
    or v_cycle ->> 'clientId' is distinct from v_new_plan ->> 'clientId'
    or v_cycle ->> 'clientName' is distinct from v_new_plan ->> 'clientName'
    or v_cycle ->> 'planId' is distinct from v_plan_id
    or v_cycle ->> 'planRevision' is distinct from v_new_plan ->> 'revision'
    or v_cycle ->> 'status' is distinct from 'Draft'
    or v_cycle ->> 'currency' is distinct from v_new_plan ->> 'currency'
    or v_cycle -> 'serviceItems' is distinct from v_new_plan -> 'serviceItems'
    or v_cycle ->> 'discountType' is distinct from v_new_plan ->> 'discountType'
    or v_cycle ->> 'discountValue' is distinct from v_new_plan ->> 'discountValue'
    or v_cycle ->> 'taxRateBps' is distinct from v_new_plan ->> 'taxRateBps'
    or jsonb_typeof(v_cycle -> 'addonSnapshots') is distinct from 'array'
    or v_cycle ->> 'periodStart' !~ '^\d{4}-\d{2}-\d{2}$'
    or v_cycle ->> 'periodEnd' !~ '^\d{4}-\d{2}-\d{2}$'
    or v_new_plan ->> 'nextCycleStart' <= v_cycle ->> 'periodStart'
    or (v_old_plan ->> 'status' = 'Draft' and v_cycle ->> 'periodStart' is distinct from v_old_plan ->> 'startDate')
    or (nullif(v_old_plan ->> 'supersedesPlanId', '') is not null and not exists (
      select 1 from public.aitask_entities source_plan
      where source_plan.workspace_id = p_workspace_id and source_plan.entity_type = 'client_plan'
        and source_plan.entity_id = v_old_plan ->> 'supersedesPlanId'
        and source_plan.client_id = v_old_plan ->> 'clientId'
        and source_plan.data ->> 'status' = 'Ended'
    ))
    or v_cycle ->> 'pricingSnapshotId' is distinct from v_price_operation ->> 'entityId'
    or v_price ->> 'id' is distinct from v_price_operation ->> 'entityId'
    or v_price ->> 'clientId' is distinct from v_new_plan ->> 'clientId'
    or v_price ->> 'parentType' is distinct from 'service_cycle'
    or v_price ->> 'parentId' is distinct from v_cycle_id
    or v_price ->> 'currency' is distinct from v_cycle ->> 'currency'
    or v_price ->> 'discountType' is distinct from v_cycle ->> 'discountType'
    or v_price ->> 'discountValue' is distinct from v_cycle ->> 'discountValue'
    or v_price ->> 'taxRateBps' is distinct from v_cycle ->> 'taxRateBps'
    or v_price -> 'itemPrices' is distinct from v_plan_price -> 'itemPrices'
    or v_price ->> 'subtotalMinor' is distinct from v_plan_price ->> 'subtotalMinor'
    or v_price ->> 'discountMinor' is distinct from v_plan_price ->> 'discountMinor'
    or v_price ->> 'taxMinor' is distinct from v_plan_price ->> 'taxMinor'
    or v_price ->> 'totalMinor' is distinct from v_plan_price ->> 'totalMinor'
    or v_price ->> 'currency' is distinct from v_plan_price ->> 'currency'
    or v_price ->> 'discountType' is distinct from v_plan_price ->> 'discountType'
    or v_price ->> 'discountValue' is distinct from v_plan_price ->> 'discountValue'
    or v_price ->> 'taxRateBps' is distinct from v_plan_price ->> 'taxRateBps' then
    return false;
  end if;

  select coalesce(sum(greatest(0, (item ->> 'quantity')::integer)), 0)::integer
    into v_expected_deliverables from jsonb_array_elements(v_new_plan -> 'serviceItems') item;
  select count(*)::integer into v_actual_deliverables from jsonb_array_elements(p_operations) operation
    where operation ->> 'entityType' = 'deliverable';
  if v_expected_deliverables <> v_actual_deliverables
    or exists (
      select 1 from jsonb_array_elements(p_operations) operation
      where operation ->> 'entityType' = 'deliverable'
        and (
          operation -> 'data' ->> 'id' is distinct from operation ->> 'entityId'
          or operation -> 'data' ->> 'clientId' is distinct from v_cycle ->> 'clientId'
          or operation -> 'data' ->> 'clientName' is distinct from v_cycle ->> 'clientName'
          or operation -> 'data' ->> 'cycleId' is distinct from v_cycle_id
          or operation -> 'data' ->> 'planId' is distinct from v_plan_id
          or operation -> 'data' ->> 'status' is distinct from 'Planned'
          or coalesce(operation -> 'data' -> 'taskIds', '[]'::jsonb) <> '[]'::jsonb
          or coalesce(operation -> 'data' -> 'attachments', '[]'::jsonb) <> '[]'::jsonb
          or not exists (
            select 1 from jsonb_array_elements(v_new_plan -> 'serviceItems') item,
              lateral generate_series(1, greatest(0, (item ->> 'quantity')::integer)) sequence_no
            where operation -> 'data' ->> 'serviceItemId' = item ->> 'id'
              and operation -> 'data' ->> 'sequence' = sequence_no::text
              and operation -> 'data' ->> 'title' = (item ->> 'name') || ' ' || sequence_no::text
          )
        )
    )
    or exists (
      select 1 from jsonb_array_elements(v_new_plan -> 'serviceItems') item,
        lateral generate_series(1, greatest(0, (item ->> 'quantity')::integer)) sequence_no
      where not exists (
        select 1 from jsonb_array_elements(p_operations) operation
        where operation ->> 'entityType' = 'deliverable'
          and operation -> 'data' ->> 'serviceItemId' = item ->> 'id'
          and operation -> 'data' ->> 'sequence' = sequence_no::text
      )
    )
    or exists (
      select 1 from jsonb_array_elements(p_operations) operation
      where operation ->> 'entityType' = 'deliverable'
      group by operation -> 'data' ->> 'serviceItemId', operation -> 'data' ->> 'sequence'
      having count(*) > 1
    ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.aitask_client_plan_activation_bundle_is_valid(text, jsonb)
  from public, anon, authenticated, service_role;

-- The service command entity binding is action-aware so plan management may
-- insert only a bundle validated above; updates/deletes remain on service RPCs.
create or replace function private.aitask_service_command_allows_entity(
  p_command_type text,
  p_entity_type text,
  p_action text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'client' then p_command_type = 'client_plan.manage'
    when 'service_package' then p_command_type = 'service_package.manage'
    when 'service_workflow_template' then p_command_type = 'service_workflow.manage'
    when 'service_pricing_snapshot' then p_command_type = 'client_plan.manage'
    when 'client_plan' then p_command_type = 'client_plan.manage'
    when 'service_cycle' then p_command_type in ('service_cycle.manage', 'deliverable.manage')
      or p_command_type = 'client_plan.manage' and p_action = 'INSERT'
    when 'deliverable' then p_command_type in ('deliverable.manage', 'deliverable.workflow.generate')
      or p_command_type = 'client_plan.manage' and p_action = 'INSERT'
    when 'cycle_comment' then p_command_type = 'cycle_comment.manage'
    when 'addon' then p_command_type = 'addon.manage'
    when 'task' then p_command_type in (
      'deliverable.workflow.generate', 'service_package.manage',
      'service_workflow.manage', 'client_plan.manage', 'service_cycle.manage',
      'deliverable.manage', 'cycle_comment.manage', 'addon.manage'
    )
    else true
  end;
$$;

revoke all on function private.aitask_service_command_allows_entity(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function private.aitask_guard_service_command_entity_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command text := coalesce(current_setting('aitask.command_type', true), '');
  v_workspace text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
begin
  if v_command in (
    'service_package.manage', 'service_workflow.manage', 'client_plan.manage',
    'service_cycle.manage', 'deliverable.manage', 'deliverable.workflow.generate',
    'cycle_comment.manage', 'addon.manage'
  )
  and private.aitask_member_id(v_workspace) is not null
  and not private.aitask_service_command_allows_entity(v_command, v_entity_type, tg_op) then
    raise check_violation using message = 'Service command does not match entity type.';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_guard_service_command_entity_type()
  from public, anon, authenticated, service_role;

do $workflow_generation_service_contract$
declare
  signature text := 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)';
  definition text;
  anchor text := 'for v_op in select value from jsonb_array_elements(p_operations) loop';
  anchor_position integer;
  workflow_preflight text := $guard$
  if p_command_type = 'deliverable.workflow.generate' then
    if (select count(*) from jsonb_array_elements(p_operations) operation
        where operation ->> 'entityType' = 'deliverable' and operation ->> 'action' = 'update') <> 1
      or (select count(*) from jsonb_array_elements(p_operations) operation
        where operation ->> 'entityType' = 'task' and operation ->> 'action' = 'insert') < 1
      or exists (
        select 1 from jsonb_array_elements(p_operations) operation
        where operation ->> 'kind' is distinct from 'entity'
          or operation ->> 'entityType' not in ('task', 'deliverable')
          or (operation ->> 'entityType' = 'task' and operation ->> 'action' <> 'insert')
          or (operation ->> 'entityType' = 'deliverable' and operation ->> 'action' <> 'update')
      )
      or exists (
        select 1 from jsonb_array_elements(p_operations) deliverable_operation
        where deliverable_operation ->> 'entityType' = 'deliverable'
          and not private.aitask_workflow_generation_deliverable_is_valid(
            p_workspace_id, p_operations, deliverable_operation ->> 'entityId',
            (select prior.data from public.aitask_entities prior
              where prior.workspace_id = p_workspace_id
                and prior.entity_type = 'deliverable'
                and prior.entity_id = deliverable_operation ->> 'entityId'),
            deliverable_operation -> 'data'
          )
      )
      or exists (
        select 1 from jsonb_array_elements(p_operations) task_operation
        where task_operation ->> 'entityType' = 'task'
          and not exists (
            select 1 from jsonb_array_elements(p_operations) deliverable_operation
            where deliverable_operation ->> 'entityType' = 'deliverable'
              and task_operation -> 'data' ->> 'deliverableId' = deliverable_operation ->> 'entityId'
          )
      ) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid workflow generation command.');
    end if;
  end if;
$guard$;
begin
  definition := pg_get_functiondef(signature::regprocedure);
  anchor_position := strpos(definition, anchor);
  if anchor_position = 0 or strpos(substring(definition from anchor_position + length(anchor)), anchor) = 0 then
    raise exception 'Expected two operation loops in %.', signature;
  end if;
  definition := substring(definition from 1 for anchor_position - 1) || workflow_preflight || substring(definition from anchor_position);
  execute definition;

  definition := pg_get_functiondef('private.aitask_service_command_allows_entity(text,text)'::regprocedure);
  if position($mapping$when 'deliverable' then p_command_type = 'deliverable.manage'$mapping$ in definition) = 0 then
    raise exception 'Expected the current deliverable service-command mapping.';
  end if;
  execute replace(
    definition,
    $old_mapping$when 'deliverable' then p_command_type = 'deliverable.manage'$old_mapping$,
    $new_mapping$when 'deliverable' then p_command_type in ('deliverable.manage', 'deliverable.workflow.generate')$new_mapping$
  );
end;
$workflow_generation_service_contract$;

do $client_plan_activation_service_contract$
declare
  signature text := 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)';
  definition text;
  anchor text := 'for v_op in select value from jsonb_array_elements(p_operations) loop';
  anchor_position integer;
  activation_preflight text := $guard$
  if p_command_type = 'client_plan.manage' and jsonb_typeof(p_operations) = 'array' then
    if exists (
      select 1 from jsonb_array_elements(p_operations) operation
      where operation ->> 'entityType' in ('service_cycle', 'deliverable') and operation ->> 'action' = 'insert'
    ) and not private.aitask_client_plan_activation_bundle_is_valid(p_workspace_id, p_operations) then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid client plan activation bundle.');
    end if;
  end if;
$guard$;
begin
  definition := pg_get_functiondef(signature::regprocedure);
  anchor_position := strpos(definition, anchor);
  if anchor_position = 0 or strpos(substring(definition from anchor_position + length(anchor)), anchor) = 0 then
    raise exception 'Expected two operation loops in %.', signature;
  end if;
  definition := substring(definition from 1 for anchor_position - 1)
    || activation_preflight || substring(definition from anchor_position);
  execute definition;
end;
$client_plan_activation_service_contract$;

