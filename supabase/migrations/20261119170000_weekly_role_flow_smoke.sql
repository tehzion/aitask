-- A weekly, self-cleaning check that the PM -> HOD -> Staff flow still works.
--
-- The function impersonates one real Project Manager, HOD and Staff member who
-- share a department, walks one task through create, assign, work, review,
-- revision, approval and completion, and then rolls every write back. Only the
-- result is kept (private.aitask_smoke_runs), so a release that quietly breaks a
-- role flow is caught within a week instead of by a colleague.
create table if not exists private.aitask_smoke_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  workspace_id text not null,
  ok boolean not null,
  detail text not null
);
alter table private.aitask_smoke_runs enable row level security;
revoke all on private.aitask_smoke_runs from public, anon, authenticated;

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
  v_result jsonb; v_data jsonb; v_version bigint; v_status text; v_actor uuid; i integer;
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
  exception when raise_exception then
    null;
  end;

  v_ok := v_failures = 0;
  insert into private.aitask_smoke_runs(workspace_id, ok, detail)
  values (p_workspace_id, v_ok, case when v_ok then 'PASS' else 'FAIL x' || v_failures || v_log end);
  if not v_ok then
    raise warning 'Role flow smoke failed in %:%', p_workspace_id, v_log;
  end if;
  return v_ok;
end;
$$;

revoke all on function private.aitask_run_role_flow_smoke(text) from public, anon, authenticated, service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'aitask-weekly-role-flow-smoke',
  '41 2 * * 1',
  $$select private.aitask_run_role_flow_smoke('aitask-main');$$
)
where not exists (
  select 1 from cron.job where jobname = 'aitask-weekly-role-flow-smoke'
);
