begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-000000009901', 'authenticated', 'authenticated', 'pgtap-reminder-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009902', '00000000-0000-0000-0000-000000009902', 'authenticated', 'authenticated', 'pgtap-reminder-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009903', '00000000-0000-0000-0000-000000009903', 'authenticated', 'authenticated', 'pgtap-reminder-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009904', '00000000-0000-0000-0000-000000009904', 'authenticated', 'authenticated', 'pgtap-reminder-client@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000009905', '00000000-0000-0000-0000-000000009905', 'authenticated', 'authenticated', 'pgtap-reminder-late-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name, reminder_timezone)
values ('pgtap-server-reminders', 'Server reminder test workspace', 'America/Los_Angeles');

select is(
  (select reminder_timezone from public.aitask_workspaces where id = 'pgtap-server-reminders'),
  'America/Los_Angeles',
  'workspaces retain their configured reminder timezone'
);
select ok(
  not exists (select 1 from public.aitask_workspaces where id = 'pgtap-default-timezone'),
  'the default timezone test starts with a new workspace'
);
insert into public.aitask_workspaces(id, name)
values ('pgtap-default-timezone', 'Default timezone test workspace');
select is(
  (select reminder_timezone from public.aitask_workspaces where id = 'pgtap-default-timezone'),
  'Asia/Kuala_Lumpur',
  'new workspaces default to Asia/Kuala_Lumpur'
);

insert into public.aitask_workspaces(id, name, reminder_timezone)
values ('pgtap-reminder-no-recipient', 'Reminder recipient race test workspace', 'America/Los_Angeles');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-reminder-no-recipient', 'task', 'pgtap-reminder-late-recipient', jsonb_build_object(
    'id', 'pgtap-reminder-late-recipient', 'title', 'Late recipient deadline',
    -- A staff member becomes eligible because this task is assigned to them;
    -- unrelated staff must not receive another member's reminders.
    'assignedTo', 'pgtap-reminder-late-staff', 'department', 'Designer',
    'clientName', 'Unstaffed Client', 'dueDate', '2026-09-28', 'status', 'Pending', 'isCompleted', false
  )
);

select is(
  private.aitask_generate_due_task_reminders('pgtap-reminder-no-recipient', '2026-09-28T06:30:00Z'::timestamptz),
  0,
  'a task with no eligible internal recipient is not claimed'
);
select is(
  (select count(*)::integer from public.aitask_task_deadline_reminders where workspace_id = 'pgtap-reminder-no-recipient'),
  0,
  'a task without recipients has no reminder ledger entry'
);

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  is_super_admin, client_name, permissions
) values (
  'pgtap-reminder-late-staff', 'pgtap-reminder-no-recipient', '00000000-0000-0000-0000-000000009905',
  'Late Reminder Staff', 'pgtap-reminder-late-staff@aitask.local', 'Staff', 'Designer', array['Designer'], false, null, '{}'::jsonb
);

