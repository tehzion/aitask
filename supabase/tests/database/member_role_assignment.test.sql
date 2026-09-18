begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000931', 'authenticated', 'authenticated', 'pgtap-role-boss2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000932', 'authenticated', 'authenticated', 'pgtap-role-target2@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name) values ('pgtap-member-role', 'Member role test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin, permissions
) values
  ('pgtap-role-boss2', 'pgtap-member-role', '00000000-0000-0000-0000-000000000931', 'Boss', 'pgtap-role-boss2@aitask.local', 'Admin', 'Management', array['Management'], true, '{}'::jsonb),
  ('pgtap-role-target2', 'pgtap-member-role', '00000000-0000-0000-0000-000000000932', 'Target', 'pgtap-role-target2@aitask.local', 'Staff', 'Designer', array['Designer'], false, '{}'::jsonb);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values ('pgtap-member-role', 'client', 'pgtap-role-client', '{"id":"pgtap-role-client","clientName":"Acme"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000931', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Boss Koo can promote a Staff member to Admin.
select is(
  (public.aitask_update_member_role(
    'pgtap-member-role', gen_random_uuid(), 'pgtap-role-target2',
    'Admin', null, null, array[]::text[],
    (select version from public.aitask_members where workspace_id = 'pgtap-member-role' and id = 'pgtap-role-target2')
  ) ->> 'ok')::boolean,
  true,
  'Boss Koo can promote a Staff member to Admin'
);

reset role;
select is(
  (select role from public.aitask_members where workspace_id = 'pgtap-member-role' and id = 'pgtap-role-target2'),
  'Admin',
  'the member role is persisted'
);

-- Client assignment requires a company.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000931', true);
select is(
  (public.aitask_update_member_role(
    'pgtap-member-role', gen_random_uuid(), 'pgtap-role-target2',
    'Client', null, null, array[]::text[],
    (select version from public.aitask_members where workspace_id = 'pgtap-member-role' and id = 'pgtap-role-target2')
  ) ->> 'ok')::boolean,
  false,
  'Client assignment without a company is rejected'
);

-- Client assignment with a company succeeds.
select is(
  (public.aitask_update_member_role(
    'pgtap-member-role', gen_random_uuid(), 'pgtap-role-target2',
    'Client', null, 'Acme', array['Client'],
    (select version from public.aitask_members where workspace_id = 'pgtap-member-role' and id = 'pgtap-role-target2')
  ) ->> 'ok')::boolean,
  true,
  'Client assignment with a company succeeds'
);

reset role;
select is(
  (select client_name from public.aitask_members where workspace_id = 'pgtap-member-role' and id = 'pgtap-role-target2'),
  'Acme',
  'the client company is persisted'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
