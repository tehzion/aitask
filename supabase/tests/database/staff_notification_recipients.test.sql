begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000961', 'authenticated', 'authenticated', 'pgtap-notify-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000962', 'authenticated', 'authenticated', 'pgtap-notify-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000963', 'authenticated', 'authenticated', 'pgtap-notify-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000964', 'authenticated', 'authenticated', 'pgtap-notify-staff2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-notify', 'Staff notification recipients test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-notify-boss', 'pgtap-notify', '00000000-0000-0000-0000-000000000961', 'Boss', 'pgtap-notify-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-notify-pm', 'pgtap-notify', '00000000-0000-0000-0000-000000000962', 'Owning PM', 'pgtap-notify-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-notify-staff', 'pgtap-notify', '00000000-0000-0000-0000-000000000963', 'Staff One', 'pgtap-notify-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-notify-staff2', 'pgtap-notify', '00000000-0000-0000-0000-000000000964', 'Staff Two', 'pgtap-notify-staff2@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-notify', 'client', 'notify-client', '{"id":"notify-client","clientName":"Notify Co","createdBy":"pgtap-notify-pm"}'::jsonb),
  ('pgtap-notify', 'client', 'notify-client-boss', '{"id":"notify-client-boss","clientName":"Notify Boss Co","createdBy":"pgtap-notify-boss"}'::jsonb),
  ('pgtap-notify', 'task', 'notify-task', '{"id":"notify-task","clientId":"notify-client","clientName":"Notify Co","title":"Notify Task","department":"Designer","assignedTo":"pgtap-notify-staff","createdBy":"pgtap-notify-staff","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-notify', 'task', 'notify-task-assigner', '{"id":"notify-task-assigner","clientId":"notify-client-boss","clientName":"Notify Boss Co","title":"Assigned Task","department":"Designer","assignedTo":"pgtap-notify-staff","assignedBy":"pgtap-notify-pm","createdBy":"pgtap-notify-pm","status":"Pending","visibility":"internal"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- Staff may notify the owning Project Manager of a status update.
select is(
  (public.aitask_execute_command(
    'pgtap-notify', gen_random_uuid(), 'task.update',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'notify-task',
        'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-notify' and entity_type = 'task' and entity_id = 'notify-task'),
        'data', '{"id":"notify-task","clientId":"notify-client","clientName":"Notify Co","title":"Notify Task","department":"Designer","assignedTo":"pgtap-notify-staff","createdBy":"pgtap-notify-staff","status":"In Progress","visibility":"internal"}'::jsonb
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'notify-pm-op',
        'expectedVersion', 0,
        'data', '{"id":"notify-pm-op","title":"Task Status Updated","message":"Notify Task was moved to In Progress.","route":{"page":"tasks","entityId":"notify-task"},"iconType":"status","targetUserId":"pgtap-notify-pm"}'::jsonb
      )
    )
  ) ->> 'ok')::boolean,
  true,
  'Staff can notify the owning Project Manager of a status update'
);

-- Staff may not notify an arbitrary member.
select is(
  (public.aitask_execute_command(
    'pgtap-notify', gen_random_uuid(), 'task.update',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'notify-task',
        'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-notify' and entity_type = 'task' and entity_id = 'notify-task'),
        'data', '{"id":"notify-task","clientId":"notify-client","clientName":"Notify Co","title":"Notify Task","department":"Designer","assignedTo":"pgtap-notify-staff","createdBy":"pgtap-notify-staff","status":"Pending","visibility":"internal"}'::jsonb
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'notify-other-op',
        'expectedVersion', 0,
        'data', '{"id":"notify-other-op","title":"Task Status Updated","message":"Notify Task was moved.","route":{"page":"tasks","entityId":"notify-task"},"iconType":"status","targetUserId":"pgtap-notify-staff2"}'::jsonb
      )
    )
  ) ->> 'ok')::boolean,
  false,
  'Staff cannot notify an unrelated member'
);

-- Staff may notify the PM who assigned the task even when that PM is not the
-- company owner (the company belongs to Boss here).
select is(
  (public.aitask_execute_command(
    'pgtap-notify', gen_random_uuid(), 'task.update',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'notify-task-assigner',
        'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-notify' and entity_type = 'task' and entity_id = 'notify-task-assigner'),
        'data', '{"id":"notify-task-assigner","clientId":"notify-client-boss","clientName":"Notify Boss Co","title":"Assigned Task","department":"Designer","assignedTo":"pgtap-notify-staff","assignedBy":"pgtap-notify-pm","createdBy":"pgtap-notify-pm","status":"In Progress","visibility":"internal"}'::jsonb
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'notify-assigner-op',
        'expectedVersion', 0,
        'data', '{"id":"notify-assigner-op","title":"Task Status Updated","message":"Assigned Task was moved to In Progress.","route":{"page":"tasks","entityId":"notify-task-assigner"},"iconType":"status","targetUserId":"pgtap-notify-pm"}'::jsonb
      )
    )
  ) ->> 'ok')::boolean,
  true,
  'Staff can notify the assigning PM when another member owns the company'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
