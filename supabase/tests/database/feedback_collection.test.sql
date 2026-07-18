begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_table('public', 'aitask_feedback_submissions', 'feedback submissions use isolated storage');
select has_column('public', 'aitask_feedback_submissions', 'answers', 'feedback answers are stored as structured JSON');
select has_column('public', 'aitask_feedback_submissions', 'is_late', 'late responses are identified');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.aitask_feedback_submissions'::regclass),
  'feedback submissions have RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.aitask_feedback_submissions', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous callers have no direct feedback table privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_feedback_submissions', 'SELECT,INSERT,UPDATE,DELETE'),
  'signed-in users have no direct feedback table privileges'
);
select ok(
  has_table_privilege('service_role', 'public.aitask_feedback_submissions', 'SELECT,INSERT'),
  'the feedback Edge Function can collect and review responses'
);
select has_index(
  'public',
  'aitask_feedback_submissions',
  'aitask_feedback_campaign_email_uidx',
  'one feedback response is allowed per campaign and email'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_feedback_submissions'),
  0,
  'feedback data is not exposed through browser RLS policies'
);
select ok(
  not coalesce((select is_super_admin from public.aitask_members where id = 'u-adminmojo'), false),
  'the adminmojo developer member is not a workspace Super Admin'
);

select * from finish();
rollback;
