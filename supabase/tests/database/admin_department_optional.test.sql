begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000941', 'authenticated', 'authenticated', 'pgtap-admin-dept@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000942', 'authenticated', 'authenticated', 'pgtap-staff-dept@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name) values ('pgtap-admin-dept', 'Admin department test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin, permissions
) values
  ('pgtap-boss3', 'pgtap-admin-dept', '00000000-0000-0000-0000-000000000941', 'Boss', 'pgtap-admin-dept@aitask.local', 'Project Manager', 'Management', array['Management'], true, '{}'::jsonb),
  ('pgtap-target3', 'pgtap-admin-dept', '00000000-0000-0000-0000-000000000942', 'Target', 'pgtap-staff-dept@aitask.local', 'Staff', 'Designer', array['Designer'], false, '{}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000941', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Admin is not limited by department and may have none.
select is(
  (public.aitask_update_member_role(
    'pgtap-admin-dept', gen_random_uuid(), 'pgtap-target3',
    'Project Manager', null, null, array[]::text[],
    (select version from public.aitask_members where workspace_id = 'pgtap-admin-dept' and id = 'pgtap-target3')
  ) ->> 'ok')::boolean,
  true,
  'an Admin can be assigned with no departments'
);

reset role;
select is(
  (select cardinality(departments) from public.aitask_members where workspace_id = 'pgtap-admin-dept' and id = 'pgtap-target3'),
  0,
  'the Admin member has zero departments'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000941', true);
select is(
  (public.aitask_update_member_role(
    'pgtap-admin-dept', gen_random_uuid(), 'pgtap-target3',
    'Staff', null, null, array[]::text[],
    (select version from public.aitask_members where workspace_id = 'pgtap-admin-dept' and id = 'pgtap-target3')
  ) ->> 'code'),
  'VALIDATION',
  'a Staff member still requires at least one department'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
