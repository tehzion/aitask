begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000008101', 'authenticated', 'authenticated', 'smoke-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000008102', 'authenticated', 'authenticated', 'smoke-hod@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000008103', 'authenticated', 'authenticated', 'smoke-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.aitask_workspaces(id, name) values ('pgtap-smoke', 'Smoke');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin) values
  ('smoke-pm', 'pgtap-smoke', '00000000-0000-0000-0000-000000008101', 'Smoke PM', 'smoke-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('smoke-hod', 'pgtap-smoke', '00000000-0000-0000-0000-000000008102', 'Smoke HOD', 'smoke-hod@aitask.local', 'HOD', 'Designer', array['Designer'], '{}'::jsonb, false),
  ('smoke-staff', 'pgtap-smoke', '00000000-0000-0000-0000-000000008103', 'Smoke Staff', 'smoke-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);

select is(private.aitask_run_role_flow_smoke('pgtap-smoke'), true, 'the smoke walk-through passes on a healthy workspace');
select is((select detail from private.aitask_smoke_runs where workspace_id = 'pgtap-smoke' order by id desc limit 1), 'PASS', 'the run is recorded as PASS');
select is((select count(*)::integer from public.aitask_entities where workspace_id = 'pgtap-smoke' and entity_id like 'zz-smoke%'), 0, 'the walk-through leaves no data behind');
select is(private.aitask_run_role_flow_smoke('pgtap-empty-workspace'), true, 'a workspace without the three roles is skipped, not failed');
select ok(exists (select 1 from cron.job where jobname = 'aitask-weekly-role-flow-smoke'), 'the weekly job is scheduled');

select * from finish();
rollback;
