begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000941', 'authenticated', 'authenticated', 'pgtap-assign-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000942', 'authenticated', 'authenticated', 'pgtap-assign-pm1@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000943', 'authenticated', 'authenticated', 'pgtap-assign-pm2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000944', 'authenticated', 'authenticated', 'pgtap-assign-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000945', 'authenticated', 'authenticated', 'pgtap-assign-staff2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-assign', 'Task assignment attribution test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-assign-boss', 'pgtap-assign', '00000000-0000-0000-0000-000000000941', 'Boss', 'pgtap-assign-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-assign-pm1', 'pgtap-assign', '00000000-0000-0000-0000-000000000942', 'PM One', 'pgtap-assign-pm1@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-assign-pm2', 'pgtap-assign', '00000000-0000-0000-0000-000000000943', 'PM Two', 'pgtap-assign-pm2@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-assign-staff', 'pgtap-assign', '00000000-0000-0000-0000-000000000944', 'Staff One', 'pgtap-assign-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-assign-staff2', 'pgtap-assign', '00000000-0000-0000-0000-000000000945', 'Staff Two', 'pgtap-assign-staff2@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-assign', 'client', 'assign-pm1-client', '{"id":"assign-pm1-client","clientName":"Assign PM One Co","createdBy":"pgtap-assign-pm1"}'::jsonb),
  ('pgtap-assign', 'project', 'assign-pm1-project', '{"id":"assign-pm1-project","clientId":"assign-pm1-client","clientName":"Assign PM One Co","projectName":"Assign Launch","createdBy":"pgtap-assign-pm1"}'::jsonb),
  ('pgtap-assign', 'task', 'assign-pm1-task', '{"id":"assign-pm1-task","clientId":"assign-pm1-client","clientName":"Assign PM One Co","projectId":"assign-pm1-project","title":"Portfolio Task","department":"Designer","assignedTo":"pgtap-assign-staff","createdBy":"pgtap-assign-staff","status":"Pending","visibility":"internal"}'::jsonb);

-- PM One reassigns a portfolio task they did not create (previous behavior
-- rejected this with "You do not have permission to make this change.").
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000942', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-assign', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'assign-pm1-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-assign' and entity_type = 'task' and entity_id = 'assign-pm1-task'),
      'data', '{"id":"assign-pm1-task","clientId":"assign-pm1-client","clientName":"Assign PM One Co","projectId":"assign-pm1-project","title":"Portfolio Task","department":"Designer","assignedTo":"pgtap-assign-staff2","createdBy":"pgtap-assign-staff","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM One can reassign a portfolio task they did not create'
);

select is(
  (select data ->> 'assignedBy' from public.aitask_entities where workspace_id = 'pgtap-assign' and entity_type = 'task' and entity_id = 'assign-pm1-task'),
  'pgtap-assign-pm1',
  'the reassignment is attributed to PM One'
);

-- A later edit that does not change the assignee keeps the same assigner.
select is(
  (public.aitask_execute_command(
    'pgtap-assign', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'assign-pm1-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-assign' and entity_type = 'task' and entity_id = 'assign-pm1-task'),
      'data', '{"id":"assign-pm1-task","clientId":"assign-pm1-client","clientName":"Assign PM One Co","projectId":"assign-pm1-project","title":"Portfolio Task Renamed","department":"Designer","assignedTo":"pgtap-assign-staff2","createdBy":"pgtap-assign-staff","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM One can edit the portfolio task again'
);

select is(
  (select data ->> 'assignedBy' from public.aitask_entities where workspace_id = 'pgtap-assign' and entity_type = 'task' and entity_id = 'assign-pm1-task'),
  'pgtap-assign-pm1',
  'a non-assignment edit keeps the original assigner'
);

reset role;

-- Another Project Manager is scoped out of PM One's portfolio.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000943', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-assign', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'assign-pm1-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-assign' and entity_type = 'task' and entity_id = 'assign-pm1-task'),
      'data', '{"id":"assign-pm1-task","clientId":"assign-pm1-client","clientName":"Assign PM One Co","projectId":"assign-pm1-project","title":"Hijacked","department":"Designer","assignedTo":"pgtap-assign-staff","createdBy":"pgtap-assign-staff","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM Two cannot reassign another PM portfolio task'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
