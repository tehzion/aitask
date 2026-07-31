begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

select has_column('public', 'aitask_workspaces', 'version', 'workspaces expose an invalidation revision');
select has_column('public', 'aitask_workspaces', 'updated_at', 'workspace revision has a server timestamp');
select has_column('public', 'aitask_members', 'version', 'members use optimistic concurrency');
select has_column('public', 'aitask_members', 'departments', 'members support equal multi-department membership');
select has_column('public', 'aitask_entities', 'version', 'entities use optimistic concurrency');
select has_table('public', 'aitask_command_receipts', 'idempotent command receipts exist');
select has_table('public', 'aitask_audit_events', 'immutable audit events exist');
select has_function(
  'public',
  'aitask_execute_command',
  array['text', 'uuid', 'text', 'jsonb'],
  'transactional command RPC exists'
);
select has_function(
  'public',
  'aitask_update_member_departments',
  array['text', 'uuid', 'text', 'text[]', 'bigint'],
  'department updates use a versioned transactional RPC'
);
select has_function(
  'private',
  'aitask_is_super_admin',
  array['text'],
  'Super Admin authorization is distinct from the Admin business role'
);
select has_function(
  'private',
  'aitask_create_staff_registration',
  array[]::text[],
  'Staff signup creates a registration through a protected trigger function'
);
select has_trigger(
  'auth',
  'users',
  'aitask_create_staff_registration',
  'Auth users have the Staff registration trigger'
);
select is(
  (
    select tgenabled::text
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'aitask_create_staff_registration'
      and not tgisinternal
  ),
  'O',
  'Staff registration trigger is enabled'
);
select has_function(
  'private',
  'aitask_enforce_task_completed_at',
  array[]::text[],
  'task completion timestamps use a database trigger function'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_enforce_task_completed_at',
  'task entities enforce completion timestamps before writes'
);
select is(
  (
    select tgenabled::text
    from pg_trigger
    where tgrelid = 'public.aitask_entities'::regclass
      and tgname = 'aitask_enforce_task_completed_at'
      and not tgisinternal
  ),
  'O',
  'task completion timestamp trigger is enabled'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.aitask_enforce_task_completed_at()'::regprocedure),
  true,
  'completion timestamp trigger function has a fixed empty search path'
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-completion-workspace', 'pgTAP completion workspace');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-completion-workspace',
  'task',
  'pgtap-completion-task',
  '{"id":"pgtap-completion-task","status":"Completed","isCompleted":true,"completedAt":"2000-01-01T00:00:00.000Z"}'::jsonb
);

