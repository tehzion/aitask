begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function(
  'public',
  'aitask_complete_password_setup',
  array['text', 'uuid'],
  'password setup completion RPC exists'
);
select ok(
  not has_function_privilege('public', 'public.aitask_complete_password_setup(text,uuid)', 'EXECUTE'),
  'PUBLIC cannot execute password setup completion'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_complete_password_setup(text,uuid)', 'EXECUTE'),
  'anonymous callers cannot execute password setup completion'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_complete_password_setup(text,uuid)', 'EXECUTE'),
  'authenticated callers can execute password setup completion'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000915',
  'authenticated',
  'authenticated',
  'pgtap-password-setup@aitask.local',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-password-setup', 'Password setup test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  must_reset_password
) values (
  'pgtap-password-member',
  'pgtap-password-setup',
  '00000000-0000-0000-0000-000000000915',
  'Password Setup Member',
  'pgtap-password-setup@aitask.local',
  'Staff',
  'Designer',
  array['Designer'],
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.aitask_complete_password_setup(
    'pgtap-password-setup',
    '00000000-0000-0000-0000-000000000916'::uuid
  ) ->> 'code',
  'FORBIDDEN',
  'a caller without an authenticated identity is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000915', true);

select is(
  public.aitask_complete_password_setup(
    'pgtap-password-setup-other',
    '00000000-0000-0000-0000-000000000917'::uuid
  ) ->> 'code',
  'FORBIDDEN',
  'an authenticated caller without workspace membership is rejected'
);

select is(
  (public.aitask_complete_password_setup(
    'pgtap-password-setup',
    '00000000-0000-0000-0000-000000000918'::uuid
  ) ->> 'ok')::boolean,
  true,
  'an authenticated member can complete required password setup'
);

reset role;

select is(
  (select must_reset_password from public.aitask_members
   where workspace_id = 'pgtap-password-setup' and id = 'pgtap-password-member'),
  false,
  'password setup clears only the member setup flag'
);
select is(
  (select version from public.aitask_workspaces where id = 'pgtap-password-setup'),
  2::bigint,
  'password setup increments the workspace version once'
);
select is(
  (select count(*) from public.aitask_audit_events
   where workspace_id = 'pgtap-password-setup'
     and command_id = '00000000-0000-0000-0000-000000000918'::uuid
     and action = 'password_setup_complete'
     and entity_type = 'member'
     and entity_id = 'pgtap-password-member'
     and changed_fields = array['must_reset_password']),
  1::bigint,
  'password setup records one precise audit event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000915', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_complete_password_setup(
    'pgtap-password-setup',
    '00000000-0000-0000-0000-000000000919'::uuid
  ) ->> 'changed')::boolean,
  false,
  'repeating completion for an already-complete account is a no-op'
);

reset role;

select is(
  (select version from public.aitask_workspaces where id = 'pgtap-password-setup'),
  2::bigint,
  'a repeated completion does not increment the workspace version'
);
select is(
  (select count(*) from public.aitask_audit_events
   where workspace_id = 'pgtap-password-setup'
     and action = 'password_setup_complete'),
  1::bigint,
  'a repeated completion does not add another audit event'
);
select is(
  (select count(*) from public.aitask_members
   where workspace_id = 'pgtap-password-setup'
     and must_reset_password = false),
  1::bigint,
  'no other member record is changed during password completion'
);

select * from finish();
rollback;
