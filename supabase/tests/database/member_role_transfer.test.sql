begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000991', 'authenticated', 'authenticated', 'pgtap-transfer-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000992', 'authenticated', 'authenticated', 'pgtap-transfer-target@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-role-transfer', 'Member role transfer workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin, permissions
) values
  ('pgtap-transfer-boss', 'pgtap-role-transfer', '00000000-0000-0000-0000-000000000991', 'Boss', 'pgtap-transfer-boss@aitask.local', 'Project Manager', 'Management', array['Management'], true, '{}'::jsonb),
  ('pgtap-transfer-target', 'pgtap-role-transfer', '00000000-0000-0000-0000-000000000992', 'Former HOD', 'pgtap-transfer-target@aitask.local', 'HOD', 'Designer', array['Designer'], false, '{}'::jsonb);

-- The editable default Project Manager template. manageAssignedClients is not a
-- Project Manager default, so it proves permission resolution uses the template.
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values ('pgtap-role-transfer', 'custom_role', 'builtin-project-manager', jsonb_build_object(
  'id', 'builtin-project-manager', 'name', 'Project Manager', 'baseRole', 'Project Manager',
  'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
  'permissions', jsonb_build_object(
    'viewDashboard', true, 'createTasks', true, 'createProjects', true,
    'createClients', true, 'manageServiceCatalog', true, 'manageAssignedClients', true,
    'viewAllClients', false, 'viewApprovals', false, 'editTasks', false
  )
));

-- Before transfer the member is department-scoped HOD.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000992', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_role_is_department_scoped('pgtap-role-transfer'), true, 'HOD is department scoped before the transfer');
select is(private.aitask_has_permission('pgtap-role-transfer', 'createProjects'), false, 'HOD cannot create projects before the transfer');
select is(private.aitask_has_permission('pgtap-role-transfer', 'manageAssignedClients'), false, 'HOD has no manage-assigned-clients before the transfer');
reset role;

-- Boss promotes the former HOD to Project Manager.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000991', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(
  (public.aitask_update_member_role(
    'pgtap-role-transfer', gen_random_uuid(), 'pgtap-transfer-target',
    'Project Manager', null, null, array[]::text[],
    (select version from public.aitask_members where workspace_id = 'pgtap-role-transfer' and id = 'pgtap-transfer-target')
  ) ->> 'ok')::boolean,
  true,
  'Boss can transfer an HOD to Project Manager'
);
reset role;

select is(
  (select role from public.aitask_members where workspace_id = 'pgtap-role-transfer' and id = 'pgtap-transfer-target'),
  'Project Manager',
  'the member role is persisted as Project Manager'
);
select is(
  (select permissions from public.aitask_members where workspace_id = 'pgtap-role-transfer' and id = 'pgtap-transfer-target'),
  '{}'::jsonb,
  'member permission overrides are reset on transfer'
);
select is(
  (select custom_role_id from public.aitask_members where workspace_id = 'pgtap-role-transfer' and id = 'pgtap-transfer-target'),
  null,
  'any previous custom role is cleared on transfer'
);

-- After transfer the member is a portfolio-scoped Project Manager.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000992', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_role_is_department_scoped('pgtap-role-transfer'), false, 'the transferred member is no longer department scoped');
select is(private.aitask_has_permission('pgtap-role-transfer', 'createProjects'), true, 'the transferred member can create projects');
select is(private.aitask_has_permission('pgtap-role-transfer', 'manageAssignedClients'), true, 'the transferred member inherits the Project Manager template');
select is(private.aitask_has_permission('pgtap-role-transfer', 'viewAllClients'), false, 'the transferred member stays portfolio-scoped for clients');
select is(private.aitask_has_permission('pgtap-role-transfer', 'viewApprovals'), false, 'protected Boss Koo approvals stay unavailable');
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
