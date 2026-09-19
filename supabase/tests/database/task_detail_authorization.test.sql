begin;
select plan(25);

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001101', 'authenticated', 'authenticated', 'pgtap-task-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001102', 'authenticated', 'authenticated', 'pgtap-task-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001103', 'authenticated', 'authenticated', 'pgtap-task-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001104', 'authenticated', 'authenticated', 'pgtap-task-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001105', 'authenticated', 'authenticated', 'pgtap-task-other@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-task-detail-auth', 'Task detail authorization workspace');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-task-detail-auth', 'custom_role', 'builtin-hod', jsonb_build_object(
    'id', 'builtin-hod', 'name', 'HOD', 'baseRole', 'HOD',
    'isBuiltin', true, 'isProtected', false, 'departmentScoped', true,
    'permissions', jsonb_build_object(
      'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true,
      'viewProjects', true, 'viewDeliveryTracker', true, 'viewReports', true,
      'viewSettings', true, 'createTasks', true, 'manageCreatedTasks', true,
      'viewAssignedServiceClients', true
    )
  )),
  ('pgtap-task-detail-auth', 'client', 'task-owned-client', jsonb_build_object(
    'id', 'task-owned-client', 'clientName', 'PM Owned Co', 'createdBy', 'pgtap-task-pm'
  )),
  ('pgtap-task-detail-auth', 'client', 'task-other-client', jsonb_build_object(
    'id', 'task-other-client', 'clientName', 'Other Co', 'createdBy', 'pgtap-task-other'
  )),
  ('pgtap-task-detail-auth', 'project', 'task-owned-project', jsonb_build_object(
    'id', 'task-owned-project', 'clientId', 'task-owned-client', 'clientName', 'PM Owned Co',
    'projectName', 'PM Portfolio', 'createdBy', 'pgtap-task-pm'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-pm-portfolio', jsonb_build_object(
    'id', 'task-pm-portfolio', 'title', 'Portfolio-only task', 'clientName', 'PM Owned Co',
    'projectId', 'task-owned-project', 'department', 'Designer',
    'assignedTo', 'pgtap-task-staff', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-pm-assigned', jsonb_build_object(
    'id', 'task-pm-assigned', 'title', 'PM assigned task', 'clientName', 'Other Co',
    'department', 'Management', 'assignedTo', 'pgtap-task-pm', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-pm-created', jsonb_build_object(
    'id', 'task-pm-created', 'title', 'PM created task', 'clientName', 'Other Co',
    'department', 'Management', 'assignedTo', 'pgtap-task-staff', 'createdBy', 'pgtap-task-pm', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-hod-department', jsonb_build_object(
    'id', 'task-hod-department', 'title', 'HOD department task', 'clientName', 'Other Co',
    'department', 'Designer', 'assignedTo', 'pgtap-task-staff', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-hod-other-department', jsonb_build_object(
    'id', 'task-hod-other-department', 'title', 'HOD outside task', 'clientName', 'Other Co',
    'department', 'Video Editor', 'assignedTo', 'pgtap-task-staff', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-staff-assigned', jsonb_build_object(
    'id', 'task-staff-assigned', 'title', 'Assigned staff task', 'clientName', 'Other Co',
    'department', 'Designer', 'assignedTo', 'pgtap-task-staff', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-staff-created', jsonb_build_object(
    'id', 'task-staff-created', 'title', 'Created staff task', 'clientName', 'Other Co',
    'department', 'Designer', 'assignedTo', 'pgtap-task-other', 'createdBy', 'pgtap-task-staff', 'status', 'Pending'
  )),
  ('pgtap-task-detail-auth', 'task', 'task-staff-unrelated', jsonb_build_object(
    'id', 'task-staff-unrelated', 'title', 'Unrelated staff task', 'clientName', 'Other Co',
    'department', 'Designer', 'assignedTo', 'pgtap-task-other', 'createdBy', 'pgtap-task-other', 'status', 'Pending'
  ));

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-task-boss', 'pgtap-task-detail-auth', '00000000-0000-0000-0000-000000001101', 'Boss Koo', 'pgtap-task-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-task-pm', 'pgtap-task-detail-auth', '00000000-0000-0000-0000-000000001102', 'Portfolio PM', 'pgtap-task-pm@aitask.local', 'Project Manager', 'Management', '{}'::text[], '{}'::jsonb, false),
  ('pgtap-task-hod', 'pgtap-task-detail-auth', '00000000-0000-0000-0000-000000001103', 'Design HOD', 'pgtap-task-hod@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-task-staff', 'pgtap-task-detail-auth', '00000000-0000-0000-0000-000000001104', 'Assigned Staff', 'pgtap-task-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('pgtap-task-other', 'pgtap-task-detail-auth', '00000000-0000-0000-0000-000000001105', 'Other Staff', 'pgtap-task-other@aitask.local', 'Staff', 'Video Editor', array['Video Editor'], '{}'::jsonb, false);

-- Exercise the target-aware RLS policies themselves rather than stopping at a
-- table-privilege denial. The grant is transactional and rolls back with this
-- test file.
grant select, insert, update, delete on public.aitask_entities to authenticated;
grant execute on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) to authenticated;

