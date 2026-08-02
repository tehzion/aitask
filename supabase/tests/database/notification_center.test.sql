begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_function(
  'public',
  'aitask_read_notifications',
  array['text', 'integer', 'timestamp with time zone', 'text', 'boolean', 'text', 'text'],
  'paginated notification feed RPC exists'
);
select has_function(
  'public',
  'aitask_set_notifications_read',
  array['text', 'uuid', 'text[]', 'boolean', 'boolean'],
  'isolated notification read-state RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)'::regprocedure),
  false,
  'notification feed reads run as the caller under RLS'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.aitask_set_notifications_read(text,uuid,text[],boolean,boolean)'::regprocedure),
  true,
  'notification read-state writes use a guarded security definer RPC'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)'::regprocedure),
  true,
  'notification feed RPC has a fixed empty search path'
);
select is(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.aitask_set_notifications_read(text,uuid,text[],boolean,boolean)'::regprocedure),
  true,
  'notification write RPC has a fixed empty search path'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)', 'EXECUTE'),
  'authenticated members can load their notification feed'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_set_notifications_read(text,uuid,text[],boolean,boolean)', 'EXECUTE'),
  'authenticated members can update their own read receipts'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_read_notifications(text,integer,timestamptz,text,boolean,text,text)', 'EXECUTE'),
  'anonymous callers cannot load notifications'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_set_notifications_read(text,uuid,text[],boolean,boolean)', 'EXECUTE'),
  'anonymous callers cannot update notification receipts'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_enrich_new_notification',
  'new notifications receive explicit category metadata'
);
select is(
  (select tgenabled::text from pg_trigger
   where tgrelid = 'public.aitask_entities'::regclass
     and tgname = 'aitask_enrich_new_notification'
     and not tgisinternal),
  'O',
  'notification enrichment trigger is enabled'
);
select has_index(
  'public',
  'aitask_entities',
  'aitask_entities_notification_feed_idx',
  'notification pagination has a supporting index'
);
select is(
  (public.aitask_read_notifications('aitask-main', 50, null, null, false, null, null) ->> 'code'),
  'FORBIDDEN',
  'feed RPC rejects requests without an authenticated member'
);

select * from finish();
rollback;
