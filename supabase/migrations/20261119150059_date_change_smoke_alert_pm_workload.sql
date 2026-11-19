-- Three small, related changes.
--
-- 1. Clients see why an expected date moved. A task can carry dateChange
--    ({from, reason, changedAt}); the client projection shows it without who
--    changed it.
-- 2. A failed weekly role-flow smoke test now notifies every Boss, instead of
--    only writing a row nobody reads. An unexpected error inside the walk-through
--    is now reported as a failure instead of being mistaken for the planned rollback.
-- 3. Project Managers may read the per-person workload totals (open, overdue,
--    due this week) that HODs already can, so they can see load when assigning.
--    Totals only; no task details are returned.

create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientId',p_data->'clientId','clientName',p_data->'clientName','projectId',p_data->'projectId','projectName',p_data->'projectName',
    'deliverableId',p_data->'deliverableId','visibility',p_data->'visibility',
    'serviceType',p_data->'serviceType','title',p_data->'title','description',p_data->'description',
    'startDate',p_data->'startDate','dueDate',p_data->'dueDate','status',p_data->'status','completionPercentage',p_data->'completionPercentage',
    'outputAttachments',case when p_data->>'status' in('Approved','Completed') then p_data->'outputAttachments' else null end,'attachmentLink',p_data->'attachmentLink','attachmentName',p_data->'attachmentName','website',p_data->'website','facebookPage',p_data->'facebookPage',
    'isCompleted',p_data->'isCompleted','completedAt',p_data->'completedAt','clientApprovalStatus',p_data->'clientApprovalStatus',
    'revisionCount',p_data->'revisionCount','clientRating',p_data->'clientRating',
    -- Why the expected date moved; who moved it stays internal.
    'dateChange',case when jsonb_typeof(p_data->'dateChange') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'from',p_data->'dateChange'->'from','reason',p_data->'dateChange'->'reason','changedAt',p_data->'dateChange'->'changedAt')) end
  ));
$$;

create or replace function private.aitask_run_role_flow_smoke(p_workspace_id text default 'aitask-main')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pm record; v_hod record; v_staff record;
  v_log text := ''; v_failures integer := 0; v_ok boolean;
  v_steps text[][] := array[
    ['pm','create'], ['hod','assign'], ['stf','In Progress'], ['stf','Waiting Approval'],
    ['hod','Revision'], ['stf','In Progress'], ['stf','Waiting Approval'],
    ['hod','Approved'], ['pm','Completed']];
  v_expected text[] := array['Pending','Pending','In Progress','Waiting Approval','Revision','In Progress','Waiting Approval','Approved','Completed'];
  v_result jsonb; v_data jsonb; v_version bigint; v_status text; v_actor uuid; i integer; v_run_id bigint;
