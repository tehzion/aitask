begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000931', 'authenticated', 'authenticated', 'pgtap-pmtask-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000932', 'authenticated', 'authenticated', 'pgtap-pmtask-pm1@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000933', 'authenticated', 'authenticated', 'pgtap-pmtask-pm2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000934', 'authenticated', 'authenticated', 'pgtap-pmtask-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-pm-task-mgmt', 'Project Manager task management test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-pmtask-boss', 'pgtap-pm-task-mgmt', '00000000-0000-0000-0000-000000000931', 'Boss', 'pgtap-pmtask-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-pmtask-pm1', 'pgtap-pm-task-mgmt', '00000000-0000-0000-0000-000000000932', 'PM One', 'pgtap-pmtask-pm1@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-pmtask-pm2', 'pgtap-pm-task-mgmt', '00000000-0000-0000-0000-000000000933', 'PM Two', 'pgtap-pmtask-pm2@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-pmtask-staff', 'pgtap-pm-task-mgmt', '00000000-0000-0000-0000-000000000934', 'Staff', 'pgtap-pmtask-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-pm-task-mgmt', 'client', 'pmtask-pm1-client', '{"id":"pmtask-pm1-client","clientName":"PM One Co","createdBy":"pgtap-pmtask-pm1"}'::jsonb),
  ('pgtap-pm-task-mgmt', 'project', 'pmtask-pm1-project', '{"id":"pmtask-pm1-project","clientId":"pmtask-pm1-client","clientName":"PM One Co","projectName":"PM One Launch","createdBy":"pgtap-pmtask-pm1"}'::jsonb),
  ('pgtap-pm-task-mgmt', 'task', 'pmtask-pm1-staff-task', '{"id":"pmtask-pm1-staff-task","clientId":"pmtask-pm1-client","clientName":"PM One Co","projectId":"pmtask-pm1-project","title":"PM One Staff Task","department":"Designer","assignedTo":"pgtap-pmtask-staff","createdBy":"pgtap-pmtask-staff","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-pm-task-mgmt', 'client', 'pmtask-pm2-client', '{"id":"pmtask-pm2-client","clientName":"PM Two Co","createdBy":"pgtap-pmtask-pm2"}'::jsonb),
  ('pgtap-pm-task-mgmt', 'project', 'pmtask-pm2-project', '{"id":"pmtask-pm2-project","clientId":"pmtask-pm2-client","clientName":"PM Two Co","projectName":"PM Two Launch","createdBy":"pgtap-pmtask-pm2"}'::jsonb),
  ('pgtap-pm-task-mgmt', 'task', 'pmtask-pm2-staff-task', '{"id":"pmtask-pm2-staff-task","clientId":"pmtask-pm2-client","clientName":"PM Two Co","projectId":"pmtask-pm2-project","title":"PM Two Staff Task","department":"Designer","assignedTo":"pgtap-pmtask-staff","createdBy":"pgtap-pmtask-staff","status":"Pending","visibility":"internal"}'::jsonb);

-- Project Manager One: can view and edit portfolio tasks, including ones they
-- did not create, because the task sits in a project they own.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000932', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_can_view_task('pgtap-pm-task-mgmt', 'pmtask-pm1-staff-task'), true, 'PM One can view a portfolio task they did not create');
select is(private.aitask_can_edit_task('pgtap-pm-task-mgmt', 'pmtask-pm1-staff-task'), true, 'PM One can edit a portfolio task they did not create');

select is(
  (public.aitask_execute_command(
    'pgtap-pm-task-mgmt', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pmtask-pm1-staff-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-task-mgmt' and entity_type = 'task' and entity_id = 'pmtask-pm1-staff-task'),
      'data', '{"id":"pmtask-pm1-staff-task","clientId":"pmtask-pm1-client","clientName":"PM One Co","projectId":"pmtask-pm1-project","title":"PM One Staff Task Updated","department":"Designer","assignedTo":"pgtap-pmtask-staff","createdBy":"pgtap-pmtask-staff","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM One can update a portfolio task through the command path'
);

select is(
  (public.aitask_execute_command(
    'pgtap-pm-task-mgmt', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pmtask-pm1-new-task',
      'parentId', 'pmtask-pm1-project',
      'expectedVersion', 0,
      'data', '{"id":"pmtask-pm1-new-task","clientId":"pmtask-pm1-client","clientName":"PM One Co","projectId":"pmtask-pm1-project","title":"PM One New Task","department":"Designer","assignedTo":"pgtap-pmtask-staff","createdBy":"pgtap-pmtask-pm1","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM One can create a task in a project they own'
);

reset role;

-- Project Manager Two is scoped out of PM One's portfolio.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000933', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_can_edit_task('pgtap-pm-task-mgmt', 'pmtask-pm1-staff-task'), false, 'PM Two cannot edit another PM portfolio task');

select is(
  (public.aitask_execute_command(
    'pgtap-pm-task-mgmt', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pmtask-pm1-staff-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-task-mgmt' and entity_type = 'task' and entity_id = 'pmtask-pm1-staff-task'),
      'data', '{"id":"pmtask-pm1-staff-task","clientId":"pmtask-pm1-client","clientName":"PM One Co","projectId":"pmtask-pm1-project","title":"Hijacked","department":"Designer","assignedTo":"pgtap-pmtask-staff","createdBy":"pgtap-pmtask-staff","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM Two cannot update another PM portfolio task'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
