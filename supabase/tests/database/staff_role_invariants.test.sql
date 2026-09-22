begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000951', 'authenticated', 'authenticated', 'pgtap-staff-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000952', 'authenticated', 'authenticated', 'pgtap-staff-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000953', 'authenticated', 'authenticated', 'pgtap-staff-one@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000954', 'authenticated', 'authenticated', 'pgtap-staff-two@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-staff-invariants', 'Staff role invariants test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-staff-boss', 'pgtap-staff-invariants', '00000000-0000-0000-0000-000000000951', 'Boss', 'pgtap-staff-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-staff-pm', 'pgtap-staff-invariants', '00000000-0000-0000-0000-000000000952', 'PM', 'pgtap-staff-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-staff-one', 'pgtap-staff-invariants', '00000000-0000-0000-0000-000000000953', 'Staff One', 'pgtap-staff-one@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-staff-two', 'pgtap-staff-invariants', '00000000-0000-0000-0000-000000000954', 'Staff Two', 'pgtap-staff-two@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-staff-invariants', 'client', 'staff-client', '{"id":"staff-client","clientName":"Staff Co","createdBy":"pgtap-staff-pm"}'::jsonb),
  ('pgtap-staff-invariants', 'task', 'staff-task', '{"id":"staff-task","clientId":"staff-client","clientName":"Staff Co","title":"Staff Task","department":"Designer","assignedTo":"pgtap-staff-one","createdBy":"pgtap-staff-one","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-staff-invariants', 'service_cycle', 'staff-cycle', '{"id":"staff-cycle","clientId":"staff-client","clientName":"Staff Co","status":"Published","publishedAt":"2026-09-22T00:00:00.000Z"}'::jsonb),
  ('pgtap-staff-invariants', 'deliverable', 'staff-deliverable', '{"id":"staff-deliverable","cycleId":"staff-cycle","clientId":"staff-client","clientName":"Staff Co","title":"Deliverable","sequence":1,"status":"Ready","taskIds":[]}'::jsonb);

-- Staff One updates their own profile through the generic member.update path.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000953', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-staff-invariants', gen_random_uuid(), 'member.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'member', 'action', 'update', 'entityType', 'member', 'entityId', 'pgtap-staff-one',
      'expectedVersion', (select version from public.aitask_members where workspace_id = 'pgtap-staff-invariants' and id = 'pgtap-staff-one'),
      'data', (select to_jsonb(m) from public.aitask_members m where m.workspace_id = 'pgtap-staff-invariants' and m.id = 'pgtap-staff-one') || '{"name":"Staff One Renamed"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'Staff can update their own profile as member.update'
);

-- Staff cannot reassign a task they did not create.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-invariants', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'staff-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-invariants' and entity_type = 'task' and entity_id = 'staff-task'),
      'data', '{"id":"staff-task","clientId":"staff-client","clientName":"Staff Co","title":"Staff Task","department":"Designer","assignedTo":"pgtap-staff-two","createdBy":"pgtap-staff-one","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'Staff cannot reassign a task without manageCreatedTasks'
);

-- Staff cannot change the task department.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-invariants', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'staff-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-invariants' and entity_type = 'task' and entity_id = 'staff-task'),
      'data', '{"id":"staff-task","clientId":"staff-client","clientName":"Staff Co","title":"Staff Task","department":"Video Editor","assignedTo":"pgtap-staff-one","createdBy":"pgtap-staff-one","status":"Pending","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  false,
  'Staff cannot change the task department without manageCreatedTasks'
);

-- Staff can advance a task they are assigned.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-invariants', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'staff-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-invariants' and entity_type = 'task' and entity_id = 'staff-task'),
      'data', '{"id":"staff-task","clientId":"staff-client","clientName":"Staff Co","title":"Staff Task","department":"Designer","assignedTo":"pgtap-staff-one","createdBy":"pgtap-staff-one","status":"In Progress","visibility":"internal"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'Staff can update the status of a task they are assigned'
);

-- Staff completing a deliverable may set deliveredAt (execution field).
select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-invariants', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'deliverable', 'entityId', 'staff-deliverable',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-invariants' and entity_type = 'deliverable' and entity_id = 'staff-deliverable'),
      'data', '{"id":"staff-deliverable","cycleId":"staff-cycle","clientId":"staff-client","clientName":"Staff Co","title":"Deliverable","sequence":1,"status":"Delivered","deliveredAt":"2026-09-22T10:00:00.000Z","taskIds":[]}'::jsonb
    )),
    null
  ) ->> 'ok')::boolean,
  true,
  'Staff can mark a deliverable delivered with deliveredAt'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
