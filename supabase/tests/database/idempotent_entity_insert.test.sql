begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000941', 'authenticated', 'authenticated', 'pgtap-idem-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-idempotent-insert', 'Idempotent insert test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-idem-pm', 'pgtap-idempotent-insert', '00000000-0000-0000-0000-000000000941', 'PM', 'pgtap-idem-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000941', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

-- First insert applies.
select is(
  (public.aitask_execute_command(
    'pgtap-idempotent-insert', gen_random_uuid(), 'client.upsert',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'idem-client',
      'expectedVersion', 0,
      'data', '{"id":"idem-client","clientName":"Idem Co","createdBy":"pgtap-idem-pm"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'first company insert applies'
);

-- Re-sending the identical insert is a no-op success, not a conflict.
select is(
  (public.aitask_execute_command(
    'pgtap-idempotent-insert', gen_random_uuid(), 'client.upsert',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'idem-client',
      'expectedVersion', 0,
      'data', '{"id":"idem-client","clientName":"Idem Co","createdBy":"pgtap-idem-pm"}'::jsonb
    ))
  ) ->> 'ok')::boolean,
  true,
  'an identical re-insert is an idempotent success'
);

-- Re-inserting the same id with different data still conflicts.
select is(
  (public.aitask_execute_command(
    'pgtap-idempotent-insert', gen_random_uuid(), 'client.upsert',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'idem-client',
      'expectedVersion', 0,
      'data', '{"id":"idem-client","clientName":"Different Co","createdBy":"pgtap-idem-pm"}'::jsonb
    ))
  ) ->> 'code',
  'CONFLICT',
  'a conflicting insert with different data is still rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
