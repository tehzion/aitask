begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select ok(
  not has_function_privilege('anon', 'public.aitask_app_state_health()', 'EXECUTE'),
  'anonymous users cannot execute the retired public health helper'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_app_state_health()', 'EXECUTE'),
  'authenticated users cannot execute the retired public health helper'
);
select ok(
  not has_function_privilege('anon', 'public.aitask_is_internal_app_origin()', 'EXECUTE'),
  'anonymous users cannot execute the retired origin helper'
);
select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous users cannot use the private helper schema'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_workspaces', 'TRUNCATE'),
  'authenticated users cannot truncate workspaces'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_members', 'TRIGGER'),
  'authenticated users cannot create member triggers'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_entities', 'REFERENCES'),
  'authenticated users cannot add entity references'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_members', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot write members directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.aitask_entities', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot write entities directly'
);
select ok(
  has_table_privilege('authenticated', 'public.aitask_workspaces', 'SELECT')
    and has_table_privilege('authenticated', 'public.aitask_members', 'SELECT')
    and has_table_privilege('authenticated', 'public.aitask_entities', 'SELECT'),
  'authenticated users retain the required workspace read surface'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_execute_command(text,uuid,text,jsonb)', 'EXECUTE'),
  'authenticated users retain the protected workspace command API'
);
select ok(
  has_function_privilege('service_role', 'public.aitask_delete_member_account(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.aitask_delete_member_account(text,text)', 'EXECUTE'),
  'member deletion remains service-role only'
);
select ok(
  has_function_privilege('service_role', 'public.aitask_finalize_member_invitation(text,uuid,text,text,text,text,text,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.aitask_finalize_member_invitation(text,uuid,text,text,text,text,text,text,text,text,text)', 'EXECUTE'),
  'member invitation finalization remains service-role only'
);
select ok(
  not has_function_privilege('authenticated', 'public.aitask_update_member_email(text,text)', 'EXECUTE'),
  'direct member email administration is unavailable to authenticated clients'
);
select ok(
  has_function_privilege('authenticated', 'public.aitask_update_member_permissions(text,uuid,text,jsonb,bigint)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.aitask_update_member_permissions(text,uuid,text,jsonb,bigint)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.aitask_update_member_permissions(text,uuid,text,jsonb,bigint)', 'EXECUTE'),
  'member permission changes use the authenticated Boss-only RPC boundary'
);

select * from finish();
rollback;
