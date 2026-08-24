begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select has_function(
  'private',
  'aitask_can_mutate_entity',
  array['text', 'text', 'text', 'text', 'text', 'jsonb', 'jsonb'],
  'entity mutation guard exists'
);

select ok(
  position(
    'unreadByUserIds' in pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure)
  ) > 0,
  'notification guard tolerates the client unread tombstone field'
);

select ok(
  position(
    'v_new_reads = (v_old_reads - v_member_id)' in pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure)
  ) > 0,
  'notification guard allows the acting member to mark unread'
);

select ok(
  not has_function_privilege('public', 'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)', 'EXECUTE'),
  'mutation guard is not executable by public'
);

select is(
  (select prosecdef from pg_proc where oid = 'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure),
  true,
  'mutation guard runs as security definer'
);

select finish();

rollback;
