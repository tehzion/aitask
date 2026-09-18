begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000917', 'authenticated', 'authenticated', 'pgtap-boss-owner@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000918', 'authenticated', 'authenticated', 'pgtap-pm-one@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000919', 'authenticated', 'authenticated', 'pgtap-pm-two@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000920', 'authenticated', 'authenticated', 'pgtap-pm-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-pm-ownership', 'Project Manager ownership test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-boss-owner', 'pgtap-pm-ownership', '00000000-0000-0000-0000-000000000917', 'Boss Owner', 'pgtap-boss-owner@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-pm-one', 'pgtap-pm-ownership', '00000000-0000-0000-0000-000000000918', 'PM One', 'pgtap-pm-one@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-pm-two', 'pgtap-pm-ownership', '00000000-0000-0000-0000-000000000919', 'PM Two', 'pgtap-pm-two@aitask.local', 'Admin', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-pm-staff', 'pgtap-pm-ownership', '00000000-0000-0000-0000-000000000920', 'PM Staff', 'pgtap-pm-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-pm-ownership', 'client', 'pm1-client', '{"id":"pm1-client","clientName":"PM One Co","createdBy":"pgtap-pm-one"}'::jsonb),
  ('pgtap-pm-ownership', 'project', 'pm1-project', '{"id":"pm1-project","clientName":"PM One Co","projectName":"PM One Launch","createdBy":"pgtap-pm-one"}'::jsonb),
  ('pgtap-pm-ownership', 'task', 'pm1-task', '{"id":"pm1-task","clientName":"PM One Co","projectId":"pm1-project","createdBy":"pgtap-pm-one","assignedTo":"pgtap-pm-staff"}'::jsonb);

-- Project Manager One sees only their own portfolio.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000918', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_can_view_client('pgtap-pm-ownership', 'pm one co'), true, 'PM One can view the company they created');
select is(private.aitask_can_view_project('pgtap-pm-ownership', 'pm1-project'), true, 'PM One can view the project they created');
select is(private.aitask_can_view_task('pgtap-pm-ownership', 'pm1-task'), true, 'PM One can view the task they created');

reset role;

-- Project Manager Two is scoped out of PM One's portfolio.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000919', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_can_view_client('pgtap-pm-ownership', 'pm one co'), false, 'PM Two cannot view another PM''s company');
select is(private.aitask_can_view_project('pgtap-pm-ownership', 'pm1-project'), false, 'PM Two cannot view another PM''s project');
select is(private.aitask_can_view_task('pgtap-pm-ownership', 'pm1-task'), false, 'PM Two cannot view another PM''s task');
select is(private.aitask_has_permission('pgtap-pm-ownership', 'viewAllClients'), false, 'Admin defaults no longer grant View all clients');

reset role;

-- Boss Koo keeps full visibility.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000917', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_can_view_client('pgtap-pm-ownership', 'pm one co'), true, 'Boss can view any company');
select is(private.aitask_can_view_project('pgtap-pm-ownership', 'pm1-project'), true, 'Boss can view any project');
select is(private.aitask_can_view_task('pgtap-pm-ownership', 'pm1-task'), true, 'Boss can view any task');

reset role;

-- PM Two cannot delete PM One's company through the command path.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000919', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-pm-ownership', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'pm1-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-ownership' and entity_type = 'client' and entity_id = 'pm1-client')
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM Two cannot delete another PM''s company'
);

reset role;

-- Service workspace scoping.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000918', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_access_service_client('pgtap-pm-ownership', 'pm1-client'), true, 'PM One can open their own service client workspace');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000919', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_access_service_client('pgtap-pm-ownership', 'pm1-client'), false, 'PM Two cannot open another PM''s service client workspace');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000917', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_access_service_client('pgtap-pm-ownership', 'pm1-client'), true, 'Boss can open any service client workspace');
reset role;

-- PM One can rename their own company (authorization must use the old key).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000918', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(
  (public.aitask_execute_command(
    'pgtap-pm-ownership', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'client', 'entityId', 'pm1-client',
      'data', '{"id":"pm1-client","clientName":"PM One Co Renamed","createdBy":"pgtap-pm-one"}'::jsonb,
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-ownership' and entity_type = 'client' and entity_id = 'pm1-client')
    ))
  ) ->> 'ok')::boolean,
  true,
  'PM One can rename their own company'
);
reset role;

-- PM Two cannot rename PM One's company.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000919', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(
  (public.aitask_execute_command(
    'pgtap-pm-ownership', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'client', 'entityId', 'pm1-client',
      'data', '{"id":"pm1-client","clientName":"Hijacked Co","createdBy":"pgtap-pm-two"}'::jsonb,
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-pm-ownership' and entity_type = 'client' and entity_id = 'pm1-client')
    ))
  ) ->> 'ok')::boolean,
  false,
  'PM Two cannot rename another PM''s company'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;