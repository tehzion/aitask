begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001301', 'authenticated', 'authenticated', 'pgtap-hod-execution@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001302', 'authenticated', 'authenticated', 'pgtap-hod-staff-a@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001303', 'authenticated', 'authenticated', 'pgtap-hod-staff-b@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001304', 'authenticated', 'authenticated', 'pgtap-hod-pm@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001305', 'authenticated', 'authenticated', 'pgtap-other-hod-execution@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001306', 'authenticated', 'authenticated', 'pgtap-assigned-pm-execution@aitask.local', '', now(), '{}', '{}', now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-hod-execution', 'HOD execution permissions');

insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions)
values
  ('hod-execution', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001301', 'Execution HOD', 'pgtap-hod-execution@aitask.local', 'HOD', 'Video Editor', array['Video Editor'], '{"manageCreatedTasks":true}'),
  ('staff-execution-a', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001302', 'Staff A', 'pgtap-hod-staff-a@aitask.local', 'Staff', 'Video Editor', array['Video Editor'], '{}'),
  ('staff-execution-b', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001303', 'Staff B', 'pgtap-hod-staff-b@aitask.local', 'Staff', 'Video Editor', array['Video Editor'], '{}'),
  ('pm-execution', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001304', 'Portfolio PM', 'pgtap-hod-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'),
  ('other-hod-execution', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001305', 'Other HOD', 'pgtap-other-hod-execution@aitask.local', 'HOD', 'Video Editor', array['Video Editor'], '{}'),
  ('assigned-pm-execution', 'pgtap-hod-execution', '00000000-0000-0000-0000-000000001306', 'Assigned PM', 'pgtap-assigned-pm-execution@aitask.local', 'Project Manager', 'Management', array['Management'], '{}');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-hod-execution', 'project', 'hod-execution-project', jsonb_build_object(
    'id', 'hod-execution-project', 'projectName', 'Execution Project',
    'clientName', 'Execution Co', 'createdBy', 'pm-execution',
    'hodMemberIds', jsonb_build_array('hod-execution'),
    'staffMemberIds', jsonb_build_array('staff-execution-a', 'staff-execution-b'),
    'projectManagerIds', jsonb_build_array('assigned-pm-execution')
  )),
  ('pgtap-hod-execution', 'task', 'hod-execution-task', jsonb_build_object(
    'id', 'hod-execution-task', 'title', 'Execution brief',
    'projectId', 'hod-execution-project', 'projectName', 'Execution Project',
    'clientId', 'execution-client', 'clientName', 'Execution Co',
    'serviceType', 'Video editing', 'department', 'Video Editor',
    'assignedTo', 'staff-execution-a', 'responsibleHodId', 'hod-execution',
    'assignmentState', 'assigned_staff', 'assignedBy', 'pm-execution', 'createdBy', 'pm-execution',
    'status', 'Pending', 'priority', 'Medium', 'startDate', '2026-10-23',
    'dueDate', '2026-10-30', 'description', 'Initial brief', 'notes', 'Initial notes'
  )),
  ('pgtap-hod-execution', 'project', 'hod-other-project', jsonb_build_object(
    'id', 'hod-other-project', 'projectName', 'Other HOD Project',
    'clientName', 'Execution Co', 'createdBy', 'pm-execution',
    'hodMemberIds', jsonb_build_array('other-hod-execution'),
    'staffMemberIds', jsonb_build_array('staff-execution-a', 'staff-execution-b'),
    'projectManagerIds', jsonb_build_array('pm-execution')
  )),
  ('pgtap-hod-execution', 'task', 'hod-other-task', jsonb_build_object(
    'id', 'hod-other-task', 'title', 'Other project brief',
    'projectId', 'hod-other-project', 'projectName', 'Other HOD Project',
    'clientId', 'execution-client', 'clientName', 'Execution Co',
    'serviceType', 'Video editing', 'department', 'Video Editor',
    'assignedTo', 'staff-execution-a', 'responsibleHodId', 'hod-execution',
    'assignmentState', 'assigned_staff', 'createdBy', 'pm-execution',
    'status', 'Pending', 'priority', 'Medium', 'startDate', '2026-10-23',
    'dueDate', '2026-10-30', 'description', 'Other project brief'
  ));

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001301', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(private.aitask_is_hod('pgtap-hod-execution'), 'HOD identity is recognized');
select ok(private.aitask_can_edit_task('pgtap-hod-execution', 'hod-execution-task'), 'HOD can edit an authorized project task');
select ok(private.aitask_hod_task_execution_patch_is_valid(
  'pgtap-hod-execution',
  (select data from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
  (select data || jsonb_build_object('description', 'Updated brief', 'startDate', '2026-10-24', 'dueDate', '2026-10-31', 'priority', 'High') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
), 'HOD execution fields pass the patch guard');
select ok(not private.aitask_hod_task_execution_patch_is_valid(
  'pgtap-hod-execution',
  (select data from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
  (select data || jsonb_build_object('clientName', 'Different Co') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
), 'HOD cannot change the company through a crafted payload');
select ok(private.aitask_task_assignment_is_valid(
  'pgtap-hod-execution', 'update',
  (select data from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
  (select data || jsonb_build_object('assignedTo', 'staff-execution-b', 'assignedBy', 'hod-execution', 'assignmentState', 'assigned_staff') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
), 'HOD can route pending work to project-authorized Staff');
select ok(not private.aitask_hod_task_execution_patch_is_valid(
  'pgtap-hod-execution',
  (select data from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
  (select data || jsonb_build_object(
    'assignedTo', 'staff-execution-b', 'assignedBy', 'other-hod-execution',
    'assignedAt', '2020-01-01T00:00:00.000Z', 'assignmentState', 'assigned_staff'
  ) from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
), 'HOD route attribution cannot be forged by the client');
select ok(not private.aitask_task_assignment_is_valid(
  'pgtap-hod-execution', 'update',
  (select data from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-other-task'),
  (select data || jsonb_build_object('assignedTo', 'staff-execution-b', 'assignedBy', 'hod-execution', 'assignmentState', 'assigned_staff')
   from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-other-task')
), 'HOD cannot route a task from a project outside the HOD project scope');

set local role authenticated;

select is((public.aitask_execute_command(
  'pgtap-hod-execution', gen_random_uuid(), 'task.update',
  jsonb_build_array(jsonb_build_object(
    'kind', 'entity', 'action', 'update', 'entityType', 'task',
    'entityId', 'hod-execution-task',
    'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
    'data', (select data || jsonb_build_object('description', 'Updated brief', 'startDate', '2026-10-24', 'dueDate', '2026-10-31', 'priority', 'High') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
  ))
)->>'ok')::boolean, true, 'HOD execution edit saves through the authenticated command RPC');

select is((public.aitask_execute_command(
  'pgtap-hod-execution', gen_random_uuid(), 'task.update',
  jsonb_build_array(jsonb_build_object(
    'kind', 'entity', 'action', 'update', 'entityType', 'task',
    'entityId', 'hod-execution-task',
    'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
    'data', (select data || jsonb_build_object('clientName', 'Different Co') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
  ))
)->>'ok')::boolean, false, 'HOD company ownership edit is rejected by the command boundary');

select is((public.aitask_execute_command(
  'pgtap-hod-execution', gen_random_uuid(), 'task.update',
  jsonb_build_array(jsonb_build_object(
    'kind', 'entity', 'action', 'update', 'entityType', 'task',
    'entityId', 'hod-execution-task',
    'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
    'data', (select data || jsonb_build_object('assignedTo', 'staff-execution-b', 'assignedBy', 'hod-execution', 'assignmentState', 'assigned_staff')
             from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
  ))
)->>'ok')::boolean, true, 'HOD can route project-authorized Staff through the command boundary');

select is((public.aitask_execute_command(
  'pgtap-hod-execution', gen_random_uuid(), 'task.update',
  jsonb_build_array(jsonb_build_object(
    'kind', 'entity', 'action', 'update', 'entityType', 'task',
    'entityId', 'hod-other-task',
    'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-other-task'),
    'data', (select data || jsonb_build_object('assignedTo', 'staff-execution-b', 'assignedBy', 'hod-execution', 'assignmentState', 'assigned_staff')
             from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-other-task')
  ))
)->>'ok')::boolean, false, 'the command boundary also rejects a cross-project HOD handoff');

select is((public.aitask_execute_command(
  'pgtap-hod-execution', gen_random_uuid(), 'task.update',
  jsonb_build_array(
    jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'hod-execution-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task'),
      'data', (select data || jsonb_build_object('dueDate', '2026-11-01') from public.aitask_entities where workspace_id = 'pgtap-hod-execution' and entity_type = 'task' and entity_id = 'hod-execution-task')
    ),
    jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'hod-pm-date-notice',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'hod-pm-date-notice', 'targetUserId', 'assigned-pm-execution',
        'title', 'Task Dates Updated', 'message', 'untrusted client message',
        'route', jsonb_build_object('page', 'tasks', 'entityId', 'hod-execution-task')
      )
    )
  )
)->>'ok')::boolean, true, 'an explicit project PM can receive a HOD date-update notification');

select * from finish();
rollback;
