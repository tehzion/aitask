begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009301', 'authenticated', 'authenticated', 'dc-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009302', 'authenticated', 'authenticated', 'dc-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009303', 'authenticated', 'authenticated', 'dc-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009304', 'authenticated', 'authenticated', 'dc-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000009305', 'authenticated', 'authenticated', 'dc-client@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.aitask_workspaces(id, name) values ('pgtap-datechange', 'Date change'), ('pgtap-datechange-ok', 'Healthy');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin) values
  ('dc-pm', 'pgtap-datechange', '00000000-0000-0000-0000-000000009301', 'DC PM', 'dc-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('dc-hod', 'pgtap-datechange', '00000000-0000-0000-0000-000000009302', 'DC HOD', 'dc-hod@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('dc-staff', 'pgtap-datechange', '00000000-0000-0000-0000-000000009303', 'DC Staff', 'dc-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('dc-boss', 'pgtap-datechange', '00000000-0000-0000-0000-000000009304', 'DC Boss', 'dc-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('dc-client', 'pgtap-datechange', '00000000-0000-0000-0000-000000009305', 'DC Client', 'dc-client@aitask.local', 'Client', 'Client', array['Client'], '{}'::jsonb, false);

-- 1. The client projection shows why a date moved, and not who moved it.
select is(
  private.aitask_client_task_projection('{"id":"T1","title":"X","dateChange":{"from":"2026-11-20","reason":"Waiting for files","changedAt":"2026-11-19T10:00:00.000Z","changedBy":"dc-pm"}}'::jsonb) -> 'dateChange',
  '{"from":"2026-11-20","reason":"Waiting for files","changedAt":"2026-11-19T10:00:00.000Z"}'::jsonb,
  'the client sees where the date moved from and why, never who moved it');
select ok(private.aitask_client_task_projection('{"id":"T1","title":"X"}'::jsonb) ? 'dateChange' = false, 'a task with no date change shows none');
select is(private.aitask_client_task_projection('{"id":"T1","revisionCount":2,"clientRating":{"stars":4}}'::jsonb) ->> 'revisionCount', '2', 'revision usage is still shown');

-- 2. PM workload totals.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009301', true);
set local role authenticated;
select is(public.aitask_hod_staff_workload('pgtap-datechange', (now() at time zone 'UTC')::date) ->> 'ok', 'true', 'a Project Manager can read the workload totals');
select is(jsonb_array_length(public.aitask_hod_staff_workload('pgtap-datechange', (now() at time zone 'UTC')::date) -> 'members'), 1, 'only staff are listed, with totals and no task details');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009305', true);
select is(public.aitask_hod_staff_workload('pgtap-datechange', (now() at time zone 'UTC')::date) ->> 'code', 'FORBIDDEN', 'a client still cannot read workload totals');
reset role;
-- The smoke test impersonates members through the JWT claims; clear the claim set above so it cannot win.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

-- 3. A failed smoke test notifies the Boss, and a healthy one stays quiet.
select is(private.aitask_run_role_flow_smoke('pgtap-datechange'), true, 'the smoke walk-through passes first');
select is((select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-datechange' and entity_type = 'notification' and entity_id like 'N-smoke-%'), 0, 'a passing run sends no notification');

create function pg_temp.break_smoke() returns trigger language plpgsql as $$
begin
  if new.entity_id = 'zz-smoke-task' and new.data ->> 'status' = 'In Progress' then
    raise exception 'simulated regression';
  end if;
  return new;
end $$;
create trigger aitask_zz_break_smoke before update on public.aitask_entities
  for each row execute function pg_temp.break_smoke();

select is(private.aitask_run_role_flow_smoke('pgtap-datechange'), false, 'a broken role flow fails the smoke test');
select ok(
  (select detail from private.aitask_smoke_runs where workspace_id = 'pgtap-datechange' order by id desc limit 1) like 'FAIL%UNEXPECTED ERROR%simulated regression%',
  'an unexpected error inside the walk-through is recorded as a failure, not mistaken for the planned rollback');
select is(
  (select jsonb_agg(data ->> 'targetUserId' order by entity_id) from public.aitask_entities
    where workspace_id = 'pgtap-datechange' and entity_type = 'notification' and entity_id like 'N-smoke-%'),
  '["dc-boss"]'::jsonb,
  'only the Boss is told');

select * from finish();
rollback;
