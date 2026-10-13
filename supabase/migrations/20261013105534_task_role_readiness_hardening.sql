-- Close role handoff, reassignment metadata and signed-review compatibility gaps.

-- A historical Staff + builtin-hod record retains canonical HOD scope and
-- permissions even when a filtered directory omits its built-in template.
-- New built-in custom-role assignments remain forbidden by the member guard.
create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when member.role = 'HOD' and p_permission = any(array[
        'viewAllTasks','viewAllClients','viewApprovals',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ]) then false
      when member.role='Staff' and member.custom_role_id='builtin-hod' and p_permission = any(array[
        'viewAllTasks','viewAllClients','viewApprovals','manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ]) then false
      when p_permission = any(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports','viewApprovals']) then false
      when member.permissions ? p_permission then member.permissions ->> p_permission = 'true'
      when custom_role.data -> 'permissions' ? p_permission then custom_role.data -> 'permissions' ->> p_permission = 'true'
      when p_permission = 'viewDeliveryTracker'
        and not (member.permissions ? p_permission)
        and not (custom_role.data -> 'permissions' ? p_permission)
        and (
          (member.permissions ? 'viewProjects' and member.permissions ->> 'viewProjects' = 'true')
          or (not (member.permissions ? 'viewProjects') and custom_role.data -> 'permissions' ->> 'viewProjects' = 'true')
        ) then true
      when custom_role.data is not null then false
      when builtin_role.data -> 'permissions' ? p_permission then builtin_role.data -> 'permissions' ->> p_permission = 'true'
      when member.permissions <> '{}'::jsonb then false
      when member.role = 'Project Manager' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createProjects','createClients','deleteClients','manageServiceCatalog',
        'manageTaskTemplates','manageClientPlans','manageServiceCycles','viewServicePrices'
      ])
      when (member.role = 'HOD' or (member.role = 'Staff' and member.custom_role_id = 'builtin-hod')) then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createClients','deleteClients','viewAssignedServiceClients'
      ])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','viewAssignedServiceClients'
      ])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings','clientReview'
      ])
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and coalesce((entity.data ->> 'isBuiltin')::boolean, false) = true
        and entity.data ->> 'baseRole' = case when member.role='Staff' and member.custom_role_id='builtin-hod' then 'HOD' else member.role end
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;

