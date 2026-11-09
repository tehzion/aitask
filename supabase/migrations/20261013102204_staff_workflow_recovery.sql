-- Operational task metadata is stamped by the authenticated actor, never by
-- supplied history/actor/timestamp fields. Existing task RLS and command checks
-- remain the authorization boundary. Client projections omit these fields.
create or replace function private.aitask_guard_task_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_state jsonb := coalesce(v_old->'workState', '{}'::jsonb);
  v_requested jsonb;
  v_reason text;
  v_history jsonb := case when jsonb_typeof(v_old->'workHistory') = 'array' then v_old->'workHistory' else '[]'::jsonb end;
  v_fields jsonb := '[]'::jsonb;
  v_field text;
  v_linked boolean;
  v_evidence boolean;
  v_assignment_changed boolean := tg_op = 'UPDATE' and (v_old->>'assignedTo' is distinct from new.data->>'assignedTo' or v_old->>'department' is distinct from new.data->>'department');
begin
  if new.entity_type <> 'task' then return new; end if;

  -- A new transition to review/completion requires evidence. Historical ready
  -- tasks can still receive unrelated edits without inventing old evidence.
  if v_actor is not null and v_role <> 'Client' and (
    ((new.data->>'status') in ('Waiting Approval', 'Completed') and v_old->>'status' is distinct from new.data->>'status')
    or (coalesce(new.data->>'isCompleted', 'false') = 'true' and coalesce(v_old->>'isCompleted', 'false') <> 'true')
  ) then
    v_linked := nullif(new.data->>'deliverableId', '') is not null or exists (
      select 1 from public.aitask_entities d where d.workspace_id = new.workspace_id and d.entity_type = 'deliverable'
        and coalesce(d.data->'taskIds', '[]'::jsonb) ? new.entity_id
    );
    if v_linked then
      v_evidence := length(btrim(coalesce(new.data->>'attachmentLink', ''))) <= 2048
        and btrim(coalesce(new.data->>'attachmentLink', '')) ~* '^https://[^/?#@[:space:]\\]+([/?#][^[:space:]\\]*)?$';
      v_evidence := v_evidence or exists (
        select 1 from public.aitask_entities d
        cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data->'attachments') = 'array' then d.data->'attachments' else '[]'::jsonb end) f
        join storage.objects o on o.bucket_id = 'client-service-files' and o.name = f->>'path'
        where d.workspace_id = new.workspace_id and d.entity_type = 'deliverable'
          and (d.entity_id = new.data->>'deliverableId' or coalesce(d.data->'taskIds', '[]'::jsonb) ? new.entity_id)
          and d.data->>'clientId' = new.data->>'clientId'
          and (nullif(new.data->>'serviceCycleId', '') is null or d.data->>'cycleId' = new.data->>'serviceCycleId')
          and f->>'bucket' = 'client-service-files' and nullif(f->>'id', '') is not null
      );
      if not v_evidence then
        raise check_violation using message = 'Add an output link or upload a deliverable file before sending this linked task for review or completing it.';
      end if;
    end if;
  end if;

  if v_assignment_changed then v_state := v_state - 'acceptedBy' - 'acceptedAt' - 'blocker'; end if;
  if v_actor is not null and v_role <> 'Client' and tg_op = 'UPDATE' and not v_assignment_changed and new.data ? 'workState' then
    v_requested := new.data->'workState';
    if jsonb_typeof(v_requested) <> 'object' then raise check_violation using message = 'Choose a valid work action.'; end if;
    if nullif(v_requested->>'acceptedBy', '') is distinct from nullif(v_state->>'acceptedBy', '') and nullif(v_requested->>'acceptedBy', '') is not null then
      if v_actor is distinct from new.data->>'assignedTo' then raise check_violation using message = 'Only the current assignee can accept this task.'; end if;
      if new.data->>'status' in ('Completed', 'Cancelled') then raise check_violation using message = 'Only open tasks can accept work or request help.'; end if;
      v_state := v_state || jsonb_build_object('acceptedBy', v_actor, 'acceptedAt', v_now);
    end if;
    if (v_requested->'blocker') is distinct from (v_old->'workState'->'blocker') then
      if v_requested->'blocker' is null or v_requested->'blocker' = 'null'::jsonb then
        v_state := v_state - 'blocker';
      else
        if new.data->>'status' in ('Completed', 'Cancelled') then raise check_violation using message = 'Only open tasks can accept work or request help.'; end if;
        v_reason := btrim(v_requested->'blocker'->>'reason');
        if v_reason is null or length(v_reason) not between 1 and 2000 then raise check_violation using message = 'Describe the blocker in 1–2000 characters.'; end if;
        v_state := v_state || jsonb_build_object('blocker', jsonb_build_object('reason', v_reason, 'openedBy', v_actor, 'openedAt', v_now));
      end if;
    end if;
  end if;

  if v_actor is not null and v_old->>'status' is distinct from new.data->>'status' then
    if new.data->>'status' = 'Waiting Approval' then
      v_state := v_state || jsonb_build_object('reviewRequestedBy', v_actor, 'reviewRequestedAt', v_now);
    else v_state := v_state - 'reviewRequestedBy' - 'reviewRequestedAt'; end if;
    if new.data->>'status' = 'In Progress' and new.data->>'assignedTo' = v_actor then
      v_state := v_state || jsonb_build_object('acceptedBy', v_actor, 'acceptedAt', coalesce(v_state->>'acceptedAt', v_now));
    end if;
  end if;
  if new.data->>'status' in ('Completed', 'Cancelled') then v_state := v_state - 'blocker'; end if;

  if tg_op = 'UPDATE' then
    foreach v_field in array array['title', 'description', 'notes', 'dueDate', 'startDate', 'assignedTo', 'department', 'status', 'priority', 'attachmentLink'] loop
      if coalesce(v_old->>v_field, '') is distinct from coalesce(new.data->>v_field, '') then v_fields := v_fields || to_jsonb(v_field); end if;
    end loop;
    if v_old->'workState'->>'acceptedBy' is distinct from v_state->>'acceptedBy' then v_fields := v_fields || '"acceptedBy"'::jsonb; end if;
    if v_old->'workState'->'blocker' is distinct from v_state->'blocker' then v_fields := v_fields || '"blocker"'::jsonb; end if;
    if v_actor is not null and jsonb_array_length(v_fields) > 0 then
      v_history := v_history || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'userId', v_actor, 'createdAt', v_now, 'fields', v_fields));
    end if;
  end if;
  select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb) into v_history
    from jsonb_array_elements(v_history) with ordinality entries(item, ordinal)
    where ordinal > jsonb_array_length(v_history) - 50;
  new.data := new.data || jsonb_build_object('workState', v_state, 'workHistory', v_history);
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_workflow() from public, anon, authenticated;
-- After the existing ownership/assignment guard; no public executable RPC is added.
create trigger zzz_aitask_guard_task_workflow before insert or update of data on public.aitask_entities
for each row execute function private.aitask_guard_task_workflow();

