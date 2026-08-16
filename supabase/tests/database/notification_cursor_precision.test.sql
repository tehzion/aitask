begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select has_function(
  'public',
  'aitask_read_notifications',
  array['text', 'integer', 'timestamp with time zone', 'text', 'boolean', 'text', 'text'],
  'paginated notification feed RPC exists'
);

select ok(
  position(
    '.US"Z"' in pg_get_functiondef('public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)'::regprocedure)
  ) > 0,
  'feed emits microsecond-precision timestamps for keyset cursors'
);

select ok(
  position(
    '.MS"Z"' in pg_get_functiondef('public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)'::regprocedure)
  ) = 0,
  'millisecond truncation is removed from the feed'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)'::regprocedure),
  false,
  'notification feed reads run as the caller under RLS'
);

select finish();

rollback;
