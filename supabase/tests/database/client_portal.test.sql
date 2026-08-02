begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_function(
  'public',
  'aitask_read_client_portal',
  array['text'],
  'Client portal projection RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_read_client_portal(text)'::regprocedure),
  true,
  'Client portal RPC is security definer'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_read_client_portal(text)'::regprocedure),
  true,
  'Client portal RPC has a fixed empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_read_client_portal(text)', 'EXECUTE'),
  'authenticated users can reach the membership-guarded portal RPC'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_read_client_portal(text)', 'EXECUTE'),
  'anonymous users cannot execute the portal RPC'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_00_merge_client_approval_task',
  'Client review writes use a canonical merge trigger'
);
select is(
  (select tgenabled::text from pg_trigger
   where tgrelid = 'public.aitask_entities'::regclass
     and tgname = 'aitask_00_merge_client_approval_task'
     and not tgisinternal),
  'O',
  'Client approval merge trigger is enabled'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.aitask_merge_client_approval_task()'::regprocedure),
  true,
  'Client approval merge function has a fixed empty search path'
);
select ok(
  not has_function_privilege('authenticated', 'private.aitask_client_task_projection(jsonb)', 'EXECUTE'),
  'private task projection helper is not browser-callable'
);
select ok(
  not has_function_privilege('authenticated', 'private.aitask_client_project_projection(jsonb)', 'EXECUTE'),
  'private project projection helper is not browser-callable'
);
select ok(
  not has_function_privilege('authenticated', 'private.aitask_client_profile_projection(jsonb)', 'EXECUTE'),
  'private profile projection helper is not browser-callable'
);
select is(
  private.aitask_client_task_projection('{"id":"T1","title":"Visible","notes":"secret","priority":"Urgent","department":"Management"}'::jsonb),
  '{"id":"T1","title":"Visible"}'::jsonb,
  'task projection allowlists fields instead of subtracting known secrets'
);
select is(
  private.aitask_client_profile_projection('{"id":"C1","clientName":"Acme","contactPerson":"Alex","notes":"internal"}'::jsonb),
  '{"id":"C1","clientName":"Acme","contactPerson":"Alex"}'::jsonb,
  'client profile projection excludes administrative notes'
);
select ok(
  position('old.data || jsonb_build_object' in pg_get_functiondef('private.aitask_merge_client_approval_task()'::regprocedure)) > 0,
  'Client approval writes merge into the canonical task instead of replacing it'
);
select ok(
  position('completedAt' in pg_get_functiondef('private.aitask_client_command_allowed(text,text,jsonb)'::regprocedure)) > 0,
  'Client approval validation supports the server-owned completion timestamp field'
);
select ok(
  position('member.role = ''Client''' in pg_get_functiondef('public.aitask_read_client_portal(text)'::regprocedure)) > 0,
  'Client portal RPC explicitly requires a Client member'
);

select * from finish();
rollback;
