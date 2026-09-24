begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000981', 'authenticated', 'authenticated', 'pgtap-default-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000982', 'authenticated', 'authenticated', 'pgtap-default-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000983', 'authenticated', 'authenticated', 'pgtap-default-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-editable-defaults', 'Editable default roles workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-default-boss', 'pgtap-editable-defaults', '00000000-0000-0000-0000-000000000981', 'Boss', 'pgtap-default-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-default-pm', 'pgtap-editable-defaults', '00000000-0000-0000-0000-000000000982', 'PM', 'pgtap-default-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-default-staff', 'pgtap-editable-defaults', '00000000-0000-0000-0000-000000000983', 'Staff', 'pgtap-default-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-editable-defaults', 'custom_role', 'builtin-project-manager', jsonb_build_object(
    'id', 'builtin-project-manager', 'name', 'Project Manager', 'baseRole', 'Project Manager',
    'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
    'permissions', jsonb_build_object('viewDashboard', true, 'createTasks', true, 'viewAllTasks', false)
  )),
  ('pgtap-editable-defaults', 'custom_role', 'builtin-staff', jsonb_build_object(
    'id', 'builtin-staff', 'name', 'Staff', 'baseRole', 'Staff',
    'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
    'permissions', jsonb_build_object('viewDashboard', true, 'createTasks', true, 'viewAllTasks', false)
  ));

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000983', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(private.aitask_has_permission('pgtap-editable-defaults', 'createTasks'), true, 'Staff inherits createTasks from the built-in Staff template');
select is(private.aitask_has_permission('pgtap-editable-defaults', 'viewAllTasks'), false, 'Staff template keeps viewAllTasks off');
reset role;

-- Boss edits the built-in Staff template to add viewAllTasks.
update public.aitask_entities
set data = jsonb_set(data, '{permissions}', (data -> 'permissions') || jsonb_build_object('viewAllTasks', true))
where workspace_id = 'pgtap-editable-defaults' and entity_type = 'custom_role' and entity_id = 'builtin-staff';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000983', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_has_permission('pgtap-editable-defaults', 'viewAllTasks'), true, 'Editing the Staff template updates Staff permissions');
reset role;

-- The template identity is immutable.
select throws_ok($$
  update public.aitask_entities
  set data = jsonb_set(data, '{name}', '"Renamed"')
  where workspace_id = 'pgtap-editable-defaults' and entity_type = 'custom_role' and entity_id = 'builtin-staff'
$$, '23514', null, 'Renaming a built-in role template is rejected');

select throws_ok($$
  update public.aitask_entities
  set data = jsonb_set(data, '{baseRole}', '"Project Manager"')
  where workspace_id = 'pgtap-editable-defaults' and entity_type = 'custom_role' and entity_id = 'builtin-staff'
$$, '23514', null, 'Changing a built-in role base is rejected');

select lives_ok($$
  update public.aitask_entities
  set data = jsonb_set(data, '{permissions}', (data -> 'permissions') || jsonb_build_object('viewAllTasks', true))
  where workspace_id = 'pgtap-editable-defaults' and entity_type = 'custom_role' and entity_id = 'builtin-project-manager'
$$, 'A project-manager template permission update is allowed');

select throws_ok($$
  delete from public.aitask_entities
  where workspace_id = 'pgtap-editable-defaults' and entity_type = 'custom_role' and entity_id = 'builtin-staff'
$$, '23514', null, 'Deleting a built-in role template is rejected');

-- A custom role overrides the base-role template.
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values ('pgtap-editable-defaults', 'custom_role', 'custom-staff-limited', jsonb_build_object(
  'id', 'custom-staff-limited', 'name', 'Limited Staff', 'baseRole', 'Staff',
  'departmentScoped', false, 'isProtected', false, 'isBuiltin', false,
  'permissions', jsonb_build_object('viewDashboard', true, 'createTasks', false)
));

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
reset role;

update public.aitask_members
set custom_role_id = 'custom-staff-limited'
where workspace_id = 'pgtap-editable-defaults' and id = 'pgtap-default-staff';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000983', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_has_permission('pgtap-editable-defaults', 'createTasks'), false, 'A custom role overrides the base-role template');
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
