begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

select has_table(
  'public',
  'aitask_release_notice_acknowledgements',
  'release acknowledgements use a dedicated table'
);
select has_column('public', 'aitask_release_notice_acknowledgements', 'workspace_id', 'acknowledgements are workspace-scoped');
select has_column('public', 'aitask_release_notice_acknowledgements', 'member_id', 'acknowledgements are member-scoped');
select has_column('public', 'aitask_release_notice_acknowledgements', 'notice_id', 'acknowledgements are versioned by notice ID');
select has_column('public', 'aitask_release_notice_acknowledgements', 'acknowledged_at', 'acknowledgements retain their timestamp');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.aitask_release_notice_acknowledgements'::regclass),
  'acknowledgements have RLS enabled'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_release_notice_acknowledgements'),
  0,
  'acknowledgements have no direct browser-table policies'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_release_notice_acknowledgements', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated users cannot read or mutate acknowledgement rows directly'
);
select ok(
  has_table_privilege('service_role', 'public.aitask_release_notice_acknowledgements', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role retains maintenance access to acknowledgement rows'
);

select has_function(
  'public',
  'aitask_get_release_notice_acknowledgement',
  array['text', 'text'],
  'release acknowledgement status RPC exists'
);
select has_function(
  'public',
  'aitask_acknowledge_release_notice',
  array['text', 'text'],
  'release acknowledgement write RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_get_release_notice_acknowledgement(text,text)'::regprocedure),
  true,
  'status RPC uses a guarded security definer'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_acknowledge_release_notice(text,text)'::regprocedure),
  true,
  'write RPC uses a guarded security definer'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_get_release_notice_acknowledgement(text,text)'::regprocedure)
  and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_acknowledge_release_notice(text,text)'::regprocedure),
  'acknowledgement RPCs have an empty fixed search path'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_get_release_notice_acknowledgement(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.aitask_acknowledge_release_notice(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_get_release_notice_acknowledgement(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_acknowledge_release_notice(text,text)', 'EXECUTE'),
  'only authenticated users can reach acknowledgement RPCs'
);
select is(
  (public.aitask_get_release_notice_acknowledgement('aitask-main', '2026-08-service-operations') ->> 'code'),
  'FORBIDDEN',
  'status RPC rejects requests without an authenticated member'
);
select ok(
  position('p_member_id' in pg_get_functiondef('public.aitask_acknowledge_release_notice(text,text)'::regprocedure)) = 0
  and position('private.aitask_member_id(p_workspace_id)' in pg_get_functiondef('public.aitask_acknowledge_release_notice(text,text)'::regprocedure)) > 0,
  'write RPC derives the member from the authenticated workspace session'
);

select has_function(
  'public',
  'aitask_get_backend_capabilities',
  array['text'],
  'backend compatibility RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_get_backend_capabilities(text)'::regprocedure),
  true,
  'backend compatibility RPC uses a guarded security definer'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_get_backend_capabilities(text)'::regprocedure),
  'backend compatibility RPC has an empty fixed search path'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_get_backend_capabilities(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.aitask_get_backend_capabilities(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_get_backend_capabilities(text)', 'EXECUTE'),
  'only authenticated and service callers can reach backend capabilities'
);
select is(
  (public.aitask_get_backend_capabilities('aitask-main') ->> 'code'),
  'FORBIDDEN',
  'backend compatibility RPC rejects unauthenticated requests'
);
select ok(
  position('private.aitask_member_id(p_workspace_id)' in pg_get_functiondef('public.aitask_get_backend_capabilities(text)'::regprocedure)) > 0,
  'backend compatibility RPC derives workspace membership from auth.uid()'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000902',
  'authenticated',
  'authenticated',
  'pgtap-capabilities@aitask.local',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-capability-workspace', 'Capability test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments
) values (
  'pgtap-capability-member',
  'pgtap-capability-workspace',
  '00000000-0000-0000-0000-000000000902',
  'Capability member',
  'pgtap-capabilities@aitask.local',
  'Staff',
  'Designer',
  array['Designer']
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_get_backend_capabilities('pgtap-capability-workspace') ->> 'ok')::boolean,
  true,
  'an authenticated member can validate their own workspace backend'
);
select is(
  public.aitask_get_backend_capabilities('aitask-main') ->> 'code',
  'FORBIDDEN',
  'an authenticated member cannot validate another workspace backend'
);

reset role;

select * from finish();
rollback;
