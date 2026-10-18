begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table('public', 'aitask_tutorial_feedback', 'tutorial feedback has isolated storage');
select has_column('public', 'aitask_tutorial_feedback', 'tutorial_id', 'feedback is keyed by tutorial');
select has_column('public', 'aitask_tutorial_feedback', 'auth_user_id', 'feedback is keyed by authenticated user');
select has_column('public', 'aitask_tutorial_feedback', 'helpful', 'feedback records the yes or no signal');
select has_index('public', 'aitask_tutorial_feedback', 'aitask_tutorial_feedback_tutorial_idx', 'feedback can be reviewed by tutorial without exposing rows');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.aitask_tutorial_feedback'::regclass),
  'tutorial feedback has RLS enabled'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_tutorial_feedback'),
  3,
  'tutorial feedback has select, insert, and update policies'
);
select ok(
  has_table_privilege('authenticated', 'public.aitask_tutorial_feedback', 'SELECT,INSERT,UPDATE'),
  'authenticated members have only the browser operations needed for their own feedback'
);
select ok(
  not has_table_privilege('anon', 'public.aitask_tutorial_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous callers have no tutorial feedback privileges'
);
select ok(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_tutorial_feedback' and (qual::text like '%auth.uid%' or with_check::text like '%auth.uid%')) = 3,
  'every feedback policy binds rows to the current authenticated user'
);
select ok(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'aitask_tutorial_feedback' and (qual::text like '%aitask_members%' or with_check::text like '%aitask_members%')) = 3,
  'every feedback policy verifies workspace membership'
);
select ok(
  (select count(*)::integer from pg_constraint where conrelid = 'public.aitask_tutorial_feedback'::regclass and contype = 'u' and pg_get_constraintdef(oid) like '%workspace_id, auth_user_id, tutorial_id%') = 1,
  'one feedback row is retained per member, workspace, and tutorial'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000007101', 'authenticated', 'authenticated', 'tutorial-feedback-owner@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000007102', 'authenticated', 'authenticated', 'tutorial-feedback-coworker@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000007103', 'authenticated', 'authenticated', 'tutorial-feedback-outsider@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name) values
  ('pgtap-tutorial-feedback', 'Tutorial feedback test workspace'),
  ('pgtap-tutorial-feedback-other', 'Tutorial feedback outsider workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments
) values
  ('tutorial-feedback-owner', 'pgtap-tutorial-feedback', '00000000-0000-4000-8000-000000007101', 'Feedback owner', 'tutorial-feedback-owner@aitask.local', 'Staff', 'Designer', array['Designer']),
  ('tutorial-feedback-coworker', 'pgtap-tutorial-feedback', '00000000-0000-4000-8000-000000007102', 'Feedback coworker', 'tutorial-feedback-coworker@aitask.local', 'Staff', 'Designer', array['Designer']),
  ('tutorial-feedback-outsider', 'pgtap-tutorial-feedback-other', '00000000-0000-4000-8000-000000007103', 'Feedback outsider', 'tutorial-feedback-outsider@aitask.local', 'Staff', 'Designer', array['Designer']);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000007101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select lives_ok(
  $$insert into public.aitask_tutorial_feedback(workspace_id, tutorial_id, helpful, comment, locale)
    values ('pgtap-tutorial-feedback', 'create-task', true, 'Clear and useful.', 'en')$$,
  'a workspace member can create their own feedback row'
);
select is(
  (select count(*)::integer from public.aitask_tutorial_feedback where workspace_id = 'pgtap-tutorial-feedback' and tutorial_id = 'create-task'),
  1,
  'the author can read their own feedback row'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000007102', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.aitask_tutorial_feedback where workspace_id = 'pgtap-tutorial-feedback' and tutorial_id = 'create-task'),
  0,
  'a different workspace member cannot read the author feedback row'
);
select lives_ok(
  $$insert into public.aitask_tutorial_feedback(workspace_id, tutorial_id, helpful, comment, locale)
    values ('pgtap-tutorial-feedback', 'create-task', false, 'Needs an example.', 'en')$$,
  'a different member can create their own row for the same tutorial'
);
create function pg_temp.attempt_foreign_feedback_update() returns integer language plpgsql as $$
declare
  affected_rows integer;
begin
  update public.aitask_tutorial_feedback
    set comment = 'tampered'
    where workspace_id = 'pgtap-tutorial-feedback'
      and tutorial_id = 'create-task'
      and helpful = true;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;
select is(
  pg_temp.attempt_foreign_feedback_update(),
  0,
  'a different workspace member cannot update the author feedback row'
);
select throws_ok(
  $$insert into public.aitask_tutorial_feedback(workspace_id, auth_user_id, tutorial_id, helpful, comment, locale)
    values ('pgtap-tutorial-feedback', '00000000-0000-4000-8000-000000007101', 'approve-deliverables', true, '', 'en')$$,
  '42501', null,
  'a member cannot impersonate another feedback author'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000007103', true);
set local role authenticated;

select throws_ok(
  $$insert into public.aitask_tutorial_feedback(workspace_id, tutorial_id, helpful, comment, locale)
    values ('pgtap-tutorial-feedback', 'create-task', true, '', 'en')$$,
  '42501', null,
  'a non-member cannot create feedback in another workspace'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
