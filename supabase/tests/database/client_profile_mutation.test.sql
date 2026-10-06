begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000971',
  'authenticated', 'authenticated', 'pgtap-client-edit@aitask.local', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-client-profile-edit', 'Client profile edit test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin
) values (
  'pgtap-client-edit', 'pgtap-client-profile-edit', '00000000-0000-4000-8000-000000000971',
  'Boss', 'pgtap-client-edit@aitask.local', 'Project Manager', 'Management', array['Management'], true
);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'pgtap-client-profile-edit', 'client', 'pgtap-edit-client',
  jsonb_build_object(
    'id', 'pgtap-edit-client', 'clientName', 'Acme Studio', 'createdBy', 'pgtap-client-edit',
    'contactPerson', 'Old Contact', 'email', 'old@example.com', 'phone', '111-222',
    'address', 'Old address', 'website', 'https://old.example.com',
    'facebookPage', 'https://facebook.com/old', 'notes', 'Old notes',
    'createdAt', '2026-01-01T00:00:00Z', 'updatedAt', '2026-09-19T00:00:00Z'
  )
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000971', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-client-profile-edit', gen_random_uuid(), 'client.upsert',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'client', 'entityId', 'pgtap-edit-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-client-profile-edit' and entity_type = 'client' and entity_id = 'pgtap-edit-client'),
      'data', jsonb_build_object(
        'id', 'pgtap-edit-client', 'clientName', 'Acme Studio', 'createdBy', 'pgtap-client-edit',
        'contactPerson', 'Alicia Tan', 'email', 'alicia@acme.example', 'phone', '+60 12-345 6789',
        'address', '88 Market Street', 'website', 'https://acme.example.com',
        'facebookPage', 'https://facebook.com/acme', 'notes', 'Call before visiting',
        'createdAt', '2026-01-01T00:00:00Z', 'updatedAt', '2026-09-20T00:01:00Z'
      )
    )),
    (select version from public.aitask_workspaces where id = 'pgtap-client-profile-edit')
  ) ->> 'ok')::boolean,
  true,
  'client.upsert accepts a permitted company profile edit'
);

select ok(
  (select data @> jsonb_build_object(
    'contactPerson', 'Alicia Tan', 'email', 'alicia@acme.example',
    'phone', '+60 12-345 6789', 'address', '88 Market Street',
    'website', 'https://acme.example.com', 'facebookPage', 'https://facebook.com/acme',
    'notes', 'Call before visiting'
  ) from public.aitask_entities
  where workspace_id = 'pgtap-client-profile-edit'
    and entity_type = 'client' and entity_id = 'pgtap-edit-client'),
  'the submitted contact fields are persisted in the company JSONB profile'
);

select is(
  (select version from public.aitask_entities
   where workspace_id = 'pgtap-client-profile-edit'
     and entity_type = 'client' and entity_id = 'pgtap-edit-client'),
  2::bigint,
  'saving the profile increments its row version'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
