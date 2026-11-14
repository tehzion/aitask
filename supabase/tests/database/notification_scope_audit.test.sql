begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.aitask_workspaces(id, name, reminder_timezone)
values ('pgtap-notif-scope', 'Notification scope', 'UTC');
insert into public.aitask_members(id, workspace_id, name, email, role, department, departments, permissions)
values
  ('pm-removed', 'pgtap-notif-scope', 'Removed PM', 'pm-removed@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'),
  ('pm-current', 'pgtap-notif-scope', 'Current PM', 'pm-current@aitask.local', 'Project Manager', 'Management', array['Management'], '{}');
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  ('pgtap-notif-scope', 'project', 'proj-1', '{"id":"proj-1","clientName":"Co","projectManagerIds":["pm-current"],"createdBy":"pm-removed"}'),
  ('pgtap-notif-scope', 'task', 'task-1', jsonb_build_object('id','task-1','projectId','proj-1','clientName','Co','title','Due soon','status','In Progress','isCompleted',false,'createdBy','pm-current','assignedBy','pm-current','dueDate',to_char(now() at time zone 'UTC','YYYY-MM-DD')));

select throws_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
    ('pgtap-notif-scope','notification','n-client-role','{"id":"n-client-role","targetRole":"Client","title":"x","message":"x"}')$$,
  '23514', 'Notifications cannot target the Client role.',
  'no actor can broadcast to the Client role');
select lives_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
    ('pgtap-notif-scope','notification','n-pm-role','{"id":"n-pm-role","targetRole":"Project Manager","title":"x","message":"x"}')$$,
  'internal role audiences remain allowed');

select private.aitask_generate_due_task_reminders('pgtap-notif-scope', now());
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-notif-scope' and entity_type='notification' and data->>'title'='Task Deadline Approaching' and data->>'targetUserId'='pm-removed'), 0,
  'a PM removed from the project assignment list gets no reminder');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-notif-scope' and entity_type='notification' and data->>'title'='Task Deadline Approaching' and data->>'targetUserId'='pm-current'), 1,
  'the currently assigned PM still receives the reminder');

select * from finish();
rollback;