-- 4. Department scoping reads the template's departmentScoped flag -----------
create or replace function private.aitask_role_is_department_scoped(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when (member.role = 'HOD' or (member.role = 'Staff' and member.custom_role_id = 'builtin-hod')) then true
      when custom_role.data is not null then coalesce((custom_role.data ->> 'departmentScoped')::boolean, false)
      else coalesce((builtin_role.data ->> 'departmentScoped')::boolean, false)
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and coalesce((entity.data ->> 'isBuiltin')::boolean, false) = true
        and entity.data ->> 'baseRole' = case when member.role='Staff' and member.custom_role_id='builtin-hod' then 'HOD' else member.role end
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_role_is_department_scoped(text) from public, anon, authenticated;
grant execute on function private.aitask_role_is_department_scoped(text) to authenticated, service_role;

create or replace function private.aitask_guard_task_stage_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_hod boolean := private.aitask_is_hod(new.workspace_id) and private.aitask_member_role(new.workspace_id) in ('Staff','HOD');
  v_boss boolean := private.aitask_is_super_admin(new.workspace_id);
  v_changed boolean := v_old->>'status' is distinct from new.data->>'status';
  v_percent integer;
begin
  if new.entity_type <> 'task' then return new; end if;
  if v_actor is not null and v_role <> 'Client' then
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
    if new.data->>'status' = 'Approved' and v_changed and not (
      v_old->>'status' = 'Waiting Approval' and (v_boss or (v_hod and exists (
        select 1 from public.aitask_members m where m.workspace_id=new.workspace_id and m.id=v_actor
        and private.aitask_task_department(new.data->>'department') = any(m.departments)
      )))
    ) then raise check_violation using message='Only the department HOD can approve submitted work.'; end if;
    if ((new.data->>'status' = 'Completed' and v_changed)
      or (coalesce((new.data->>'isCompleted')::boolean,false) and not coalesce((v_old->>'isCompleted')::boolean,false)))
      and not (v_boss or (v_role='Project Manager' and v_old->>'status'='Approved')) then
      raise check_violation using message='Only a project manager can confirm completion after HOD approval.';
    end if;
    if v_role='Staff' and not v_hod and not v_boss and (
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
    if new.data->>'status'='Completed' and v_changed then
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
$$;
revoke all on function private.aitask_guard_task_stage_progress() from public, anon, authenticated;
drop trigger if exists zzzz_aitask_guard_task_stage_progress on public.aitask_entities;
create trigger aitask_zy_guard_task_stage_progress before insert or update of data on public.aitask_entities
for each row execute function private.aitask_guard_task_stage_progress();

-- Recompute after the workflow guard has cleared acceptance on reassignment.
create or replace function private.aitask_finalize_task_stage_progress()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.entity_type='task' then
  new.data:=new.data||jsonb_build_object('completionPercentage',case
   when new.data->>'status'='Cancelled' then 0
   when new.data->>'status'='Completed' then 100
   when new.data->>'status'='Approved' then 80
   when new.data->>'status'='Waiting Approval' then 60
   when new.data->>'clientApprovalStatus'='Rejected' or new.data->>'status'='Revision' then 50
   when new.data->>'status'='In Progress' or (nullif(new.data->>'assignedTo','') is not null and new.data->'workState'->>'acceptedBy'=new.data->>'assignedTo') then 30
   when nullif(btrim(new.data->>'assignedTo'),'') is null then 0
   when exists(select 1 from public.aitask_members m where m.workspace_id=new.workspace_id and m.id=new.data->>'assignedTo' and (m.role in('HOD','Project Manager') or (m.role='Staff' and m.custom_role_id='builtin-hod'))) then 10
   else 20 end);
 end if;
 return new;
end;
$$;
revoke all on function private.aitask_finalize_task_stage_progress() from public,anon,authenticated;
create trigger zzzz_aitask_finalize_task_stage_progress before insert or update of data on public.aitask_entities
for each row execute function private.aitask_finalize_task_stage_progress();
-- A successful review submission must reach the department HOD, including
-- submissions from older clients and the full editor. Generate the handoff in
-- the same transaction as the task save rather than trusting a browser audience.
create or replace function private.aitask_notify_hod_review_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_recipient record;
  v_id text;
  v_server_notification text := current_setting('aitask.server_notification', true);
begin
  if v_actor is null or private.aitask_member_role(new.workspace_id) = 'Client'
    or new.data->>'status' is distinct from 'Waiting Approval'
    or (tg_op='UPDATE' and old.data->>'status' is not distinct from new.data->>'status') then
    return new;
  end if;

  if not exists(select 1 from public.aitask_members m where m.workspace_id=new.workspace_id
    and m.role in('HOD','Staff') and (m.role='HOD' or m.custom_role_id='builtin-hod')
    and private.aitask_task_department(new.data->>'department')=any(m.departments)) then
    raise check_violation using message='No HOD is configured for this department. Ask your project manager to configure a reviewer before submitting.';
  end if;

  for v_recipient in
    select member.id
    from public.aitask_members member
    where member.workspace_id = new.workspace_id
      and member.id <> v_actor
      and member.role in ('HOD', 'Staff')
      and (member.role = 'HOD' or member.custom_role_id = 'builtin-hod')
      and private.aitask_task_department(new.data->>'department') = any(member.departments)
  loop
    v_id := 'N-hod-review-' || replace(gen_random_uuid()::text, '-', '');
    perform set_config('aitask.server_notification', 'true', true);
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
    values (new.workspace_id, 'notification', v_id, new.entity_id, jsonb_build_object(
      'id', v_id, 'targetUserId', v_recipient.id,
      'title', 'Task Ready for Approval',
      'message', '"' || left(coalesce(new.data->>'title', 'Task'), 160) || '" is ready for department review.',
      'route', jsonb_build_object('page', 'tasks', 'entityId', new.entity_id),
      'iconType', 'status', 'isRead', false, 'readByUserIds', jsonb_build_array(),
      'createdAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end loop;
  perform set_config('aitask.server_notification', coalesce(v_server_notification, 'false'), true);
  return new;
end;
$$;

revoke all on function private.aitask_notify_hod_review_submission() from public, anon, authenticated;
drop trigger if exists aitask_notify_hod_review_submission on public.aitask_entities;
create trigger aitask_notify_hod_review_submission after insert or update on public.aitask_entities
for each row when (new.entity_type='task') execute function private.aitask_notify_hod_review_submission();
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
    ((new.data->>'status') in ('Waiting Approval', 'Approved', 'Completed') and v_old->>'status' is distinct from new.data->>'status')
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
-- Some deployments already enforce signed frozen-workflow reviews. Keep that
-- optional gate's security boundaries while stamping HOD decisions at 80% and
-- preserving the decision through PM final confirmation. Fresh databases without
-- that feature do not install its tables or public APIs here.
do $compat$
begin
 if to_regprocedure('private.aitask_guard_workflow_task()') is not null then
  execute $definition$
create or replace function private.aitask_guard_workflow_task()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_step jsonb; v_previous_step jsonb; v_previous_task text; v_actor text;
  v_before jsonb := '{}'::jsonb; v_output_changed boolean := false; v_counter bigint := 1;
  v_ready boolean; v_complete boolean; v_review jsonb; v_inputs jsonb;
  v_identity text[] := array['id','generatedFromDeliverable','workflowStepId','workflowStepOrder','workflowStepRequired','workflowTemplateId','workflowTemplateRevision','predecessorTaskIds','clientId','serviceCycleId','deliverableId','department','visibility'];
  v_output text[] := array['title','description','notes','attachmentLink','attachmentName','status','isCompleted','revisionCount'];
begin
  if new.entity_type='service_cycle' and tg_op='UPDATE' and old.data->'serviceItems' is distinct from new.data->'serviceItems'
    and exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'serviceCycleId'=new.entity_id and coalesce((task.data->>'generatedFromDeliverable')::boolean,false)) then
    raise check_violation using message='A generated workflow keeps its frozen service items.';
  end if;
  if new.entity_type='deliverable' then
    if tg_op='UPDATE' and exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'deliverableId'=new.entity_id and coalesce((task.data->>'generatedFromDeliverable')::boolean,false))
      and exists(select 1 from unnest(array['clientId','cycleId','serviceItemId','planId']) field where old.data->field is distinct from new.data->field) then
      raise check_violation using message='A generated workflow keeps its frozen deliverable identity.';
    end if;
    if new.data->>'status'='Delivered' and not private.aitask_workflow_deliverable_ready(new.workspace_id,new.data) then
      raise check_violation using message='Every required workflow step and internal review must be approved before delivery.';
    end if;
  end if;
  if new.entity_type<>'task' then return new; end if;
  if tg_op='UPDATE' then
    v_before := old.data;
    if (coalesce((old.data->>'generatedFromDeliverable')::boolean,false) or coalesce(old.data->>'workflowStepId','')<>'')
      and exists(select 1 from unnest(v_identity) field where old.data->field is distinct from new.data->field) then
      raise check_violation using message='Workflow identity and review records cannot be edited directly.';
    end if;
    if not coalesce((old.data->>'generatedFromDeliverable')::boolean,false) and coalesce(old.data->>'workflowStepId','')=''
      and (coalesce((new.data->>'generatedFromDeliverable')::boolean,false) or coalesce(new.data->>'workflowStepId','')<>'') then
      raise check_violation using message='Existing tasks cannot be promoted into a frozen workflow.';
    end if;
    v_counter := coalesce((old.data->>'workflowOutputVersion')::bigint,1);
    v_output_changed := exists(select 1 from unnest(v_output) field where coalesce(old.data->>field,'') is distinct from coalesce(new.data->>field,''));
    -- Final PM confirmation changes the stage, not the approved output/signature.
    if old.data->>'status'='Approved' and new.data->>'status'='Completed'
      and not exists(select 1 from unnest(array['title','description','notes','attachmentLink','attachmentName','revisionCount']) field where coalesce(old.data->>field,'') is distinct from coalesce(new.data->>field,'')) then
      v_output_changed:=false;
    end if;
    if v_output_changed then v_counter := v_counter+1; end if;
  end if;
  if not coalesce((new.data->>'generatedFromDeliverable')::boolean,false) and coalesce(new.data->>'workflowStepId','')='' then
    new.data := new.data-array['workflowStepKind','workflowOutputVersion','workflowDependenciesReady','internalReview'];
    return new;
  end if;
  v_step := private.aitask_workflow_step(new.workspace_id,new.data);
  if v_step is null or coalesce(v_step->>'kind','') not in ('work','internal_review','client_approval','publishing')
    or new.data->>'id' is distinct from new.entity_id
    or v_step->>'order' is distinct from new.data->>'workflowStepOrder'
    or v_step->>'required' is distinct from new.data->>'workflowStepRequired'
    or private.aitask_task_department(v_step->>'department') is distinct from private.aitask_task_department(new.data->>'department')
    or (case when (v_step->>'clientVisible')::boolean then 'client-visible' else 'internal' end) is distinct from new.data->>'visibility' then
    raise check_violation using message='Workflow task does not match its frozen step.';
  end if;
  v_actor := private.aitask_member_id(new.workspace_id);
  if tg_op='INSERT' then
    if v_actor is null or not private.aitask_has_permission(new.workspace_id,'manageServiceCycles')
      or not private.aitask_can_access_service_client(new.workspace_id,new.data->>'clientId') then
      raise check_violation using message='Workflow generation permission is required.';
    end if;
    if exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'deliverableId'=new.data->>'deliverableId' and task.data->>'workflowStepId'=new.data->>'workflowStepId') then
      raise check_violation using message='The frozen workflow step already exists.';
    end if;
    select step.value into v_previous_step
    from public.aitask_entities cycle
    cross join lateral jsonb_array_elements(cycle.data->'serviceItems') item(value)
    cross join lateral jsonb_array_elements(item.value->'workflow'->'steps') step(value)
    where cycle.workspace_id=new.workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=new.data->>'serviceCycleId'
      and item.value->'workflow'->>'templateId'=new.data->>'workflowTemplateId'
      and item.value->'workflow'->>'templateRevision'=new.data->>'workflowTemplateRevision'
      and item.value->>'id'=(select output.data->>'serviceItemId' from public.aitask_entities output
        where output.workspace_id=new.workspace_id and output.entity_type='deliverable' and output.entity_id=new.data->>'deliverableId')
      and (step.value->>'order')::integer<(v_step->>'order')::integer
    order by (step.value->>'order')::integer desc limit 1;
    if v_previous_step is null then
      if coalesce(new.data->'predecessorTaskIds','[]'::jsonb)<>'[]'::jsonb then raise check_violation using message='Invalid workflow predecessors.'; end if;
    else
      select entity_id into v_previous_task from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
        and task.data->>'deliverableId'=new.data->>'deliverableId' and task.data->>'workflowStepId'=v_previous_step->>'id';
      if v_previous_task is null or new.data->'predecessorTaskIds' is distinct from jsonb_build_array(v_previous_task) then
        raise check_violation using message='Invalid workflow predecessors.';
      end if;
    end if;
  end if;
  v_ready := private.aitask_workflow_dependencies_ready(new.workspace_id,new.data);
  v_complete := coalesce((new.data->>'isCompleted')::boolean,false) or new.data->>'status' in ('Approved','Completed');
  if (v_complete or new.data->>'status'='Waiting Approval') and not v_ready then
    raise check_violation using message='Complete every required predecessor before submitting or completing this step.';
  end if;
  if v_step->>'kind'='internal_review' and v_complete then
    if tg_op='INSERT' or v_output_changed or not private.aitask_workflow_task_satisfied(new.workspace_id,v_before||jsonb_build_object('status','Completed','isCompleted',true)) then
      if v_actor is null or not (
        private.aitask_is_super_admin(new.workspace_id)
        or (private.aitask_is_hod(new.workspace_id) and exists(select 1 from public.aitask_members member
          where member.workspace_id=new.workspace_id and member.id=v_actor and private.aitask_task_department(v_step->>'department')=any(member.departments)))
      ) then raise check_violation using message='Only the department HOD or Boss Koo can approve internal review.'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('taskId',task.entity_id,'outputVersion',coalesce((task.data->>'workflowOutputVersion')::bigint,1)) order by task.entity_id),'[]'::jsonb) into v_inputs
      from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
        and coalesce(new.data->'predecessorTaskIds','[]'::jsonb) ? task.entity_id;
      v_review := jsonb_build_object('decisionId',gen_random_uuid()::text,'reviewedBy',v_actor,'reviewedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'inputVersions',v_inputs);
    else v_review := old.data->'internalReview'; end if;
  end if;
  if tg_op='UPDATE' and not v_output_changed and v_review is distinct from old.data->'internalReview' then v_counter := v_counter+1; end if;
  if v_review is not null and (tg_op='INSERT' or v_review is distinct from old.data->'internalReview') then
    insert into private.aitask_internal_review_decisions(decision_id,workspace_id,task_id,output_version,reviewer_id,reviewed_at,input_versions)
    values((v_review->>'decisionId')::uuid,new.workspace_id,new.entity_id,v_counter,v_actor,(v_review->>'reviewedAt')::timestamptz,v_inputs);
  end if;
  new.data := new.data-array['workflowStepKind','workflowOutputVersion','workflowDependenciesReady','internalReview'];
  new.data := new.data||jsonb_build_object('workflowStepKind',v_step->>'kind','workflowOutputVersion',v_counter);
  if v_review is not null then new.data := new.data||jsonb_build_object('internalReview',v_review); end if;
  return new;
end;
$$;
$definition$;
 end if;
end;
$compat$;

-- Existing submitted work must also appear in the HOD inbox after rollout.
-- This private, administrator-only repair skips tasks with an existing handoff.
create or replace function private.aitask_backfill_pending_hod_reviews()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; v_id text; v_count integer:=0;
 v_server_notification text:=current_setting('aitask.server_notification',true);
begin
 perform set_config('aitask.server_notification','true',true);
 for item in
  select t.workspace_id,t.entity_id,t.data,m.id recipient_id from public.aitask_entities t
  join public.aitask_members m on m.workspace_id=t.workspace_id
   and m.role in('HOD','Staff') and (m.role='HOD' or m.custom_role_id='builtin-hod')
   and private.aitask_task_department(t.data->>'department')=any(m.departments)
  where t.entity_type='task' and t.data->>'status'='Waiting Approval'
   and m.id is distinct from t.data->'workState'->>'reviewRequestedBy'
   and not exists(select 1 from public.aitask_entities n where n.workspace_id=t.workspace_id and n.entity_type='notification'
     and n.data->>'targetUserId'=m.id and n.data->>'title'='Task Ready for Approval' and n.data->'route'->>'entityId'=t.entity_id)
 loop
  v_id:='N-hod-review-backfill-'||md5(item.workspace_id||chr(31)||item.entity_id||chr(31)||item.recipient_id);
  insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data) values(item.workspace_id,'notification',v_id,item.entity_id,jsonb_build_object(
   'id',v_id,'targetUserId',item.recipient_id,'title','Task Ready for Approval','message','"'||left(coalesce(item.data->>'title','Task'),160)||'" is ready for department review.',
   'route',jsonb_build_object('page','tasks','entityId',item.entity_id),'iconType','status','isRead',false,'readByUserIds',jsonb_build_array(),
   'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  on conflict(workspace_id,entity_type,entity_id) do nothing;
  if found then v_count:=v_count+1; end if;
 end loop;
 perform set_config('aitask.server_notification',coalesce(v_server_notification,'false'),true);
 return v_count;
end;
$$;
revoke all on function private.aitask_backfill_pending_hod_reviews() from public,anon,authenticated,service_role;
select private.aitask_backfill_pending_hod_reviews();
