begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_column('public', 'aitask_workspaces', 'version', 'workspaces expose an invalidation revision');
select has_column('public', 'aitask_workspaces', 'updated_at', 'workspace revision has a server timestamp');
select has_column('public', 'aitask_members', 'version', 'members use optimistic concurrency');
select has_column('public', 'aitask_entities', 'version', 'entities use optimistic concurrency');
select has_table('public', 'aitask_command_receipts', 'idempotent command receipts exist');
select has_table('public', 'aitask_audit_events', 'immutable audit events exist');
select has_function(
  'public',
  'aitask_execute_command',
  array['text', 'uuid', 'text', 'jsonb'],
  'transactional command RPC exists'
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
  not has_function_privilege('anon', 'public.aitask_execute_command(text,uuid,text,jsonb)', 'EXECUTE'),
  'anonymous users cannot execute commands'
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
  array['mfa admins can read audit events'],
  'audit events expose only the MFA admin read policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_command_receipts'),
  0,
  'command receipts are not exposed by a browser policy'
);

select * from finish();
rollback;
