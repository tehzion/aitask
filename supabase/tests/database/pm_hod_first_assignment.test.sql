begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000951', 'authenticated', 'authenticated', 'pgtap-pmhod-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000952', 'authenticated', 'authenticated', 'pgtap-pmhod-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000953', 'authenticated', 'authenticated', 'pgtap-pmhod-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000954', 'authenticated', 'authenticated', 'pgtap-pmhod-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000955', 'authenticated', 'authenticated', 'pgtap-pmhod-video@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-pmhod', 'PM hands off to HOD first test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-pmhod-boss', 'pgtap-pmhod', '00000000-0000-0000-0000-000000000951', 'Boss', 'pgtap-pmhod-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-pmhod-pm', 'pgtap-pmhod', '00000000-0000-0000-0000-000000000952', 'PM', 'pgtap-pmhod-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-pmhod-hod', 'pgtap-pmhod', '00000000-0000-0000-0000-000000000953', 'HOD', 'pgtap-pmhod-hod@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-pmhod-staff', 'pgtap-pmhod', '00000000-0000-0000-0000-000000000954', 'Staff', 'pgtap-pmhod-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-pmhod-video', 'pgtap-pmhod', '00000000-0000-0000-0000-000000000955', 'Video Staff', 'pgtap-pmhod-video@aitask.local', 'Staff', 'Video Editor', array['Video Editor'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-pmhod', 'client', 'pgtap-pmhod-client', '{"id":"pgtap-pmhod-client","clientName":"PMHod Co","createdBy":"pgtap-pmhod-pm"}'::jsonb),
  ('pgtap-pmhod', 'task', 'pgtap-pmhod-a', '{"id":"pgtap-pmhod-a","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Designer task","department":"Designer","assignedTo":"","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-pmhod', 'task', 'pgtap-pmhod-b', '{"id":"pgtap-pmhod-b","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Video task","department":"Video Editor","assignedTo":"","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-pmhod', 'task', 'pgtap-pmhod-c', '{"id":"pgtap-pmhod-c","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Optional approval","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Waiting Approval","requiresInternalApproval":false,"visibility":"internal"}'::jsonb),
  ('pgtap-pmhod', 'task', 'pgtap-pmhod-d', '{"id":"pgtap-pmhod-d","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Required approval","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Waiting Approval","visibility":"internal"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000952', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- 1. PM cannot assign straight to staff while the department has an HOD.
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-a',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-a'),
      'data', '{"id":"pgtap-pmhod-a","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Designer task","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM cannot assign a department task straight to staff when an HOD exists'
);

-- 2. PM assigns to the department HOD (stage 1).
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-a',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-a'),
      'data', '{"id":"pgtap-pmhod-a","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Designer task","department":"Designer","assignedTo":"pgtap-pmhod-hod","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM assigns the task to the department HOD'
);

-- 3. The assigned HOD delegates to staff (stage 2).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000953', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-a',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-a'),
      'data', '{"id":"pgtap-pmhod-a","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Designer task","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'the department HOD delegates the task to staff'
);

-- 4. A department without an HOD keeps the PM fallback (direct staff assignment).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000952', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-b',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-b'),
      'data', '{"id":"pgtap-pmhod-b","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Video task","department":"Video Editor","assignedTo":"pgtap-pmhod-video","createdBy":"pgtap-pmhod-pm","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'a department without an HOD allows the PM fallback staff assignment'
);

-- 5. PM finalizes a waiting task that opted out of internal approval.
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-c',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-c'),
      'data', '{"id":"pgtap-pmhod-c","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Optional approval","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Completed","requiresInternalApproval":false,"visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM finalizes a waiting task when internal approval is optional'
);

-- 6. PM cannot finalize a waiting task that still requires internal approval.
select is(
  (public.aitask_execute_command(
    'pgtap-pmhod', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-pmhod-d',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pmhod' and entity_type = 'task' and entity_id = 'pgtap-pmhod-d'),
      'data', '{"id":"pgtap-pmhod-d","clientId":"pgtap-pmhod-client","clientName":"PMHod Co","title":"Required approval","department":"Designer","assignedTo":"pgtap-pmhod-staff","createdBy":"pgtap-pmhod-pm","status":"Completed","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM cannot finalize a waiting task that still requires internal approval'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
