begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000915', 'authenticated', 'authenticated', 'pgtap-hod-delete@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000916', 'authenticated', 'authenticated', 'pgtap-plain-delete@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-company-delete', 'HOD company deletion test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions
) values
  (
    'pgtap-hod-delete', 'pgtap-company-delete',
    '00000000-0000-0000-0000-000000000915', 'HOD Delete',
    'pgtap-hod-delete@aitask.local', 'Staff', 'Designer', array['Designer'],
    '{"deleteClients": true}'::jsonb
  ),
  (
    'pgtap-plain-delete', 'pgtap-company-delete',
    '00000000-0000-0000-0000-000000000916', 'Plain Delete',
    'pgtap-plain-delete@aitask.local', 'Staff', 'Designer', array['Designer'],
    '{}'::jsonb
  );

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-company-delete', 'client', 'pgtap-delete-client', '{"id":"pgtap-delete-client","clientName":"Delete Co","createdBy":"pgtap-hod-delete"}'::jsonb),
  ('pgtap-company-delete', 'client', 'pgtap-keep-client', '{"id":"pgtap-keep-client","clientName":"Keep Co"}'::jsonb);

-- A member with Delete companies can remove a company.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000915', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-company-delete', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'pgtap-delete-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-company-delete' and entity_type = 'client' and entity_id = 'pgtap-delete-client')
    ))
  ) ->> 'ok')::boolean,
  true,
  'a member with Delete companies can delete a company'
);

reset role;
select is(
  (select count(*)::integer from public.aitask_entities
   where workspace_id = 'pgtap-company-delete'
     and entity_type = 'client'
     and entity_id = 'pgtap-delete-client'),
  0,
  'the deleted company was removed'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000916', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-company-delete', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'client', 'entityId', 'pgtap-keep-client',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-company-delete' and entity_type = 'client' and entity_id = 'pgtap-keep-client')
    ))
  ) ->> 'ok')::boolean,
  false,
  'ordinary Staff without Delete companies cannot delete a company'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
