-- Post-release production smoke test for the PM -> HOD -> Staff flow.
--
-- Run after every release that touches migrations, for example through the
-- Supabase SQL editor or the connector. It impersonates real members, runs the
-- complete task lifecycle, and ALWAYS ends by raising an exception, so every
-- write rolls back and no data remains. The exception message is the report;
-- a line that starts with FAIL means the release broke a role flow.
--
-- Members are chosen automatically: the first Project Manager, the first HOD,
-- and a Staff member who shares one of that HOD's departments.
do $smoke$
declare
  ws text := 'aitask-main';
  pm record; hod record; stf record;
  log text := '';
  failures integer := 0;
  r jsonb; d jsonb; ver bigint; st text; who record; i integer;
  steps text[][] := array[
    ['pm','create'], ['hod','assign'], ['stf','In Progress'], ['stf','Waiting Approval'],
    ['hod','Revision'], ['stf','In Progress'], ['stf','Waiting Approval'],
    ['hod','Approved'], ['pm','Completed']];
  expected text[] := array['Pending','Pending','In Progress','Waiting Approval','Revision','In Progress','Waiting Approval','Approved','Completed'];
begin
  select id, auth_user_id into pm from public.aitask_members
    where workspace_id = ws and role = 'Project Manager' and auth_user_id is not null and not coalesce(is_super_admin, false)
      and id not in ('u-boss', 'u-adminmojo') order by id limit 1;
  select id, auth_user_id, departments into hod from public.aitask_members
    where workspace_id = ws and role = 'HOD' and auth_user_id is not null order by id limit 1;
  select m.id, m.auth_user_id into stf from public.aitask_members m
    where m.workspace_id = ws and m.role = 'Staff' and m.auth_user_id is not null and m.departments && hod.departments order by m.id limit 1;
  if pm.id is null or hod.id is null or stf.id is null then
    raise exception 'SMOKE SKIPPED: needs one PM, one HOD and one Staff member sharing a department (pm=% hod=% staff=%)', pm.id, hod.id, stf.id;
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', pm.auth_user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pm.auth_user_id, 'role', 'authenticated')::text, true);
  r := public.aitask_execute_command(ws, gen_random_uuid(), 'client.upsert', jsonb_build_array(jsonb_build_object(
    'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'zz-smoke-client', 'expectedVersion', 0,
    'data', jsonb_build_object('id', 'zz-smoke-client', 'clientName', 'ZZ Smoke Co', 'createdBy', pm.id))));
  log := log || E'\nPM adds company: ' || coalesce(r ->> 'ok', '?');
  if coalesce(r ->> 'ok', '') <> 'true' then failures := failures + 1; log := log || ' FAIL ' || coalesce(r ->> 'message', ''); end if;

  for i in 1 .. array_length(steps, 1) loop
    select * into who from (values
      ('pm', pm.auth_user_id), ('hod', hod.auth_user_id), ('stf', stf.auth_user_id)) v(k, uid) where k = steps[i][1];
    perform set_config('request.jwt.claim.sub', who.uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', who.uid, 'role', 'authenticated')::text, true);
    if steps[i][2] = 'create' then
      r := public.aitask_execute_command(ws, gen_random_uuid(), 'task.create', jsonb_build_array(jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'zz-smoke-task', 'expectedVersion', 0,
        'data', jsonb_build_object('id', 'zz-smoke-task', 'clientId', 'zz-smoke-client', 'clientName', 'ZZ Smoke Co',
          'title', 'Smoke flow', 'department', hod.departments[1], 'assignedTo', hod.id, 'responsibleHodId', hod.id,
          'assignmentState', 'pending_hod', 'createdBy', pm.id, 'status', 'Pending', 'visibility', 'internal', 'isCompleted', false))));
    else
      select version, data into ver, d from public.aitask_entities
        where workspace_id = ws and entity_type = 'task' and entity_id = 'zz-smoke-task';
      if steps[i][2] = 'assign' then
        d := d || jsonb_build_object('assignedTo', stf.id, 'assignmentState', 'assigned_staff');
      elsif steps[i][2] = 'Completed' then
        d := d || jsonb_build_object('status', 'Completed', 'isCompleted', true, 'completionPercentage', 100);
      elsif steps[i][2] = 'Waiting Approval' then
        d := d || jsonb_build_object('status', 'Waiting Approval', 'completionPercentage', 100);
      else
        d := d || jsonb_build_object('status', steps[i][2]);
      end if;
      r := public.aitask_execute_command(ws, gen_random_uuid(), 'task.update', jsonb_build_array(jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'zz-smoke-task',
        'expectedVersion', ver, 'data', d)));
    end if;
    select data ->> 'status' into st from public.aitask_entities
      where workspace_id = ws and entity_type = 'task' and entity_id = 'zz-smoke-task';
    log := log || E'\n' || steps[i][1] || ' ' || steps[i][2] || ': ok=' || coalesce(r ->> 'ok', '?') || ' status=' || coalesce(st, '?');
    if coalesce(r ->> 'ok', '') <> 'true' or st is distinct from expected[i] then
      failures := failures + 1;
      log := log || ' FAIL expected ' || expected[i] || ' ' || coalesce(r ->> 'code', '') || ' ' || coalesce(r ->> 'message', '');
    end if;
  end loop;

  execute 'reset role';
  raise exception E'ROLE FLOW SMOKE % (rolled back, no data written)%', case when failures = 0 then 'PASS' else 'FAIL x' || failures end, log;
end
$smoke$;
