begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000913', 'authenticated', 'authenticated', 'pgtap-hod-company@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000914', 'authenticated', 'authenticated', 'pgtap-plain-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-hod-company', 'HOD company creation test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions
) values
  (
    'pgtap-hod-actor', 'pgtap-hod-company',
    '00000000-0000-0000-0000-000000000913', 'HOD Actor',
    'pgtap-hod-company@aitask.local', 'Staff', 'Designer', array['Designer'],
    '{"createClients": true}'::jsonb
  ),
  (
    'pgtap-plain-staff', 'pgtap-hod-company',
    '00000000-0000-0000-0000-000000000914', 'Plain Staff',
    'pgtap-plain-staff@aitask.local', 'Staff', 'Designer', array['Designer'],
    '{}'::jsonb
  );

-- The Add companies capability lets a Staff-based lead create a company.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000913', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-hod-company', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'pgtap-new-client',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-new-client', 'clientName', 'New Co', 'createdBy', 'pgtap-hod-actor'
      )
    ))
  ) ->> 'ok')::boolean,
  true,
  'a member with Add companies can create a company'
);

select is(
  (select count(*)::integer from public.aitask_entities
   where workspace_id = 'pgtap-hod-company'
     and entity_type = 'client'
     and entity_id = 'pgtap-new-client'),
  1,
  'the company creator can read back the company they created'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000914', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-hod-company', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'client', 'entityId', 'pgtap-denied-client',
      'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-denied-client', 'clientName', 'Denied Co', 'createdBy', 'pgtap-plain-staff'
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'ordinary Staff without Add companies cannot create a company'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