select is(
  private.aitask_generate_due_task_reminders('pgtap-reminder-no-recipient', '2026-09-28T06:30:00Z'::timestamptz),
  1,
  'adding an eligible recipient later allows the reminder to be generated'
);
select is(
  (select count(*)::integer from public.aitask_task_deadline_reminders where workspace_id = 'pgtap-reminder-no-recipient'),
  1,
  'the reminder is claimed only when a recipient is available'
);
select is(
  (select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-reminder-no-recipient' and entity_type = 'notification'),
  1,
  'the newly eligible recipient receives the previously unclaimed reminder'
);

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  is_super_admin, client_name, permissions
) values
  ('pgtap-reminder-boss', 'pgtap-server-reminders', '00000000-0000-0000-0000-000000009901', 'Reminder Boss', 'pgtap-reminder-boss@aitask.local', 'Project Manager', 'Management', array['Management'], true, null, '{}'::jsonb),
  ('pgtap-reminder-pm', 'pgtap-server-reminders', '00000000-0000-0000-0000-000000009902', 'Reminder PM', 'pgtap-reminder-pm@aitask.local', 'Project Manager', 'Management', array['Management'], false, null, '{}'::jsonb),
  ('pgtap-reminder-staff', 'pgtap-server-reminders', '00000000-0000-0000-0000-000000009903', 'Reminder Staff', 'pgtap-reminder-staff@aitask.local', 'Staff', 'Designer', array['Designer'], false, null, '{}'::jsonb),
  ('pgtap-reminder-client', 'pgtap-server-reminders', '00000000-0000-0000-0000-000000009904', 'Reminder Client', 'pgtap-reminder-client@aitask.local', 'Client', 'Client', array['Client'], false, 'Reminder Client Co', '{}'::jsonb);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-server-reminders', 'client', 'pgtap-reminder-client-entity', '{"id":"pgtap-reminder-client-entity","clientName":"Reminder Client Co","createdBy":"pgtap-reminder-pm"}'::jsonb),
  ('pgtap-server-reminders', 'project', 'pgtap-reminder-project', '{"id":"pgtap-reminder-project","clientId":"pgtap-reminder-client-entity","clientName":"Reminder Client Co","projectName":"Reminder Project","createdBy":"pgtap-reminder-pm"}'::jsonb),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-assigned', jsonb_build_object(
    'id', 'pgtap-reminder-assigned', 'title', 'Assigned deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'assignedTo', 'pgtap-reminder-staff',
    'createdBy', 'pgtap-reminder-pm', 'dueDate', '2026-09-28', 'status', 'Pending', 'isCompleted', false
  )),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-unassigned', jsonb_build_object(
    'id', 'pgtap-reminder-unassigned', 'title', 'Unassigned deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'createdBy', 'pgtap-reminder-pm',
    'dueDate', '2026-09-28', 'status', 'Pending', 'isCompleted', false
  )),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-completed', jsonb_build_object(
    'id', 'pgtap-reminder-completed', 'title', 'Completed deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'createdBy', 'pgtap-reminder-pm',
    'dueDate', '2026-09-28', 'status', 'Completed', 'isCompleted', true
  )),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-cancelled', jsonb_build_object(
    'id', 'pgtap-reminder-cancelled', 'title', 'Cancelled deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'createdBy', 'pgtap-reminder-pm',
    'dueDate', '2026-09-28', 'status', 'Cancelled', 'isCompleted', false
  )),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-invalid', jsonb_build_object(
    'id', 'pgtap-reminder-invalid', 'title', 'Invalid deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'createdBy', 'pgtap-reminder-pm',
    'dueDate', '2026-02-31', 'status', 'Pending', 'isCompleted', false
  )),
  ('pgtap-server-reminders', 'task', 'pgtap-reminder-future', jsonb_build_object(
    'id', 'pgtap-reminder-future', 'title', 'Future deadline', 'clientName', 'Reminder Client Co',
    'projectId', 'pgtap-reminder-project', 'createdBy', 'pgtap-reminder-pm',
    -- The generation timestamps below are 23:30 in America/Los_Angeles.
    -- Keep this two local dates away on the second run so it remains out of window.
    'dueDate', '2026-09-30', 'status', 'Pending', 'isCompleted', false
  ));