select ok(
  (select (data ->> 'completedAt')::timestamptz > now() - interval '1 minute'
   from public.aitask_entities
   where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task'),
  'entering Completed replaces a forged timestamp with server time'
);

create temporary table pgtap_completion_value(value text) on commit drop;
insert into pgtap_completion_value
select data ->> 'completedAt'
from public.aitask_entities
where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task';

update public.aitask_entities
set data = jsonb_set(
  jsonb_set(data, '{title}', '"Unrelated edit"'::jsonb, true),
  '{completedAt}',
  '"2001-01-01T00:00:00.000Z"'::jsonb,
  true
)
where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task';

select is(
  (select data ->> 'completedAt' from public.aitask_entities
   where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task'),
  (select value from pgtap_completion_value),
  'unrelated edits preserve the original server completion time'
);

update public.aitask_entities
set data = jsonb_set(jsonb_set(data, '{status}', '"In Progress"'::jsonb), '{isCompleted}', 'false'::jsonb)
where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task';

select ok(
  not (select data ? 'completedAt' from public.aitask_entities
       where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task'),
  'reopening a task clears its completion timestamp'
);

update public.aitask_entities
set data = jsonb_set(jsonb_set(data, '{status}', '"Completed"'::jsonb), '{isCompleted}', 'true'::jsonb)
where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task';

select isnt(
  (select data ->> 'completedAt' from public.aitask_entities
   where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-completion-task'),
  (select value from pgtap_completion_value),
  'completing a reopened task records a new timestamp'
);

alter table public.aitask_entities disable trigger aitask_enforce_task_completed_at;
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-completion-workspace',
  'task',
  'pgtap-historical-task',
  '{"id":"pgtap-historical-task","status":"Completed","isCompleted":true}'::jsonb
);
alter table public.aitask_entities enable trigger aitask_enforce_task_completed_at;

update public.aitask_entities
set data = jsonb_set(data, '{title}', '"Historical edit"'::jsonb, true)
where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-historical-task';

select ok(
  not (select data ? 'completedAt' from public.aitask_entities
       where workspace_id = 'pgtap-completion-workspace' and entity_id = 'pgtap-historical-task'),
  'historical completed tasks remain undated during unrelated edits'
);
select ok(
  position(
    'when member.is_super_admin then true'
    in pg_get_functiondef('private.aitask_has_permission(text,text)'::regprocedure)
  ) > 0,
  'Super Admin receives every effective database permission'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_execute_command(text,uuid,text,jsonb)'::regprocedure),
  true,
  'command RPC is security definer'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_execute_command(text,uuid,text,jsonb)'::regprocedure),
  true,
  'command RPC has a fixed empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_execute_command(text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users can execute commands'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_update_member_departments(text,uuid,text,text[],bigint)', 'EXECUTE'),
  'authenticated sessions can reach the Super Admin-guarded department RPC'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_update_member_departments(text,uuid,text,text[],bigint)', 'EXECUTE'),
  'anonymous users cannot update member departments'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_execute_command(text,uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot execute commands'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_execute_command_legacy(text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users cannot bypass the command authorization wrapper'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_delete_member_account(text,text)', 'EXECUTE'),
  'member account deletion is service-role only'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_finalize_member_invitation(text,uuid,text,text,text,text,text,text,text,text,text)', 'EXECUTE'),
  'authenticated users cannot finalize member invitations directly'
);
select ok(
  has_function_privilege('service_role', 'public.aitask_finalize_member_invitation(text,uuid,text,text,text,text,text,text,text,text,text)', 'EXECUTE'),
  'member invitation finalization is service-role only'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_finalize_member_invitation_v2(text,uuid,text,text,text,text[],text,text,text,text,text)', 'EXECUTE'),
  'authenticated users cannot call multi-department invitation finalization'
);
select ok(
  has_function_privilege('service_role', 'public.aitask_finalize_member_invitation_v2(text,uuid,text,text,text,text[],text,text,text,text,text)', 'EXECUTE'),
  'the account Edge Function can finalize multi-department members'
);
select ok(
  position(
    'new.departments is distinct from old.departments'
    in pg_get_functiondef('private.aitask_guard_member_security()'::regprocedure)
  ) > 0,
  'self-service member updates cannot change departments'
);
select ok(
  position(
    'v_actor_role = ''Staff'''
    in pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure)
  ) > 0,
  'Staff task creation is limited to the actor departments'
);
select ok(
  not exists (
    select 1
    from public.aitask_members member
    where member.departments is distinct from private.aitask_normalize_member_departments(member.role, member.departments)
  ),
  'all stored member departments are canonical and valid'
);
select ok(
  not has_table_privilege('anon', 'public.aitask_members', 'SELECT'),
  'anonymous users cannot read members'
);
select ok(
  not has_table_privilege('anon', 'public.aitask_entities', 'SELECT'),
  'anonymous users cannot read entities'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_members', 'INSERT,UPDATE,DELETE'),
  'direct authenticated member writes are revoked after cutover'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_entities', 'INSERT,UPDATE,DELETE'),
  'direct authenticated entity writes are revoked after cutover'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_audit_events', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate audit events'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.aitask_command_receipts'::regclass),
  'command receipts have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.aitask_audit_events'::regclass),
  'audit events have RLS enabled'
);
select policies_are(
  'public',
  'aitask_audit_events',
  array['super admins can read audit events'],
  'audit events expose only the Super Admin read policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_command_receipts'),
  0,
  'command receipts are not exposed by a browser policy'
);

select * from finish();
rollback;
