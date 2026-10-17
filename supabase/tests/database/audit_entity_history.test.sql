-- Run after all migrations with pgTAP enabled.
begin;
select plan(21);

select has_table(
  'public', 'aitask_entity_history',
  'immutable before/after entity history table exists'
);

select has_column('public', 'aitask_entity_history', 'before_data', 'history stores the previous value');
select has_column('public', 'aitask_entity_history', 'after_data', 'history stores the committed value');
select has_column('public', 'aitask_entity_history', 'actor_member_id', 'history stores the actor');
select has_column('public', 'aitask_entity_history', 'actor_snapshot', 'history retains the actor identity after account deletion');
select has_column('public', 'aitask_entity_history', 'command_id', 'history can correlate to a command receipt');
select has_column('public', 'aitask_entity_history', 'changed_fields', 'history stores changed field names');

select has_function(
  'private', 'aitask_capture_entity_history',
  ARRAY[]::text[],
  'entity history trigger function exists'
);
select has_function(
  'private', 'aitask_capture_member_history',
  ARRAY[]::text[],
  'member history trigger function exists'
);

select ok(
  has_table_privilege('authenticated', 'public.aitask_entity_history', 'SELECT')
  and not has_table_privilege('authenticated', 'public.aitask_entity_history', 'INSERT')
  and not has_table_privilege('authenticated', 'public.aitask_entity_history', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.aitask_entity_history', 'DELETE'),
  'authenticated users can read only through the MFA super-admin RLS policy'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.aitask_entities'::regclass
      and tgname = 'aitask_capture_entity_history'
  ),
  'entity mutations are captured by a database trigger'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.aitask_members'::regclass
      and tgname = 'aitask_capture_member_history'
  ),
  'member mutations are captured by a database trigger'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.aitask_entity_history'::regclass
      and tgname = 'aitask_guard_entity_history_immutable'
  ),
  'history rows have an immutability guard'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.aitask_entity_history'::regclass
      and contype = 'f'
      and confrelid = 'public.aitask_workspaces'::regclass
      and confdeltype = 'r'
  ),
  'workspace deletion is restricted while immutable history exists'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.aitask_entity_history'::regclass
      and contype = 'f'
      and confrelid = 'public.aitask_members'::regclass
  ),
  'member history keeps the stable actor id without a mutating foreign-key action'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.aitask_entity_history'::regclass
      and contype = 'f'
      and confdeltype in ('c', 'n')
  ),
  'history has no cascading or nulling delete action'
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-history-retention', 'History Retention');

insert into public.aitask_entity_history(
  id, workspace_id, entity_type, entity_id, action,
  actor_snapshot, before_data, after_data
) values (
  '00000000-0000-4000-8000-000000009999',
  'pgtap-history-retention', 'task', 'retained-task', 'insert',
  '{"name":"Retained Actor"}'::jsonb,
  null, '{"status":"Draft"}'::jsonb
);

select is(
  (select count(*) from public.aitask_entity_history where workspace_id = 'pgtap-history-retention'),
  1::bigint,
  'history rows can be written by the trusted database test role'
);

select throws_ok(
  $$delete from public.aitask_workspaces where id = 'pgtap-history-retention'$$,
  '23503',
  null,
  'workspace cleanup is blocked instead of deleting immutable history'
);

insert into public.aitask_members(
  id, workspace_id, name, email, role, department, departments
) values (
  'pgtap-history-member', 'pgtap-history-retention', 'Retained Member',
  'retained-member@example.test', 'Staff', 'Operation', array['Operation']
);

insert into public.aitask_entity_history(
  workspace_id, entity_type, entity_id, action, actor_member_id,
  actor_snapshot, before_data, after_data
) values (
  'pgtap-history-retention', 'member', 'pgtap-history-member', 'delete',
  'pgtap-history-member', '{"name":"Retained Member"}'::jsonb,
  '{"name":"Retained Member"}'::jsonb, null
);

delete from public.aitask_members where id = 'pgtap-history-member';

select ok(
  exists (
    select 1
    from public.aitask_entity_history
    where workspace_id = 'pgtap-history-retention'
      and actor_member_id = 'pgtap-history-member'
      and actor_snapshot ->> 'name' = 'Retained Member'
  ),
  'member deletion leaves the historical actor id and snapshot intact'
);

select throws_ok(
  $$update public.aitask_entity_history
    set after_data = '{"status":"Tampered"}'::jsonb
    where id = '00000000-0000-4000-8000-000000009999'$$,
  'P0001',
  'Entity history is append-only',
  'history updates are rejected by the immutability trigger'
);

select throws_ok(
  $$delete from public.aitask_entity_history
    where id = '00000000-0000-4000-8000-000000009999'$$,
  'P0001',
  'Entity history is append-only',
  'history deletes are rejected by the immutability trigger'
);

select * from finish();
rollback;
