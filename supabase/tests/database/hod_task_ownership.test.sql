begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

select is(
  (select data -> 'permissions' ->> 'manageCreatedTasks'
   from public.aitask_entities
   where workspace_id = 'aitask-main'
     and entity_type = 'custom_role'
     and entity_id = 'system-hod'),
  'true',
  'the migration provisions the protected HOD role'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000920', 'authenticated', 'authenticated', 'pgtap-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000921', 'authenticated', 'authenticated', 'pgtap-hod-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000922', 'authenticated', 'authenticated', 'pgtap-hod-admin@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000923', 'authenticated', 'authenticated', 'pgtap-hod-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-hod-authorization', 'HOD authorization test workspace');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-hod-authorization', 'custom_role', 'system-hod',
  jsonb_build_object(
    'id', 'system-hod', 'name', 'HOD', 'baseRole', 'Staff', 'isProtected', true,
    'permissions', jsonb_build_object('createTasks', true, 'manageCreatedTasks', true, 'createProjects', true),
    'createdAt', now(), 'updatedAt', now()
  )
);

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  custom_role_id, custom_role_name, is_super_admin
) values
  ('pgtap-hod', 'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000920', 'HOD Actor', 'pgtap-hod@aitask.local', 'Staff', 'Designer', array['Designer'], 'system-hod', 'HOD', false),
  ('pgtap-hod-staff', 'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000921', 'Assigned Staff', 'pgtap-hod-staff@aitask.local', 'Staff', 'Designer', array['Designer'], null, null, false),
  ('pgtap-hod-admin', 'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000922', 'Scoped Admin', 'pgtap-hod-admin@aitask.local', 'Admin', 'Management', array['Management'], null, null, false),
  ('pgtap-hod-boss', 'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000923', 'Boss Koo', 'pgtap-hod-boss@aitask.local', 'Admin', 'Management', array['Management'], null, null, true);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-hod-authorization', 'client', 'pgtap-hod-client', '{"id":"pgtap-hod-client","clientName":"HOD Test Client"}'::jsonb),
  ('pgtap-hod-authorization', 'client', 'pgtap-hidden-client', '{"id":"pgtap-hidden-client","clientName":"Hidden Client"}'::jsonb),
  ('pgtap-hod-authorization', 'project', 'pgtap-hod-hidden-staff-project', '{"id":"pgtap-hod-hidden-staff-project","clientId":"pgtap-hod-client","clientName":"HOD Test Client","projectName":"Hidden Staff Project","createdBy":"pgtap-hod-staff","services":["Design"],"startDate":"2026-09-10"}'::jsonb),
  ('pgtap-hod-authorization', 'task', 'pgtap-hod-created', '{"id":"pgtap-hod-created","title":"HOD created task","clientName":"HOD Test Client","department":"Designer","assignedTo":"pgtap-hod-staff","createdBy":"pgtap-hod","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-hod-authorization', 'task', 'pgtap-hod-assigned', '{"id":"pgtap-hod-assigned","title":"HOD assigned task","clientName":"HOD Test Client","department":"Designer","assignedTo":"pgtap-hod","createdBy":"pgtap-hod-staff","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-hod-authorization', 'task', 'pgtap-hod-unrelated', '{"id":"pgtap-hod-unrelated","title":"Unrelated task","clientName":"HOD Test Client","department":"Designer","assignedTo":"pgtap-hod-staff","createdBy":"pgtap-hod-staff","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-hod-authorization', 'task', 'pgtap-hod-admin-created', '{"id":"pgtap-hod-admin-created","title":"Admin created task","clientName":"HOD Test Client","department":"Designer","assignedTo":"pgtap-hod-staff","createdBy":"pgtap-hod-admin","status":"Pending","visibility":"internal"}'::jsonb),
  ('pgtap-hod-authorization', 'task', 'pgtap-hod-staff-task', '{"id":"pgtap-hod-staff-task","title":"Staff task","clientName":"HOD Test Client","department":"Designer","assignedTo":"pgtap-hod-staff","createdBy":"pgtap-hod-admin","status":"Pending","visibility":"internal"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000920', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'project.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'project', 'entityId', 'pgtap-hod-visible-project',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-visible-project', 'clientId', 'pgtap-hod-client', 'clientName', 'HOD Test Client',
        'projectName', 'Visible HOD Project', 'services', jsonb_build_array('Design'),
        'startDate', '2026-09-10', 'deadline', '', 'createdBy', 'pgtap-hod'
      )
    ))
  ) ->> 'ok')::boolean,
  true,
  'HOD can create a project for a visible client when granted project creation'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'project.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'project', 'entityId', 'pgtap-hod-hidden-project',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-hidden-project', 'clientId', 'pgtap-hidden-client', 'clientName', 'Hidden Client',
        'projectName', 'Hidden HOD Project', 'services', jsonb_build_array('Design'),
        'startDate', '2026-09-10', 'deadline', '', 'createdBy', 'pgtap-hod'
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot create a project for a hidden client'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'project.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'project', 'entityId', 'pgtap-hod-missing-project',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-missing-project', 'clientId', 'does-not-exist', 'clientName', 'HOD Test Client',
        'projectName', 'Missing HOD Project', 'services', jsonb_build_array('Design'),
        'startDate', '2026-09-10', 'deadline', '', 'createdBy', 'pgtap-hod'
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot create a project for a nonexistent client record'
);

