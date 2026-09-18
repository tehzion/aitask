begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000921', 'authenticated', 'authenticated', 'pgtap-role-admin@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000922', 'authenticated', 'authenticated', 'pgtap-role-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000923', 'authenticated', 'authenticated', 'pgtap-role-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000924', 'authenticated', 'authenticated', 'pgtap-role-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-role-templates', 'Role template test workspace');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-role-templates', 'custom_role', 'builtin-hod',
  jsonb_build_object(
    'id', 'builtin-hod', 'name', 'HOD', 'baseRole', 'HOD',
    'isProtected', false, 'isBuiltin', true, 'departmentScoped', true,
    'permissions', jsonb_build_object('createTasks', true, 'manageCreatedTasks', true, 'createClients', true, 'deleteClients', true),
    'createdAt', now(), 'updatedAt', now()
  )
);

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin, custom_role_id, permissions
) values
  ('pgtap-role-admin', 'pgtap-role-templates', '00000000-0000-0000-0000-000000000921', 'Project Manager', 'pgtap-role-admin@aitask.local', 'Project Manager', 'Management', array['Management'], false, null, '{}'::jsonb),
  ('pgtap-role-hod', 'pgtap-role-templates', '00000000-0000-0000-0000-000000000922', 'HOD', 'pgtap-role-hod@aitask.local', 'HOD', 'Designer', array['Designer'], false, null, '{}'::jsonb),
  ('pgtap-role-boss', 'pgtap-role-templates', '00000000-0000-0000-0000-000000000923', 'Boss', 'pgtap-role-boss@aitask.local', 'Project Manager', 'Management', array['Management'], true, null, '{}'::jsonb),
  ('pgtap-role-staff', 'pgtap-role-templates', '00000000-0000-0000-0000-000000000924', 'Staff', 'pgtap-role-staff@aitask.local', 'Staff', 'Designer', array['Designer'], false, null, '{}'::jsonb);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-role-templates', 'task', 'pgtap-design-task', '{"id":"pgtap-design-task","title":"Design work","department":"Designer","assignedTo":"pgtap-role-staff","createdBy":"pgtap-role-staff","visibility":"internal"}'::jsonb),
  ('pgtap-role-templates', 'task', 'pgtap-video-task', '{"id":"pgtap-video-task","title":"Video work","department":"Video Editor","assignedTo":"pgtap-role-staff","createdBy":"pgtap-role-staff","visibility":"internal"}'::jsonb);

-- Project Managers remain portfolio-scoped and cannot access Boss-Koo-only Approvals.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000921', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(private.aitask_has_permission('pgtap-role-templates', 'viewApprovals'), false, 'Project Manager cannot access Approvals');
select is(private.aitask_has_permission('pgtap-role-templates', 'createClients'), true, 'Project Manager can add companies server-side');

-- HOD is department-scoped for task visibility and editing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000922', true);
select is(private.aitask_can_view_task('pgtap-role-templates', 'pgtap-design-task'), true, 'HOD can view a task in their department');
select is(private.aitask_can_view_task('pgtap-role-templates', 'pgtap-video-task'), false, 'HOD cannot view a task in another department');
select is(private.aitask_can_edit_task('pgtap-role-templates', 'pgtap-design-task'), true, 'HOD can edit a task in their department');

-- Boss Koo can persist a member override that includes createClients.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000923', true);
select is(
  public.aitask_update_member_permissions(
    'pgtap-role-templates', gen_random_uuid(), 'pgtap-role-staff',
    jsonb_build_object('viewTasks', true, 'createClients', true),
    (select version from public.aitask_members where workspace_id = 'pgtap-role-templates' and id = 'pgtap-role-staff')
  ) -> 'member' -> 'permissions' ->> 'createClients',
  'true',
  'Boss Koo can persist a createClients member override'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
