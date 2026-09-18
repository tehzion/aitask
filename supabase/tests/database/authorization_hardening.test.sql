begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated', 'pgtap-hardening-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated', 'pgtap-hardening-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated', 'pgtap-hardening-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000001004', 'authenticated', 'authenticated', 'pgtap-hardening-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000001005', 'authenticated', 'authenticated', 'pgtap-hardening-client@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000001006', 'authenticated', 'authenticated', 'pgtap-hardening-sparse@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-authorization-hardening', 'Authorization hardening test workspace');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-authorization-hardening', 'custom_role', 'builtin-hod', jsonb_build_object(
    'id', 'builtin-hod', 'name', 'HOD', 'baseRole', 'HOD', 'isProtected', false, 'isBuiltin', true, 'departmentScoped', true,
    'permissions', jsonb_build_object('createTasks', true, 'manageCreatedTasks', true, 'createClients', true, 'deleteClients', true)
  )),
  ('pgtap-authorization-hardening', 'custom_role', 'sparse-role', jsonb_build_object(
    'id', 'sparse-role', 'name', 'Sparse role', 'baseRole', 'Staff',
    'permissions', jsonb_build_object('manageAssignedClients', true)
  ));

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  is_super_admin, client_name, custom_role_id, permissions
) values
  ('pgtap-hardening-boss', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001001', 'Boss', 'pgtap-hardening-boss@aitask.local', 'Project Manager', 'Management', array['Management'], true, null, null, '{}'::jsonb),
  ('pgtap-hardening-pm', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001002', 'PM', 'pgtap-hardening-pm@aitask.local', 'Project Manager', 'Management', array['Management'], false, null, null, '{}'::jsonb),
  ('pgtap-hardening-hod', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001003', 'HOD', 'pgtap-hardening-hod@aitask.local', 'HOD', 'Designer', array['Designer'], false, null, null, '{}'::jsonb),
  ('pgtap-hardening-staff', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001004', 'Staff', 'pgtap-hardening-staff@aitask.local', 'Staff', 'Designer', array['Designer'], false, null, null, '{}'::jsonb),
  ('pgtap-hardening-client', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001005', 'Client', 'pgtap-hardening-client@aitask.local', 'Client', 'Client', array['Client'], false, 'Staff Co', null, '{}'::jsonb),
  ('pgtap-hardening-sparse', 'pgtap-authorization-hardening', '00000000-0000-0000-0000-000000001006', 'Sparse', 'pgtap-hardening-sparse@aitask.local', 'Staff', 'Designer', array['Designer'], false, null, 'sparse-role', '{"viewAllClients":true}'::jsonb);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-authorization-hardening', 'client', 'hardening-pm-client', '{"id":"hardening-pm-client","clientName":"PM Co","createdBy":"pgtap-hardening-pm"}'::jsonb),
  ('pgtap-authorization-hardening', 'project', 'hardening-pm-project', '{"id":"hardening-pm-project","clientId":"hardening-pm-client","clientName":"PM Co","projectName":"PM Project","createdBy":"pgtap-hardening-pm"}'::jsonb),
  ('pgtap-authorization-hardening', 'task', 'hardening-pm-task', '{"id":"hardening-pm-task","clientId":"hardening-pm-client","clientName":"PM Co","projectId":"hardening-pm-project","title":"PM Task","department":"Designer","assignedTo":"pgtap-hardening-staff","createdBy":"pgtap-hardening-pm"}'::jsonb),
  ('pgtap-authorization-hardening', 'comment', 'hardening-pm-comment', '{"id":"hardening-pm-comment","clientId":"hardening-pm-client","clientName":"PM Co","taskId":"hardening-pm-task","userId":"pgtap-hardening-staff","text":"Comment"}'::jsonb),
  ('pgtap-authorization-hardening', 'approval', 'hardening-pm-approval', '{"id":"hardening-pm-approval","clientId":"hardening-pm-client","clientName":"PM Co","taskId":"hardening-pm-task","userId":"pgtap-hardening-staff","status":"Pending"}'::jsonb),
  ('pgtap-authorization-hardening', 'client_plan', 'hardening-pm-plan', '{"id":"hardening-pm-plan","clientId":"hardening-pm-client","clientName":"PM Co","status":"Draft","serviceItems":[]}'::jsonb),
  ('pgtap-authorization-hardening', 'service_cycle', 'hardening-pm-cycle', '{"id":"hardening-pm-cycle","clientId":"hardening-pm-client","clientName":"PM Co","planId":"hardening-pm-plan","periodStart":"2026-09-01","status":"Draft","serviceItems":[]}'::jsonb),
  ('pgtap-authorization-hardening', 'deliverable', 'hardening-pm-deliverable', '{"id":"hardening-pm-deliverable","clientId":"hardening-pm-client","clientName":"PM Co","planId":"hardening-pm-plan","cycleId":"hardening-pm-cycle","status":"Planned","taskIds":[]}'::jsonb),
  ('pgtap-authorization-hardening', 'cycle_comment', 'hardening-pm-cycle-comment', '{"id":"hardening-pm-cycle-comment","clientId":"hardening-pm-client","clientName":"PM Co","cycleId":"hardening-pm-cycle","userId":"pgtap-hardening-staff","text":"Cycle comment"}'::jsonb),
  ('pgtap-authorization-hardening', 'addon', 'hardening-pm-addon', '{"id":"hardening-pm-addon","clientId":"hardening-pm-client","clientName":"PM Co","planId":"hardening-pm-plan","name":"Addon","quantity":1}'::jsonb),
  ('pgtap-authorization-hardening', 'service_pricing_snapshot', 'hardening-pm-price', '{"id":"hardening-pm-price","clientId":"hardening-pm-client","parentType":"client_plan","parentId":"hardening-pm-plan","itemPrices":[]}'::jsonb),
  ('pgtap-authorization-hardening', 'client', 'hardening-hod-client', '{"id":"hardening-hod-client","clientName":"HOD Co","createdBy":"pgtap-hardening-hod"}'::jsonb),
  ('pgtap-authorization-hardening', 'client', 'hardening-staff-client', '{"id":"hardening-staff-client","clientName":"Staff Co","createdBy":"pgtap-hardening-staff"}'::jsonb),
  ('pgtap-authorization-hardening', 'client', 'hardening-keep-client', '{"id":"hardening-keep-client","clientName":"Keep Co","createdBy":"pgtap-hardening-pm"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_has_permission('pgtap-authorization-hardening', 'manageAssignedClients'), true, 'sparse member inherits custom-role permissions');
select is(private.aitask_has_permission('pgtap-authorization-hardening', 'viewAllClients'), true, 'sparse member receives direct permission keys');
select is(private.aitask_has_permission('pgtap-authorization-hardening', 'viewProductionReports'), false, 'protected permissions stay Boss Koo only');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  (public.aitask_update_member_departments(
    'pgtap-authorization-hardening', gen_random_uuid(), 'pgtap-hardening-pm', array[]::text[],
    (select version from public.aitask_members where id = 'pgtap-hardening-pm')
  ) ->> 'ok')::boolean,
  true,
  'Boss Koo can clear Admin departments'
);
select is((select cardinality(departments) from public.aitask_members where id = 'pgtap-hardening-pm'), 0, 'Admin departments may be empty');
select is((select version from public.aitask_members where id = 'pgtap-hardening-pm'), 2::bigint, 'department changes increment member version');
select ok(position('new.departments is distinct from old.departments' in pg_get_functiondef('private.aitask_guard_member_security()'::regprocedure)) > 0, 'member security guard protects departments');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select is(
  (public.aitask_execute_command(
    'pgtap-authorization-hardening', gen_random_uuid(), 'client.delete',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'hardening-pm-client',
      'expectedVersion', (select version from public.aitask_entities where entity_id = 'hardening-pm-client')
    )),
    (select version from public.aitask_workspaces where id = 'pgtap-authorization-hardening')
  ) ->> 'ok')::boolean,
  true,
  'Project Manager can atomically delete an owned company'
);
select is(
  (select count(*)::integer from public.aitask_entities where client_key = 'pm co' or client_id = 'hardening-pm-client' or data ->> 'clientId' = 'hardening-pm-client'),
  0,
  'company deletion removes operational and service children'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select is(
  (public.aitask_execute_command(
    'pgtap-authorization-hardening', gen_random_uuid(), 'client.delete',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'hardening-hod-client',
      'expectedVersion', (select version from public.aitask_entities where entity_id = 'hardening-hod-client')
    )), null
  ) ->> 'ok')::boolean,
  true,
  'HOD can delete a visible company with the delete capability'
);
select is((select count(*)::integer from public.aitask_entities where entity_id = 'hardening-hod-client'), 0, 'HOD company is removed');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select is(
  (public.aitask_execute_command(
    'pgtap-authorization-hardening', gen_random_uuid(), 'client.delete',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'hardening-staff-client',
      'expectedVersion', (select version from public.aitask_entities where entity_id = 'hardening-staff-client')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'ordinary Staff cannot delete a company'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001005', true);
select is(
  (public.aitask_execute_command(
    'pgtap-authorization-hardening', gen_random_uuid(), 'client.delete',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'hardening-staff-client',
      'expectedVersion', (select version from public.aitask_entities where entity_id = 'hardening-staff-client')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'Client cannot delete a company'
);
reset role;
select is((select count(*)::integer from public.aitask_entities where entity_id = 'hardening-keep-client'), 1, 'unrelated companies remain intact');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
