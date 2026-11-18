begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

-- Two Project Managers each own a company with the same display name. A task
-- must be authorized against the exact company ID, not against the name.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007801', 'authenticated', 'authenticated', 'exact-pm-a@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007802', 'authenticated', 'authenticated', 'exact-pm-b@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name) values ('pgtap-pm-exact-company', 'PM exact company');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('exact-pm-a', 'pgtap-pm-exact-company', '00000000-0000-0000-0000-000000007801', 'Exact PM A', 'exact-pm-a@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('exact-pm-b', 'pgtap-pm-exact-company', '00000000-0000-0000-0000-000000007802', 'Exact PM B', 'exact-pm-b@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  ('pgtap-pm-exact-company', 'client', 'exact-client-a', '{"id":"exact-client-a","clientName":"Same Name Co","createdBy":"exact-pm-a"}'::jsonb),
  ('pgtap-pm-exact-company', 'client', 'exact-client-b', '{"id":"exact-client-b","clientName":"SAME NAME CO","createdBy":"exact-pm-b"}'::jsonb);

create function pg_temp.create_task(p_id text, p_client_id text) returns jsonb
language sql as $$
  select public.aitask_execute_command(
    'pgtap-pm-exact-company', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', p_id, 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', p_id, 'clientId', p_client_id, 'clientName', 'Same Name Co', 'title', 'Exact company task',
        'department', 'Designer', 'createdBy', 'exact-pm-a', 'status', 'Pending',
        'visibility', 'internal', 'isCompleted', false
      )
    ))
  );
$$;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000007801', true);
set local role authenticated;

select is((pg_temp.create_task('exact-task-own', 'exact-client-a') ->> 'ok')::boolean, true,
  'a PM can create a task on the company they own by ID');
select is((pg_temp.create_task('exact-task-other', 'exact-client-b') ->> 'ok')::boolean, false,
  'a PM cannot create a task on another PM''s same-name company by ID');
select is((select count(*)::integer from public.aitask_entities
  where workspace_id = 'pgtap-pm-exact-company' and entity_type = 'task' and entity_id = 'exact-task-other'), 0,
  'the refused task was not stored');

reset role;
select * from finish();
rollback;