-- Project Manager: portfolio visibility is read-only, while assigned/created
-- work remains fully manageable.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(private.aitask_can_view_task('pgtap-task-detail-auth', 'task-pm-portfolio'), 'PM can view an owned portfolio task');
select ok(not private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-pm-portfolio'), 'PM cannot edit a portfolio-only task');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-pm-assigned'), 'PM can edit an assigned task');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-pm-created'), 'PM can edit a created task');
select ok(private.aitask_can_comment_task('pgtap-task-detail-auth', 'task-pm-assigned'), 'PM can comment on an assigned task');
select ok(not private.aitask_can_view_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'PM cannot view unrelated work');
select ok(not private.aitask_can_comment_task('pgtap-task-detail-auth', 'task-pm-portfolio'), 'PM cannot comment on a read-only portfolio task');

select throws_ok($$
  insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
  values ('pgtap-task-detail-auth', 'comment', 'pm-portfolio-comment', 'task-pm-portfolio',
    jsonb_build_object('id', 'pm-portfolio-comment', 'taskId', 'task-pm-portfolio', 'userId', 'pgtap-task-pm', 'text', 'forbidden'))
$$, '42501', 'new row violates row-level security policy for table "aitask_entities"', 'PM direct comment on a read-only task is rejected');

select lives_ok($$
  update public.aitask_entities
  set data = data || jsonb_build_object('title', 'forbidden')
  where workspace_id = 'pgtap-task-detail-auth' and entity_type = 'task' and entity_id = 'task-pm-portfolio'
$$, 'PM direct update on a read-only task is contained by RLS');
select is(
  (select data ->> 'title' from public.aitask_entities where workspace_id = 'pgtap-task-detail-auth' and entity_type = 'task' and entity_id = 'task-pm-portfolio'),
  'Portfolio-only task',
  'PM direct update on a read-only task changes zero rows'
);
reset role;

-- HOD: department tasks are visible and editable, other departments are not.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001103', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(private.aitask_can_view_task('pgtap-task-detail-auth', 'task-hod-department'), 'HOD can view department work');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-hod-department'), 'HOD can edit department work');
select ok(private.aitask_can_comment_task('pgtap-task-detail-auth', 'task-hod-department'), 'HOD can comment on department work');
select ok(not private.aitask_can_view_task('pgtap-task-detail-auth', 'task-hod-other-department'), 'HOD cannot view another department');
select ok(not private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-hod-other-department'), 'HOD cannot edit another department');
reset role;

-- Staff: assignment/creator scope remains enforced.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(private.aitask_can_view_task('pgtap-task-detail-auth', 'task-staff-assigned'), 'Staff can view assigned work');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-staff-assigned'), 'Staff can edit assigned work');
select ok(private.aitask_can_comment_task('pgtap-task-detail-auth', 'task-staff-assigned'), 'Staff can comment on assigned work');
select ok(private.aitask_can_view_task('pgtap-task-detail-auth', 'task-staff-created'), 'Staff can view created work');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-staff-created'), 'Staff can edit created work');
select ok(not private.aitask_can_view_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'Staff cannot view unrelated work');
select ok(not private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'Staff cannot edit unrelated work');
reset role;

-- Boss Koo is unrestricted even when the stored base role is Project Manager.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select ok(private.aitask_can_view_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'Boss can view every task');
select ok(private.aitask_can_edit_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'Boss can edit every task');
select ok(private.aitask_can_comment_task('pgtap-task-detail-auth', 'task-staff-unrelated'), 'Boss can comment on every task');
reset role;

select * from finish();
rollback;
