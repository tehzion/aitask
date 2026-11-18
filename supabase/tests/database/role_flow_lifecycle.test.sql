begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- End-to-end role flow: a PM adds a company and a task for an HOD, the HOD
-- accepts and delegates to Staff, Staff works and submits, the HOD returns it
-- once and approves the resubmission, and the PM finalizes it.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007701', 'authenticated', 'authenticated', 'flow-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007702', 'authenticated', 'authenticated', 'flow-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007703', 'authenticated', 'authenticated', 'flow-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name) values ('pgtap-role-flow', 'Role flow lifecycle');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('flow-pm', 'pgtap-role-flow', '00000000-0000-0000-0000-000000007701', 'Flow PM', 'flow-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('flow-hod', 'pgtap-role-flow', '00000000-0000-0000-0000-000000007702', 'Flow HOD', 'flow-hod@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('flow-staff', 'pgtap-role-flow', '00000000-0000-0000-0000-000000007703', 'Flow Staff', 'flow-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

create function pg_temp.act(p_sub text, p_type text, p_action text, p_entity text, p_id text, p_data jsonb) returns jsonb
language plpgsql as $$
declare
  v_version bigint := 0;
  v_data jsonb := p_data;
begin
  perform set_config('request.jwt.claim.sub', p_sub, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  if p_action = 'update' then
    select version, data || p_data into v_version, v_data
    from public.aitask_entities
    where workspace_id = 'pgtap-role-flow' and entity_type = p_entity and entity_id = p_id;
  end if;
  return public.aitask_execute_command(
    'pgtap-role-flow', gen_random_uuid(), p_type,
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', p_action, 'entityType', p_entity, 'entityId', p_id,
      'expectedVersion', v_version, 'data', v_data
    ))
  );
end;
$$;

create function pg_temp.task_status() returns text language sql as $$
  select data ->> 'status' from public.aitask_entities
  where workspace_id = 'pgtap-role-flow' and entity_type = 'task' and entity_id = 'flow-task';
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is((pg_temp.act('00000000-0000-0000-0000-000000007701', 'client.upsert', 'insert', 'client', 'flow-client',
  jsonb_build_object('id', 'flow-client', 'clientName', 'Flow Co', 'createdBy', 'flow-pm')) ->> 'ok')::boolean, true,
  'PM adds a company');
select is((pg_temp.act('00000000-0000-0000-0000-000000007701', 'client.upsert', 'update', 'client', 'flow-client',
  jsonb_build_object('contactName', 'Flow Contact', 'contactEmail', 'contact@example.com')) ->> 'ok')::boolean, true,
  'PM edits company details');
select is((pg_temp.act('00000000-0000-0000-0000-000000007701', 'task.create', 'insert', 'task', 'flow-task',
  jsonb_build_object('id', 'flow-task', 'clientId', 'flow-client', 'clientName', 'Flow Co', 'title', 'Flow task',
    'department', 'Designer', 'assignedTo', 'flow-hod', 'responsibleHodId', 'flow-hod', 'assignmentState', 'pending_hod',
    'createdBy', 'flow-pm', 'status', 'Pending', 'visibility', 'internal', 'isCompleted', false)) ->> 'ok')::boolean, true,
  'PM creates a task for the HOD');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007702', true);
select is((select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-role-flow' and entity_type = 'task'), 1,
  'HOD receives the task');
select is((pg_temp.act('00000000-0000-0000-0000-000000007702', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('assignedTo', 'flow-staff', 'assignmentState', 'assigned_staff')) ->> 'ok')::boolean, true,
  'HOD assigns the task to Staff');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007703', true);
select is((select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-role-flow' and entity_type = 'task'), 1,
  'Staff receives the task');
select is((pg_temp.act('00000000-0000-0000-0000-000000007703', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'In Progress', 'completionPercentage', 50)) ->> 'ok')::boolean, true,
  'Staff updates progress');
select is((pg_temp.act('00000000-0000-0000-0000-000000007703', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'Waiting Approval', 'completionPercentage', 100)) ->> 'ok')::boolean, true,
  'Staff submits for review');

select is((pg_temp.act('00000000-0000-0000-0000-000000007702', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'Revision')) ->> 'ok')::boolean and pg_temp.task_status() = 'Revision', true,
  'HOD returns the work for revision');
select is((pg_temp.act('00000000-0000-0000-0000-000000007703', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'In Progress')) ->> 'ok')::boolean
  and (pg_temp.act('00000000-0000-0000-0000-000000007703', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'Waiting Approval', 'completionPercentage', 100)) ->> 'ok')::boolean, true,
  'Staff reworks and resubmits');
select is((pg_temp.act('00000000-0000-0000-0000-000000007702', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'Approved')) ->> 'ok')::boolean and pg_temp.task_status() = 'Approved', true,
  'HOD approves the resubmission');
select is((pg_temp.act('00000000-0000-0000-0000-000000007701', 'task.update', 'update', 'task', 'flow-task',
  jsonb_build_object('status', 'Completed', 'isCompleted', true, 'completionPercentage', 100)) ->> 'ok')::boolean
  and pg_temp.task_status() = 'Completed', true,
  'PM finalizes the approved task');

reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-role-flow' and entity_type = 'notification') > 0, true,
  'the flow generated notifications for the people involved');

select * from finish();
rollback;