select is(
  private.aitask_generate_due_task_reminders('pgtap-server-reminders', '2026-09-28T06:30:00Z'::timestamptz),
  5,
  'the local timezone makes 28 September a valid reminder day and creates only valid recipients'
);
select is(
  (select count(*)::integer from public.aitask_task_deadline_reminders where workspace_id = 'pgtap-server-reminders'),
  2,
  'the first run claims the assigned and unassigned task deadlines'
);
select is(
  (select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-server-reminders' and entity_type = 'notification'),
  5,
  'the first run notifies the assignee, owning Project Manager, and Super Admin without client notifications'
);
select is(
  (select count(*)::integer
   from public.aitask_entities notification
   where notification.workspace_id = 'pgtap-server-reminders'
     and notification.entity_type = 'notification'
     and coalesce(notification.data ->> 'targetUserId', '') = ''),
  0,
  'unassigned tasks never create a blank notification audience'
);
select is(
  (select count(*)::integer
   from public.aitask_entities notification
   join public.aitask_members recipient
     on recipient.workspace_id = notification.workspace_id
    and recipient.id = notification.data ->> 'targetUserId'
   where notification.workspace_id = 'pgtap-server-reminders'
     and notification.entity_type = 'notification'
     and recipient.role <> 'Client'
     and notification.data ->> 'category' = 'deadline'
     and notification.data ->> 'importance' = 'action'),
  5,
  'reminders preserve deadline metadata and use valid internal recipients'
);
select is(
  private.aitask_generate_due_task_reminders('pgtap-server-reminders', '2026-09-28T06:30:00Z'::timestamptz),
  0,
  'repeating a reminder run is idempotent'
);
select is(
  (select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-server-reminders' and entity_type = 'notification'),
  5,
  'repeating a reminder run does not duplicate notifications'
);

update public.aitask_entities
set data = jsonb_set(data, '{dueDate}', '"2026-09-29"'::jsonb), version = version + 1
where workspace_id = 'pgtap-server-reminders'
  and entity_type = 'task'
  and entity_id = 'pgtap-reminder-assigned';

select is(
  private.aitask_generate_due_task_reminders('pgtap-server-reminders', '2026-09-29T06:30:00Z'::timestamptz),
  3,
  'rescheduling a task to a new due date creates a fresh reminder window'
);
select is(
  (select count(*)::integer from public.aitask_task_deadline_reminders where workspace_id = 'pgtap-server-reminders'),
  3,
  'the rescheduled date receives its own idempotency ledger entry'
);
select is(
  (select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-server-reminders' and entity_type = 'notification'),
  8,
  'the rescheduled task creates a new set of recipient notifications'
);
select is(
  (select count(*)::integer
   from public.aitask_entities
   where workspace_id = 'pgtap-server-reminders'
     and entity_type = 'notification'
     and parent_id in ('pgtap-reminder-completed', 'pgtap-reminder-cancelled', 'pgtap-reminder-invalid', 'pgtap-reminder-future')),
  0,
  'completed, cancelled, invalid, and out-of-window tasks are excluded'
);

select is(
  (public.aitask_consume_feedback_rate_limit(repeat('a', 64), 2, 60) ->> 'allowed')::boolean,
  true,
  'the first feedback request is allowed'
);
select is(
  (public.aitask_consume_feedback_rate_limit(repeat('a', 64), 2, 60) ->> 'remaining')::integer,
  0,
  'the feedback limiter reports the remaining atomic capacity'
);
select is(
  (public.aitask_consume_feedback_rate_limit(repeat('a', 64), 2, 60) ->> 'allowed')::boolean,
  false,
  'the feedback limiter blocks the request at the configured limit'
);
select ok(
  (public.aitask_consume_feedback_rate_limit(repeat('a', 64), 2, 60) ->> 'retryAfterSeconds')::integer > 0,
  'blocked feedback requests receive a retry interval'
);
select is(
  (select attempt_count from public.aitask_feedback_rate_limits where key_hash = repeat('a', 64)),
  2,
  'blocked feedback requests do not increment the atomic counter'
);
select ok(not has_table_privilege('anon', 'public.aitask_feedback_rate_limits', 'select'),
  'anonymous users cannot read feedback limiter rows');
select ok(not has_function_privilege('anon', 'public.aitask_consume_feedback_rate_limit(text,integer,integer)', 'execute'),
  'anonymous users cannot execute the feedback limiter RPC');
select ok(has_function_privilege('service_role', 'public.aitask_consume_feedback_rate_limit(text,integer,integer)', 'execute'),
  'service_role can execute the feedback limiter RPC');
select is(
  (select count(*)::integer from cron.job where jobname in (
    'aitask-task-deadline-reminders',
    'aitask-task-deadline-reminder-cleanup',
    'aitask-feedback-rate-limit-cleanup'
  )),
  3,
  'server reminder, ledger cleanup, and rate-limit cleanup cron jobs are registered'
);

select * from finish();
rollback;
