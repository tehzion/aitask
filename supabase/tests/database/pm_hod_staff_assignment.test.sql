begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009901', 'authenticated', 'authenticated', 'pm-routing@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009902', 'authenticated', 'authenticated', 'hod-routing@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009903', 'authenticated', 'authenticated', 'staff-routing@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009904', 'authenticated', 'authenticated', 'foreign-staff-routing@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-pm-hod-staff-routing', 'PM HOD Staff routing');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('routing-pm', 'pgtap-pm-hod-staff-routing', '00000000-0000-0000-0000-000000009901', 'Routing PM', 'pm-routing@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('routing-hod', 'pgtap-pm-hod-staff-routing', '00000000-0000-0000-0000-000000009902', 'Routing HOD', 'hod-routing@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('routing-staff', 'pgtap-pm-hod-staff-routing', '00000000-0000-0000-0000-000000009903', 'Routing Staff', 'staff-routing@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('foreign-staff', 'pgtap-pm-hod-staff-routing', '00000000-0000-0000-0000-000000009904', 'Foreign Staff', 'foreign-staff-routing@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  ('pgtap-pm-hod-staff-routing', 'client', 'routing-client', '{"id":"routing-client","clientName":"Routing Co","createdBy":"routing-pm"}'::jsonb),
  ('pgtap-pm-hod-staff-routing', 'project', 'routing-project', '{"id":"routing-project","clientId":"routing-client","clientName":"Routing Co","projectName":"Routing Project","createdBy":"routing-pm","projectManagerIds":["routing-pm"],"hodMemberIds":["routing-hod"],"staffMemberIds":["routing-staff"],"services":["Design"],"startDate":"2026-10-01","deadline":"2026-10-30"}'::jsonb);

create function pg_temp.route_task(p_action text, p_id text, p_data jsonb) returns jsonb
language sql as $$
  select public.aitask_execute_command(
    'pgtap-pm-hod-staff-routing', gen_random_uuid(),
    case when p_action = 'insert' then 'task.create' else 'task.update' end,
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', p_action, 'entityType', 'task', 'entityId', p_id,
      'expectedVersion', case when p_action = 'insert' then 0 else (
        select version from public.aitask_entities
        where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = p_id
      ) end,
      'data', p_data
    ))
  );
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009901', true);
set local role authenticated;

select is((pg_temp.route_task('insert', 'routing-task', jsonb_build_object(
  'id', 'routing-task', 'clientId', 'routing-client', 'clientName', 'Routing Co',
  'projectId', 'routing-project', 'projectName', 'Routing Project', 'title', 'Route me',
  'department', 'Designer', 'assignedTo', 'routing-hod', 'responsibleHodId', 'routing-hod',
  'assignmentState', 'pending_hod', 'createdBy', 'routing-pm', 'status', 'Pending',
  'visibility', 'internal', 'isCompleted', false
))->>'ok')::boolean, true, 'PM creation is accepted only with the eligible HOD as owner');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009902', true);
select is((pg_temp.route_task('update', 'routing-task', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-task') || jsonb_build_object(
  'assignedTo', 'routing-staff', 'responsibleHodId', 'routing-hod', 'assignmentState', 'assigned_staff'
))->>'ok')::boolean, true, 'HOD can delegate to project Staff while retaining the responsible HOD');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009903', true);
select is((pg_temp.route_task('update', 'routing-task', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-task') || jsonb_build_object(
  'status', 'In Progress', 'completionPercentage', 30, 'notes', 'Assigned Staff progress update'
))->>'ok')::boolean, true, 'Assigned Staff can update execution progress without Full Edit or PM permissions');
select is((pg_temp.route_task('update', 'routing-task', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-task') || jsonb_build_object(
  'assignedTo', 'foreign-staff', 'assignmentState', 'assigned_staff'
))->>'ok')::boolean, false, 'Staff cannot self-assign or switch to a foreign project member');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009901', true);
select is((pg_temp.route_task('update', 'routing-task', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-task') || jsonb_build_object(
  'assignedTo', 'foreign-staff', 'assignmentState', 'assigned_staff', 'responsibleHodId', 'routing-hod'
))->>'ok')::boolean, false, 'PM cannot bypass project Staff scope');

select is((pg_temp.route_task('insert', 'routing-override', jsonb_build_object(
  'id', 'routing-override', 'clientId', 'routing-client', 'clientName', 'Routing Co',
  'projectId', 'routing-project', 'projectName', 'Routing Project', 'title', 'Override me',
  'department', 'Designer', 'assignedTo', 'routing-hod', 'responsibleHodId', 'routing-hod',
  'assignmentState', 'pending_hod', 'createdBy', 'routing-pm', 'status', 'Pending',
  'visibility', 'internal', 'isCompleted', false
))->>'ok')::boolean, true, 'a second task starts in the pending HOD state');

select is((pg_temp.route_task('update', 'routing-override', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-override') || jsonb_build_object(
  'assignedTo', 'routing-staff', 'responsibleHodId', 'routing-hod', 'assignmentState', 'assigned_staff'
))->>'ok')::boolean, false, 'PM cannot bypass the HOD stage without an override reason');

select is((pg_temp.route_task('update', 'routing-override', (select data from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-override') || jsonb_build_object(
  'assignedTo', 'routing-staff', 'assignmentState', 'assigned_staff', 'responsibleHodId', 'routing-hod',
  'assignmentOverride', jsonb_build_object('actorId', 'routing-pm', 'reason', 'Urgent client escalation', 'createdAt', now())
))->>'ok')::boolean, true, 'scoped PM override requires and accepts an audit reason');

select is((select data->>'assignmentState' from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-override'), 'assigned_staff', 'assignment state remains durable after the override');
select is((select data->'assignmentOverride'->>'reason' from public.aitask_entities where workspace_id = 'pgtap-pm-hod-staff-routing' and entity_type = 'task' and entity_id = 'routing-override'), 'Urgent client escalation', 'override reason is persisted for audit');

reset role;
select * from finish();
rollback;