-- Client review uses the canonical internal revision counter when the privacy
-- projection omits it. Supplied counters are still checked; hidden staff
-- metadata is preserved by the approval merge.
create or replace function private.aitask_client_command_allowed(
  p_workspace_id text,
  p_command_type text,
  p_operations jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_client_key text := private.aitask_member_client_key(p_workspace_id);
  v_task_operation jsonb;
  v_child_operation jsonb;
  v_task_id text;
  v_old_task jsonb;
  v_new_task jsonb;
  v_child_data jsonb;
  v_review_status text;
  v_old_revision integer;
  v_old_completion integer;
begin
  if private.aitask_member_role(p_workspace_id) <> 'Client'
    or v_member_id is null
    or v_client_key = '' then
    return false;
  end if;

  if p_command_type = 'comment.add' then
    if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) <> 1 then
      return false;
    end if;
    v_child_operation := p_operations -> 0;
    if v_child_operation ->> 'kind' <> 'entity'
      or v_child_operation ->> 'action' <> 'insert'
      or v_child_operation ->> 'entityType' <> 'comment' then
      return false;
    end if;
    v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);
    v_task_id := coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId');
    select task.data into v_old_task
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = v_task_id;

    return v_old_task is not null
      and lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) = v_client_key
      and v_child_data ->> 'id' = v_child_operation ->> 'entityId'
      and v_child_data ->> 'taskId' = v_task_id
      and v_child_data ->> 'userId' = v_member_id
      and length(btrim(coalesce(v_child_data ->> 'text', ''))) between 1 and 2000;
  end if;

  if p_command_type <> 'approval.review'
    or jsonb_typeof(p_operations) <> 'array'
    or jsonb_array_length(p_operations) <> 2 then
    return false;
  end if;

  select value into v_task_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'update'
    and value ->> 'entityType' = 'task'
  limit 1;

  select value into v_child_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'insert'
    and value ->> 'entityType' = 'approval'
  limit 1;

  if v_task_operation is null or v_child_operation is null then return false; end if;
  v_task_id := v_task_operation ->> 'entityId';
  v_new_task := coalesce(v_task_operation -> 'data', '{}'::jsonb);
  v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);

  select task.data into v_old_task
  from public.aitask_entities task
  where task.workspace_id = p_workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;

  if v_old_task is null
    or jsonb_typeof(v_new_task) <> 'object'
    or lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) <> v_client_key
    or not (coalesce((v_old_task ->> 'isCompleted')::boolean, false) or v_old_task ->> 'status' = 'Waiting Approval')
    or coalesce(v_old_task ->> 'clientApprovalStatus', 'Pending') = 'Approved'
    or v_child_data ->> 'id' <> v_child_operation ->> 'entityId'
    or v_child_data ->> 'taskId' <> v_task_id
    or coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId') <> v_task_id
    or v_child_data ->> 'userId' <> v_member_id
    or length(coalesce(v_child_data ->> 'note', '')) > 2000
    or coalesce(v_old_task ->> 'revisionCount', '0') !~ '^[0-9]+$'
    or coalesce(v_old_task ->> 'completionPercentage', '0') !~ '^[0-9]+$' then
    return false;
  end if;

  -- Public immutable fields may be omitted by a projected client, but any
  -- supplied value must match the canonical task.
  if exists (
    select 1
    from unnest(array[
      'id', 'clientName', 'projectId', 'projectName', 'serviceType', 'title',
      'description', 'assignedTo', 'startDate', 'dueDate', 'attachmentLink',
      'attachmentName', 'website', 'facebookPage'
    ]::text[]) key
    where v_new_task ? key and v_new_task -> key is distinct from v_old_task -> key
  ) then
    return false;
  end if;

  -- Legacy clients may still send hidden fields during the rollout. They are
  -- accepted only when unchanged; new or modified protected keys are rejected.
  if exists (
    select 1
    from jsonb_object_keys(v_new_task) key
    where key <> all(array[
      'id', 'clientName', 'projectId', 'projectName', 'serviceType', 'title',
      'description', 'assignedTo', 'startDate', 'dueDate', 'attachmentLink',
      'attachmentName', 'website', 'facebookPage', 'clientApprovalStatus',
      'status', 'isCompleted', 'completionPercentage', 'revisionCount', 'completedAt'
    ]::text[])
      and v_new_task -> key is distinct from v_old_task -> key
  ) then
    return false;
  end if;

  v_review_status := v_child_data ->> 'status';
  v_old_revision := coalesce((v_old_task ->> 'revisionCount')::integer, 0);
  v_old_completion := coalesce((v_old_task ->> 'completionPercentage')::integer, 0);

  if v_new_task ->> 'clientApprovalStatus' <> v_review_status then return false; end if;
  if v_review_status = 'Approved' then
    return v_new_task ->> 'status' = 'Completed'
      and coalesce((v_new_task ->> 'isCompleted')::boolean, false)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = 100
      and coalesce((v_new_task ->> 'revisionCount')::integer, v_old_revision) = v_old_revision;
  end if;
  if v_review_status = 'Rejected' then
    return v_new_task ->> 'status' = 'In Progress'
      and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = least(v_old_completion, 90)
      and coalesce((v_new_task ->> 'revisionCount')::integer, v_old_revision + 1) = v_old_revision + 1;
  end if;
  return false;
