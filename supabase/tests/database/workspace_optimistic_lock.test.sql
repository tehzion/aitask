begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

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

select has_function(
  'public',
  'aitask_generate_deliverable_task_chain',
  array['text', 'uuid', 'jsonb'],
  'legacy task-chain entry point remains for older clients'
);

select is(
  (select pronargdefaults::integer from pg_proc where oid = 'public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure),
  0,
  'the five-argument command does not shadow the legacy four-argument overload with a default'
);

select is(
  (select pronargdefaults::integer from pg_proc where oid = 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure),
  0,
  'the five-argument service command does not shadow the legacy four-argument overload with a default'
);

select is(
  (select pronargdefaults::integer from pg_proc where oid = 'public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)'::regprocedure),
  0,
  'the four-argument task-chain command does not shadow the legacy three-argument overload with a default'
);

select ok(
  has_function_privilege('authenticated', 'public.aitask_execute_command(text,uuid,text,jsonb,bigint)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.aitask_execute_command(text,uuid,text,jsonb,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_execute_command(text,uuid,text,jsonb,bigint)', 'EXECUTE'),
  'the workspace-locked command is authenticated/service-only'
);

select ok(
  has_function_privilege('authenticated', 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)', 'EXECUTE'),
  'the workspace-locked service command is authenticated/service-only'
);

select ok(
  has_function_privilege('authenticated', 'public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)', 'EXECUTE'),
  'the workspace-locked task-chain command is authenticated/service-only'
);

select is(
  public.aitask_execute_command('aitask-main', gen_random_uuid(), 'workspace.patch', '[]'::jsonb) ->> 'code',
  'FORBIDDEN',
  'the legacy four-argument workspace command resolves without overload ambiguity'
);

select is(
  public.aitask_execute_command('aitask-main', gen_random_uuid(), 'workspace.patch', '[]'::jsonb, 1) ->> 'code',
  'FORBIDDEN',
  'the five-argument workspace command resolves independently'
);

select is(
  public.aitask_execute_service_command('aitask-main', gen_random_uuid(), 'service_cycle.manage', '[]'::jsonb) ->> 'code',
  'FORBIDDEN',
  'the legacy four-argument service command resolves without overload ambiguity'
);

select is(
  public.aitask_execute_service_command('aitask-main', gen_random_uuid(), 'service_cycle.manage', '[]'::jsonb, 1) ->> 'code',
  'FORBIDDEN',
  'the five-argument service command resolves independently'
);

select is(
  public.aitask_generate_deliverable_task_chain('aitask-main', gen_random_uuid(), '[]'::jsonb) ->> 'code',
  'FORBIDDEN',
  'the legacy three-argument task-chain command resolves without overload ambiguity'
);

select is(
  public.aitask_generate_deliverable_task_chain('aitask-main', gen_random_uuid(), '[]'::jsonb, 1) ->> 'code',
  'FORBIDDEN',
  'the four-argument task-chain command resolves independently'
);

select ok(
  position(
    'aitask_execute_command_with_lock_before_staff_context'
    in pg_get_functiondef('public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0
  and position(
    'for update'
    in pg_get_functiondef('public.aitask_execute_command_with_lock_before_staff_context(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'command entry point delegates to the workspace-lock implementation'
);

select ok(
  position(
    '''entityType'', ''workspace'''
    in pg_get_functiondef('public.aitask_execute_command_with_lock_before_staff_context(text,uuid,text,jsonb,bigint)'::regprocedure)
  ) > 0,
  'delegated command implementation returns a workspace-scoped conflict payload'
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