select ok(private.aitask_can_view_task('pgtap-hod-authorization', 'pgtap-hod-created'), 'HOD can view a task they created');
select ok(private.aitask_can_view_task('pgtap-hod-authorization', 'pgtap-hod-assigned'), 'HOD can view a task assigned to them');
select ok(not private.aitask_can_view_task('pgtap-hod-authorization', 'pgtap-hod-unrelated'), 'HOD cannot view an unrelated task');
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-created'), 'HOD can edit a created task after reassignment');
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-assigned'), 'HOD can edit an assigned task');
select ok(not private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-unrelated'), 'HOD cannot edit an unrelated task');

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-hod-created',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created'),
      'data', (select data || jsonb_build_object('status', 'In Progress', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created')
    ))
  ) ->> 'ok')::boolean,
  true,
  'HOD can update a created task after it is assigned to another staff member'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-hod-unrelated',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-unrelated'),
      'data', (select data || jsonb_build_object('status', 'In Progress', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-unrelated')
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot update an unrelated task through the command API'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-hod-created',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created'),
      'data', (select data || jsonb_build_object('createdBy', 'pgtap-hod-staff', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created')
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot claim ownership by changing createdBy'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-hod-created',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created'),
      'data', (select data || jsonb_build_object('department', 'Management', 'assignedTo', 'pgtap-hod-admin', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'task' and entity_id = 'pgtap-hod-created')
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot move a created task into a department they do not belong to'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000921', true);
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-assigned') = false, 'ordinary Staff cannot edit a task assigned to another member');
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-staff-task'), 'ordinary Staff can edit their assigned task');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000922', true);
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-admin-created'), 'Admin can edit a task they created');
select ok(not private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-unrelated'), 'Admin cannot edit an unrelated task');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
select ok(private.aitask_can_edit_task('pgtap-hod-authorization', 'pgtap-hod-unrelated'), 'Boss Koo retains unrestricted task editing');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000921', true);
select is(
  (public.aitask_update_member_permissions(
    'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000930'::uuid, 'pgtap-hod-staff',
    jsonb_build_object('viewDeliveryTracker', true),
    (select version from public.aitask_members where id = 'pgtap-hod-staff')
  ) ->> 'ok')::boolean,
  false,
  'ordinary Staff cannot change Staff or HOD permissions'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
select is(
  (public.aitask_update_member_permissions(
    'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000931'::uuid, 'pgtap-hod-staff',
    jsonb_build_object('viewDeliveryTracker', true, 'editTasks', true, 'manageUsers', true),
    (select version from public.aitask_members where id = 'pgtap-hod-staff')
  ) ->> 'ok')::boolean,
  true,
  'Boss Koo can save a safe Staff permission override'
);
select is(
  (select permissions ->> 'viewDeliveryTracker' from public.aitask_members where id = 'pgtap-hod-staff'),
  'true',
  'the Staff override persists the dedicated task tracker permission'
);
select is(
  (select permissions ->> 'editTasks' from public.aitask_members where id = 'pgtap-hod-staff'),
  'false',
  'protected global task editing remains reserved for Boss Koo'
);
select is(
  (public.aitask_update_member_permissions(
    'pgtap-hod-authorization', '00000000-0000-0000-0000-000000000932'::uuid, 'pgtap-hod-staff',
    null,
    (select version from public.aitask_members where id = 'pgtap-hod-staff')
  ) ->> 'ok')::boolean,
  true,
  'Boss Koo can reset a Staff member to role defaults'
);
select is(
  (select permissions from public.aitask_members where id = 'pgtap-hod-staff'),
  '{}'::jsonb,
  'resetting permissions clears the direct override'
);

select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'role.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'custom_role', 'entityId', 'system-hod',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'custom_role' and entity_id = 'system-hod'),
      'data', (select data || jsonb_build_object('description', 'changed') from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'custom_role' and entity_id = 'system-hod')
    ))
  ) ->> 'ok')::boolean,
  true,
  'Boss Koo can safely update the protected HOD role through generic commands'
);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'role.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'custom_role', 'entityId', 'system-hod',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'custom_role' and entity_id = 'system-hod'),
      'data', (select data || jsonb_build_object('name', 'Not HOD') from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'custom_role' and entity_id = 'system-hod')
    ))
  ) ->> 'ok')::boolean,
  false,
  'the protected HOD identity cannot be renamed'
);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'role.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'custom_role', 'entityId', 'system-hod',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'custom_role' and entity_id = 'system-hod')
    ))
  ) ->> 'ok')::boolean,
  false,
  'the protected HOD role cannot be deleted'
);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'role.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'member', 'entityId', 'pgtap-hod-admin',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'member' and entity_id = 'pgtap-hod-admin'),
      'data', (select data || jsonb_build_object('customRoleId', 'system-hod', 'customRoleName', 'HOD') from public.aitask_entities where workspace_id = 'pgtap-hod-authorization' and entity_type = 'member' and entity_id = 'pgtap-hod-admin')
    ))
  ) ->> 'ok')::boolean,
  false,
  'the HOD role cannot be assigned to an Admin account'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000920', true);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pgtap-hod-own-empty-project-task',
      'parentId', 'pgtap-hod-visible-project', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-own-empty-project-task', 'projectId', 'pgtap-hod-visible-project',
        'clientId', 'pgtap-hod-client', 'clientName', 'HOD Test Client', 'projectName', 'Visible HOD Project',
        'title', 'First project task', 'department', 'Designer', 'assignedTo', 'pgtap-hod',
        'createdBy', 'pgtap-hod', 'serviceType', 'Design', 'startDate', '2026-09-10', 'status', 'Pending'
      )
    ))
  ) ->> 'ok')::boolean,
  true,
  'HOD can link the first task to their own empty project'
);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pgtap-hod-hidden-project-task',
      'parentId', 'pgtap-hod-hidden-staff-project', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-hidden-project-task', 'projectId', 'pgtap-hod-hidden-staff-project',
        'clientId', 'pgtap-hod-client', 'clientName', 'HOD Test Client', 'projectName', 'Hidden Staff Project',
        'title', 'Forged hidden project task', 'department', 'Designer', 'assignedTo', 'pgtap-hod',
        'createdBy', 'pgtap-hod', 'serviceType', 'Design', 'startDate', '2026-09-10', 'status', 'Pending'
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'HOD cannot attach a crafted task to another Staff member’s hidden project'
);
select ok(
  not private.aitask_can_view_project('pgtap-hod-authorization', 'pgtap-hod-hidden-staff-project'),
  'a rejected forged task does not make the hidden project visible'
);
select is(
  (public.aitask_execute_command(
    'pgtap-hod-authorization', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pgtap-hod-mismatched-project-task',
      'parentId', 'pgtap-hod-visible-project', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-hod-mismatched-project-task', 'projectId', 'pgtap-hod-hidden-staff-project',
        'clientId', 'pgtap-hod-client', 'clientName', 'HOD Test Client', 'projectName', 'Visible HOD Project',
        'title', 'Mismatched project task', 'department', 'Designer', 'assignedTo', 'pgtap-hod',
        'createdBy', 'pgtap-hod', 'serviceType', 'Design', 'startDate', '2026-09-10', 'status', 'Pending'
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'task project data and command parent must agree'
);
select is((public.aitask_get_backend_capabilities('pgtap-hod-authorization') ->> 'schemaVersion')::integer, 4, 'the HOD authorization contract requires backend schema version 4');

reset role;
select * from finish();
rollback;
