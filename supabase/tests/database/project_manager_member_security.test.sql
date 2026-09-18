begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000921', 'authenticated', 'authenticated', 'pgtap-sec-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000922', 'authenticated', 'authenticated', 'pgtap-sec-pm1@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000923', 'authenticated', 'authenticated', 'pgtap-sec-pm2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000924', 'authenticated', 'authenticated', 'pgtap-sec-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000925', 'authenticated', 'authenticated', 'pgtap-sec-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-pm-security', 'Project Manager member security test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-sec-boss', 'pgtap-pm-security', '00000000-0000-0000-0000-000000000921', 'Boss', 'pgtap-sec-boss@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-sec-pm-one', 'pgtap-pm-security', '00000000-0000-0000-0000-000000000922', 'PM One', 'pgtap-sec-pm1@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-sec-pm-two', 'pgtap-pm-security', '00000000-0000-0000-0000-000000000923', 'PM Two', 'pgtap-sec-pm2@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-sec-staff', 'pgtap-pm-security', '00000000-0000-0000-0000-000000000924', 'Staff', 'pgtap-sec-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-sec-hod', 'pgtap-pm-security', '00000000-0000-0000-0000-000000000925', 'HOD', 'pgtap-sec-hod@aitask.local', 'Staff', 'Designer', array['Designer'], '{"deleteClients": true}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-pm-security', 'client', 'sec-pm1-client', '{"id":"sec-pm1-client","clientName":"PM One Co","createdBy":"pgtap-sec-pm-one"}'::jsonb),
  ('pgtap-pm-security', 'client', 'sec-pm2-client', '{"id":"sec-pm2-client","clientName":"PM Two Co","createdBy":"pgtap-sec-pm-two"}'::jsonb),
  ('pgtap-pm-security', 'client', 'sec-hod-client', '{"id":"sec-hod-client","clientName":"HOD Co","createdBy":"pgtap-sec-hod"}'::jsonb),
  ('pgtap-pm-security', 'project', 'sec-pm2-project', '{"id":"sec-pm2-project","clientName":"PM Two Co","projectName":"PM Two Launch","createdBy":"pgtap-sec-pm-two"}'::jsonb),
  ('pgtap-pm-security', 'task', 'sec-pm2-task', '{"id":"sec-pm2-task","clientName":"PM Two Co","projectId":"sec-pm2-project","createdBy":"pgtap-sec-pm-two","assignedTo":"pgtap-sec-pm-one"}'::jsonb);

-- Project Manager One cannot manage members through the command path.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000922', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-pm-security', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'member', 'action', 'insert', 'entityType', 'member', 'entityId', 'pgtap-sec-new',
      'data', '{"id":"pgtap-sec-new","name":"New Member","email":"new@aitask.local","role":"Staff","department":"Designer","is_super_admin":false,"must_reset_password":false,"permissions":{}}'::jsonb,
      'expectedVersion', 0
    ))
  ) ->> 'ok')::boolean,
  false,
  'a Project Manager cannot create a member'
);

select is(
  (public.aitask_execute_command(
    'pgtap-pm-security', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'member', 'action', 'update', 'entityType', 'member', 'entityId', 'pgtap-sec-pm-one',
      'data', '{"id":"pgtap-sec-pm-one","name":"PM One","email":"pgtap-sec-pm1@aitask.local","role":"Admin","department":"Management","is_super_admin":true,"must_reset_password":false,"permissions":{}}'::jsonb,
      'expectedVersion', (select version from public.aitask_members where workspace_id = 'pgtap-pm-security' and id = 'pgtap-sec-pm-one')
    ))
  ) ->> 'ok')::boolean,
  false,
  'a Project Manager cannot self-promote to super admin'
);

select is(
  (public.aitask_execute_command(
    'pgtap-pm-security', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'member', 'action', 'delete', 'entityType', 'member', 'entityId', 'pgtap-sec-staff',
      'expectedVersion', (select version from public.aitask_members where workspace_id = 'pgtap-pm-security' and id = 'pgtap-sec-staff')
    ))
  ) ->> 'ok')::boolean,
  false,
  'a Project Manager cannot delete another member'
);

reset role;
select is(
  (select is_super_admin from public.aitask_members where workspace_id = 'pgtap-pm-security' and id = 'pgtap-sec-pm-one'),
  false,
  'the Project Manager is still not a super admin'
);

-- Project visibility follows the portfolio they participate in.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000922', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_view_project('pgtap-pm-security', 'sec-pm2-project'), true, 'a Project Manager can view a project holding their assigned task');
select is(private.aitask_can_view_client('pgtap-pm-security', 'pm two co'), true, 'a Project Manager can view the client of that project');
reset role;

-- HOD company deletion requires view access.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000925', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_view_client('pgtap-pm-security', 'hod co'), true, 'an HOD can view a company they created');
select is(private.aitask_can_view_client('pgtap-pm-security', 'pm one co'), false, 'an HOD cannot view an unrelated company');

select is(
  (public.aitask_execute_command(
    'pgtap-pm-security', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'sec-pm1-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-security' and entity_type = 'client' and entity_id = 'sec-pm1-client')
    ))
  ) ->> 'ok')::boolean,
  false,
  'an HOD cannot delete a company they cannot view'
);

select is(
  (public.aitask_execute_command(
    'pgtap-pm-security', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'sec-hod-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-security' and entity_type = 'client' and entity_id = 'sec-hod-client')
    ))
  ) ->> 'ok')::boolean,
  true,
  'an HOD can delete a company they can view'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