exception
  when invalid_text_representation then return false;
end;
$$;

revoke all on function private.aitask_client_command_allowed(text, text, jsonb) from public, anon, authenticated;

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
      'status', new.data -> 'status',
      'isCompleted', new.data -> 'isCompleted',
      'completionPercentage', new.data -> 'completionPercentage',
      'completedAt', case when new.data ->> 'clientApprovalStatus' = 'Approved' then to_jsonb(coalesce(nullif(old.data ->> 'completedAt', ''), to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) else 'null'::jsonb end,
      'revisionCount', to_jsonb(case when new.data ->> 'clientApprovalStatus' = 'Rejected' then coalesce((old.data ->> 'revisionCount')::integer, 0) + 1 else coalesce((old.data ->> 'revisionCount')::integer, 0) end)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_merge_client_approval_task() from public, anon, authenticated;

create or replace function private.aitask_task_assignment_is_valid(
  p_workspace_id text,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assignee text := coalesce(p_old_data ->> 'assignedTo', '');
  v_new_assignee text := coalesce(p_new_data ->> 'assignedTo', '');
  v_old_department text := private.aitask_task_department(p_old_data ->> 'department');
  v_new_department text := private.aitask_task_department(p_new_data ->> 'department');
  v_old_creator text := coalesce(p_old_data ->> 'createdBy', p_old_data ->> 'userId', '');
  v_new_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', '');
  v_actor_member_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
begin
  -- The validated Client approval command carries a privacy projection, so
  -- assignment/department fields can be absent. The command validator already
  -- rejects any supplied change to these protected fields.
  if p_action = 'update' and v_actor_role = 'Client'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true' then
    return true;
  end if;
  if p_action = 'update' and v_old_creator is distinct from v_new_creator then
    return false;
  end if;

  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department then
    return true;
  end if;
  if v_new_department is null then return false; end if;

  if p_action = 'insert' and v_actor_role = 'Staff' then
    if v_new_creator <> v_actor_member_id
      or not exists (
        select 1 from public.aitask_members actor
        where actor.workspace_id = p_workspace_id
          and actor.id = v_actor_member_id
          and v_new_department = any(actor.departments)
      ) then
      return false;
    end if;
    if v_new_assignee <> ''
      and v_new_assignee <> v_actor_member_id
      and not private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks') then
      return false;
    end if;
  end if;

  if p_action = 'update'
    and not private.aitask_is_super_admin(p_workspace_id)
    and not (
      v_old_creator = v_actor_member_id
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
    )
    and not (
      private.aitask_role_is_department_scoped(p_workspace_id)
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
      and v_old_assignee = v_actor_member_id
    )
    and not (
      v_actor_role = 'Project Manager'
      and (
        v_old_assignee = v_actor_member_id
        or v_old_creator = v_actor_member_id
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')))
            and client.created_by = v_actor_member_id
        )
        or exists (
          select 1 from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = nullif(btrim(coalesce(p_new_data ->> 'projectId', p_old_data ->> 'projectId', '')), '')
            and project.created_by = v_actor_member_id
        )
      )
    ) then
    return false;
  end if;

  if p_action = 'update'
    and v_actor_role = 'Staff'
    and not exists (
      select 1 from public.aitask_members actor
      where actor.workspace_id = p_workspace_id
        and actor.id = v_actor_member_id
        and v_new_department = any(actor.departments)
    ) then
    return false;
  end if;

  if v_new_assignee = '' then return true; end if;

  return exists (
    select 1
    from public.aitask_members member
    where member.workspace_id = p_workspace_id
      and member.id = v_new_assignee
      and member.role <> 'Client'
      and (member.role = 'Project Manager' or v_new_department = any(member.departments))
  );
end;
$$;
revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb) from public, anon, authenticated;