begin
  select id, auth_user_id into v_pm from public.aitask_members
    where workspace_id = p_workspace_id and role = 'Project Manager' and auth_user_id is not null
      and not coalesce(is_super_admin, false) order by id limit 1;
  select id, auth_user_id, departments into v_hod from public.aitask_members
    where workspace_id = p_workspace_id and role = 'HOD' and auth_user_id is not null order by id limit 1;
  select m.id, m.auth_user_id into v_staff from public.aitask_members m
    where m.workspace_id = p_workspace_id and m.role = 'Staff' and m.auth_user_id is not null
      and m.departments && v_hod.departments order by m.id limit 1;
  if v_pm.id is null or v_hod.id is null or v_staff.id is null then
    insert into private.aitask_smoke_runs(workspace_id, ok, detail)
    values (p_workspace_id, true, 'SKIPPED: needs a PM, an HOD and a Staff member sharing a department.');
    return true;
  end if;

  begin
    -- The command RPCs are security definer and read the caller from the JWT
    -- claims, so setting the claims is enough to act as each member.
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_pm.auth_user_id, 'role', 'authenticated')::text, true);
    v_result := public.aitask_execute_command(p_workspace_id, gen_random_uuid(), 'client.upsert', jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'zz-smoke-client', 'expectedVersion', 0,
      'data', jsonb_build_object('id', 'zz-smoke-client', 'clientName', 'ZZ Smoke Co', 'createdBy', v_pm.id))));
    if coalesce(v_result ->> 'ok', '') <> 'true' then
      v_failures := v_failures + 1; v_log := v_log || E'\nPM adds company: FAIL ' || coalesce(v_result ->> 'message', '');
    end if;
    for i in 1 .. array_length(v_steps, 1) loop
      v_actor := case v_steps[i][1] when 'pm' then v_pm.auth_user_id when 'hod' then v_hod.auth_user_id else v_staff.auth_user_id end;
      perform set_config('request.jwt.claims', json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
      if v_steps[i][2] = 'create' then
        v_result := public.aitask_execute_command(p_workspace_id, gen_random_uuid(), 'task.create', jsonb_build_array(jsonb_build_object(
          'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'zz-smoke-task', 'expectedVersion', 0,
          'data', jsonb_build_object('id', 'zz-smoke-task', 'clientId', 'zz-smoke-client', 'clientName', 'ZZ Smoke Co', 'title', 'Smoke flow',
            'department', v_hod.departments[1], 'assignedTo', v_hod.id, 'responsibleHodId', v_hod.id, 'assignmentState', 'pending_hod',
            'createdBy', v_pm.id, 'status', 'Pending', 'visibility', 'internal', 'isCompleted', false))));
      else
        select version, data into v_version, v_data from public.aitask_entities
          where workspace_id = p_workspace_id and entity_type = 'task' and entity_id = 'zz-smoke-task';
        if v_steps[i][2] = 'assign' then
          v_data := v_data || jsonb_build_object('assignedTo', v_staff.id, 'assignmentState', 'assigned_staff');
        elsif v_steps[i][2] = 'Completed' then
          v_data := v_data || jsonb_build_object('status', 'Completed', 'isCompleted', true, 'completionPercentage', 100);
        elsif v_steps[i][2] = 'Waiting Approval' then
          v_data := v_data || jsonb_build_object('status', 'Waiting Approval', 'completionPercentage', 100);
        else
          v_data := v_data || jsonb_build_object('status', v_steps[i][2]);
        end if;
        v_result := public.aitask_execute_command(p_workspace_id, gen_random_uuid(), 'task.update', jsonb_build_array(jsonb_build_object(
          'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'zz-smoke-task', 'expectedVersion', v_version, 'data', v_data)));
      end if;
      select data ->> 'status' into v_status from public.aitask_entities
        where workspace_id = p_workspace_id and entity_type = 'task' and entity_id = 'zz-smoke-task';
      if coalesce(v_result ->> 'ok', '') <> 'true' or v_status is distinct from v_expected[i] then
        v_failures := v_failures + 1;
        v_log := v_log || E'\n' || v_steps[i][1] || ' ' || v_steps[i][2] || ': FAIL expected ' || v_expected[i] || ', got '
          || coalesce(v_status, 'nothing') || ' ' || coalesce(v_result ->> 'code', '') || ' ' || coalesce(v_result ->> 'message', '');
      end if;
    end loop;
    -- Always undo what the walk-through wrote.
    raise exception using errcode = 'P0001', message = 'smoke-rollback';
  exception when others then
    -- Only the planned rollback is expected. Any other error is a broken flow
    -- and must count as a failure, not be mistaken for the rollback.
    if sqlerrm is distinct from 'smoke-rollback' then
      v_failures := v_failures + 1;
      v_log := v_log || E'\nUNEXPECTED ERROR: ' || sqlstate || ' ' || left(sqlerrm, 300);
    end if;
  end;

  v_ok := v_failures = 0;
  insert into private.aitask_smoke_runs(workspace_id, ok, detail)
  values (p_workspace_id, v_ok, case when v_ok then 'PASS' else 'FAIL x' || v_failures || v_log end)
  returning id into v_run_id;
  if not v_ok then
    raise warning 'Role flow smoke failed in %:%', p_workspace_id, v_log;
    -- Tell every Boss, so a broken role flow is noticed the same day.
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
    select p_workspace_id, 'notification', 'N-smoke-' || v_run_id || '-' || boss.id,
      jsonb_build_object(
        'id', 'N-smoke-' || v_run_id || '-' || boss.id,
        'targetUserId', boss.id,
        'title', 'Weekly role check failed',
        'message', left('The weekly check of the PM, HOD and Staff flow failed (' || v_failures || ' step' || case when v_failures = 1 then '' else 's' end || '). Open the release notes or ask your developer to run the role flow smoke test.', 500),
        'route', jsonb_build_object('page', 'settings'),
        'iconType', 'alert',
        'category', 'system',
        'importance', 'action',
        'isRead', false,
        'readByUserIds', '[]'::jsonb,
        'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    from public.aitask_members boss
    where boss.workspace_id = p_workspace_id and coalesce(boss.is_super_admin, false) and boss.auth_user_id is not null
    on conflict (workspace_id, entity_type, entity_id) do nothing;
  end if;
  return v_ok;
end;
$$;
revoke all on function private.aitask_run_role_flow_smoke(text) from public, anon, authenticated, service_role;

create or replace function private.aitask_hod_staff_workload(p_workspace_id text, p_today date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
      and (member.role in ('HOD', 'Project Manager') or (member.role = 'Staff' and (
        member.custom_role_id = 'builtin-hod' or exists (
          select 1 from public.aitask_entities role
          where role.workspace_id = member.workspace_id and role.entity_type = 'custom_role'
            and role.entity_id = member.custom_role_id and role.data->>'isBuiltin' = 'true' and role.data->>'baseRole' = 'HOD'
        )
      )))
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_today is null or p_today < (now() at time zone 'UTC')::date - 1 or p_today > (now() at time zone 'UTC')::date + 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION');
  end if;
  v_start := date_trunc('week', p_today::timestamp)::date;
  v_end := v_start + 5;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', member.id, 'name', member.name, 'departments', member.departments,
    'open', coalesce(counts.open, 0), 'overdue', coalesce(counts.overdue, 0), 'dueThisWeek', coalesce(counts.due_week, 0)
  ) order by member.name, member.id), '[]'::jsonb) into v_result
  from public.aitask_members member
  left join lateral (
    select count(*) filter (where open_task) as open,
      count(*) filter (where open_task and due < to_char(p_today, 'YYYY-MM-DD')) as overdue,
      count(*) filter (where open_task and due between to_char(v_start, 'YYYY-MM-DD') and to_char(v_end, 'YYYY-MM-DD')) as due_week
    from (
      select coalesce(task.data->>'isCompleted', 'false') <> 'true'
          and coalesce(task.data->>'status', '') not in ('Completed', 'Cancelled') as open_task,
        case when task.data->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then task.data->>'dueDate' end as due
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id and task.entity_type = 'task' and task.assigned_to = member.id
    ) task_rows
  ) counts on true
  where member.workspace_id = p_workspace_id and member.role = 'Staff'
    and member.custom_role_id is distinct from 'builtin-hod'
    and not exists (select 1 from public.aitask_entities role
      where role.workspace_id = member.workspace_id and role.entity_type = 'custom_role'
        and role.entity_id = member.custom_role_id and role.data->>'isBuiltin' = 'true' and role.data->>'baseRole' = 'HOD');
  return jsonb_build_object('ok', true, 'members', v_result);
end;
$$;
