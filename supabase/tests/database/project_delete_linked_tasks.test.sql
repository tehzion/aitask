begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001401', 'authenticated', 'authenticated', 'pgtap-delete-pm@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001402', 'authenticated', 'authenticated', 'pgtap-delete-hod@aitask.local', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001403', 'authenticated', 'authenticated', 'pgtap-delete-staff@aitask.local', '', now(), '{}', '{}', now(), now());

insert into public.aitask_workspaces(id, name) values ('pgtap-project-delete', 'Project delete');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions) values
  ('delete-pm', 'pgtap-project-delete', '00000000-0000-0000-0000-000000001401', 'Delete PM', 'pgtap-delete-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'),
  ('delete-hod', 'pgtap-project-delete', '00000000-0000-0000-0000-000000001402', 'Delete HOD', 'pgtap-delete-hod@aitask.local', 'HOD', 'Video Editor', array['Video Editor'], '{"createProjects":true}'),
  ('delete-staff', 'pgtap-project-delete', '00000000-0000-0000-0000-000000001403', 'Delete Staff', 'pgtap-delete-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data) values
  ('pgtap-project-delete', 'project', 'pm-project', null, jsonb_build_object('id', 'pm-project', 'projectName', 'PM project', 'clientName', 'Delete Co', 'createdBy', 'delete-pm', 'projectManagerIds', jsonb_build_array('delete-pm'))),
  ('pgtap-project-delete', 'task', 'pm-task', 'pm-project', jsonb_build_object('id', 'pm-task', 'title', 'PM task', 'projectId', 'pm-project', 'projectName', 'PM project', 'clientName', 'Delete Co', 'serviceType', 'Design', 'department', 'Designer', 'assignedTo', 'delete-staff', 'createdBy', 'delete-pm', 'status', 'Pending', 'priority', 'Medium', 'startDate', '2026-11-01', 'visibility', 'internal')),
  ('pgtap-project-delete', 'project', 'hod-project', null, jsonb_build_object('id', 'hod-project', 'projectName', 'HOD project', 'clientName', 'Delete Co', 'createdBy', 'delete-hod', 'projectManagerIds', '[]'::jsonb)),
  ('pgtap-project-delete', 'task', 'hidden-task', 'hod-project', jsonb_build_object('id', 'hidden-task', 'title', 'Hidden task', 'projectId', 'hod-project', 'projectName', 'HOD project', 'clientName', 'Delete Co', 'serviceType', 'Design', 'department', 'Designer', 'assignedTo', 'delete-staff', 'createdBy', 'delete-pm', 'status', 'Pending', 'priority', 'Medium', 'startDate', '2026-11-01', 'visibility', 'internal')),
  ('pgtap-project-delete', 'project', 'empty-project', null, jsonb_build_object('id', 'empty-project', 'projectName', 'Empty project', 'clientName', 'Delete Co', 'createdBy', 'delete-hod', 'projectManagerIds', '[]'::jsonb));

create function pg_temp.delete_ops(p_project text, p_tasks text[]) returns jsonb language sql as $$
  select coalesce((select jsonb_agg(jsonb_build_object('kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', task.entity_id,
      'expectedVersion', task.version, 'data', task.data - 'projectId' - 'projectName'))
    from public.aitask_entities task
    where task.workspace_id = 'pgtap-project-delete' and task.entity_type = 'task' and task.entity_id = any(p_tasks)), '[]'::jsonb)
  || jsonb_build_array(jsonb_build_object('kind', 'entity', 'action', 'delete', 'entityType', 'project', 'entityId', p_project,
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_type = 'project' and entity_id = p_project)));
$$;

select set_config('pgtap.pm_ops', pg_temp.delete_ops('pm-project', array['pm-task'])::text, true);
select set_config('pgtap.hod_ops', pg_temp.delete_ops('hod-project', array[]::text[])::text, true);
select set_config('pgtap.empty_ops', pg_temp.delete_ops('empty-project', array[]::text[])::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001401', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is((public.aitask_execute_command('pgtap-project-delete', gen_random_uuid(), 'project.delete', current_setting('pgtap.pm_ops')::jsonb) ->> 'ok')::boolean, true,
  'A PM who unlinks every task in the same command can delete the project');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_id = 'pm-project'), 0, 'The PM project is deleted');
select is((select data ->> 'projectId' from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_id = 'pm-task'), null, 'Its task is kept and unlinked');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001402', true);
set local role authenticated;
select is(public.aitask_execute_command('pgtap-project-delete', gen_random_uuid(), 'project.delete', current_setting('pgtap.hod_ops')::jsonb) ->> 'code', 'VALIDATION',
  'A creator cannot delete a project that still links a task they did not unlink');
select is((public.aitask_execute_command('pgtap-project-delete', gen_random_uuid(), 'project.delete', current_setting('pgtap.empty_ops')::jsonb) ->> 'ok')::boolean, true,
  'A creator can still delete a project with no tasks');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_id = 'hod-project'), 1, 'The project with a hidden task is kept');
select is((select data ->> 'projectId' from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_id = 'hidden-task'), 'hod-project', 'The hidden task keeps its project');

select set_config('request.jwt.claim.sub', '', true);
select lives_ok($$delete from public.aitask_entities where workspace_id = 'pgtap-project-delete' and entity_id = 'hod-project'$$,
  'Deletes without a signed-in member are not blocked');

select * from finish();
rollback;
