begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_function(
  'public',
  'aitask_execute_command',
  array['text', 'uuid', 'text', 'jsonb', 'bigint'],
  'workspace-locked command entry point exists'
);

select has_function(
  'public',
  'aitask_execute_service_command',
  array['text', 'uuid', 'text', 'jsonb', 'bigint'],
  'workspace-locked service command entry point exists'
);

select has_function(
  'public',
  'aitask_generate_deliverable_task_chain',
  array['text', 'uuid', 'jsonb', 'bigint'],
  'workspace-locked deliverable chain entry point exists'
);

select has_function(
  'public',
  'aitask_execute_command',
  array['text', 'uuid', 'text', 'jsonb'],
  'legacy command entry point remains for older clients'
);

select has_function(
  'public',
  'aitask_execute_service_command',
  array['text', 'uuid', 'text', 'jsonb'],
  'legacy service command entry point remains for older clients'
);

select ok(
  position(
    'for update' in pg_get_functiondef('public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'command entry point locks the workspace row before checking the expected version'
);

select ok(
  position(
    '''entityType'', ''workspace''' in pg_get_functiondef('public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'command entry point returns a workspace-scoped conflict payload'
);

select ok(
  position(
    'for update' in pg_get_functiondef('public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'service command locks the workspace row before checking the expected version'
);

select ok(
  position(
    '''entityType'', ''workspace''' in pg_get_functiondef('public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'service command returns a workspace-scoped conflict payload'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure),
  true,
  'workspace-locked command runs as security definer'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure),
  true,
  'workspace-locked service command runs as security definer'
);

select finish();

rollback;
