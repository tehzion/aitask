begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

-- These fixtures are disposable and the enclosing transaction is rolled back.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009901','authenticated','authenticated','rpc-pm@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009902','authenticated','authenticated','rpc-hod@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009903','authenticated','authenticated','rpc-staff@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009904','authenticated','authenticated','rpc-client@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-rpc-boundaries', 'RPC boundary regression fixtures');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments,
  permissions, is_super_admin, client_name
) values
  ('rpc-pm','pgtap-rpc-boundaries','00000000-0000-4000-8000-000000009901','PM','rpc-pm@aitask.local','Project Manager','Management','{}','{"manageServiceCycles":true}'::jsonb,false,null),
  ('rpc-hod','pgtap-rpc-boundaries','00000000-0000-4000-8000-000000009902','HOD','rpc-hod@aitask.local','HOD','Designer','{"Designer"}','{}'::jsonb,false,null),
  ('rpc-staff','pgtap-rpc-boundaries','00000000-0000-4000-8000-000000009903','Staff','rpc-staff@aitask.local','Staff','Designer','{"Designer"}','{}'::jsonb,false,null),
  ('rpc-client','pgtap-rpc-boundaries','00000000-0000-4000-8000-000000009904','Client','rpc-client@aitask.local','Client','Client','{"Client"}','{}'::jsonb,false,'Ambiguous Co');

-- Catalog assertions cover the complete 19-function advisor set.
select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'aitask_acknowledge_release_notice','aitask_complete_password_setup',
      'aitask_execute_command','aitask_execute_service_command',
      'aitask_generate_deliverable_task_chain','aitask_get_backend_capabilities',
      'aitask_get_release_notice_acknowledgement','aitask_get_workflow_task_context',
      'aitask_read_client_portal','aitask_reconcile_service_upload',
      'aitask_set_deliverable_status','aitask_set_notifications_read',
      'aitask_set_service_cycle_status','aitask_update_member_departments',
      'aitask_update_member_permissions','aitask_update_member_role'
    )
    and p.prosecdef
), 19, 'all 19 advisor functions remain explicitly classified SECURITY DEFINER');

select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'aitask_acknowledge_release_notice','aitask_complete_password_setup',
      'aitask_execute_command','aitask_execute_service_command',
      'aitask_generate_deliverable_task_chain','aitask_get_backend_capabilities',
      'aitask_get_release_notice_acknowledgement','aitask_get_workflow_task_context',
      'aitask_read_client_portal','aitask_reconcile_service_upload',
      'aitask_set_deliverable_status','aitask_set_notifications_read',
      'aitask_set_service_cycle_status','aitask_update_member_departments',
      'aitask_update_member_permissions','aitask_update_member_role'
    )
    and p.proconfig @> array['search_path=""']::text[]
), 19, 'all 19 advisor functions use an empty search_path');

select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'aitask_acknowledge_release_notice','aitask_complete_password_setup',
      'aitask_execute_command','aitask_execute_service_command',
      'aitask_generate_deliverable_task_chain','aitask_get_backend_capabilities',
      'aitask_get_release_notice_acknowledgement','aitask_get_workflow_task_context',
      'aitask_read_client_portal','aitask_reconcile_service_upload',
      'aitask_set_deliverable_status','aitask_set_notifications_read',
      'aitask_set_service_cycle_status','aitask_update_member_departments',
      'aitask_update_member_permissions','aitask_update_member_role'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE')
), 0, 'anonymous callers cannot execute the advisor functions');

select is((
  select count(*)::integer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'aitask_acknowledge_release_notice','aitask_complete_password_setup',
      'aitask_execute_command','aitask_execute_service_command',
      'aitask_generate_deliverable_task_chain','aitask_get_backend_capabilities',
      'aitask_get_release_notice_acknowledgement','aitask_get_workflow_task_context',
      'aitask_read_client_portal','aitask_reconcile_service_upload',
      'aitask_set_deliverable_status','aitask_set_notifications_read',
      'aitask_set_service_cycle_status','aitask_update_member_departments',
      'aitask_update_member_permissions','aitask_update_member_role'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
), 19, 'authenticated callers can reach the intentional application RPCs');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009903', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is((public.aitask_update_member_role(
  'pgtap-rpc-boundaries', gen_random_uuid(), 'rpc-staff', 'Project Manager', null, null, null, 1
)->>'ok')::boolean, false, 'Staff cannot promote themselves');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009902', true);
set local role authenticated;
select is((public.aitask_update_member_permissions(
  'pgtap-rpc-boundaries', gen_random_uuid(), 'rpc-staff', '{"manageUsers":true}'::jsonb, 1
)->>'ok')::boolean, false, 'HOD cannot grant administrative permissions');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009901', true);
set local role authenticated;
select is((public.aitask_update_member_departments(
  'pgtap-rpc-boundaries', gen_random_uuid(), 'rpc-staff', '{"Design"}'::text[], 1
)->>'ok')::boolean, false, 'Project Managers cannot modify member departments');

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009904', true);
set local role authenticated;
select is((public.aitask_update_member_role(
  'pgtap-rpc-boundaries', gen_random_uuid(), 'rpc-staff', 'Staff', null, null, '{"Design"}'::text[], 1
)->>'ok')::boolean, false, 'Client users cannot execute administrative member RPCs');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select is((public.aitask_complete_password_setup(
  'pgtap-rpc-boundaries', gen_random_uuid()
)->>'ok')::boolean, false, 'unauthenticated callers cannot complete password setup');

-- Foreign service-cycle delete through the legacy 4-argument overload must
-- fail before the SECURITY DEFINER write and leave the row unchanged.
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-rpc-boundaries','client','rpc-foreign-client','{"id":"rpc-foreign-client","clientName":"Foreign Co","createdBy":"someone-else"}'::jsonb),
  ('pgtap-rpc-boundaries','service_cycle','rpc-foreign-cycle','{"id":"rpc-foreign-cycle","clientId":"rpc-foreign-client","planId":"rpc-foreign-plan","status":"Draft","periodStart":"2026-10-01","serviceItems":[]}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009901', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is((public.aitask_execute_service_command(
  'pgtap-rpc-boundaries', gen_random_uuid(), 'service_cycle.manage',
  jsonb_build_array(jsonb_build_object(
    'kind','entity','action','delete','entityType','service_cycle',
    'entityId','rpc-foreign-cycle','expectedVersion',1,'data','{}'::jsonb
  ))
)->>'ok')::boolean, false, 'legacy service delete rejects a foreign PM target');

reset role;
select is((select count(*)::integer from public.aitask_entities
  where workspace_id='pgtap-rpc-boundaries' and entity_id='rpc-foreign-cycle'), 1,
  'rejected legacy service delete has no side effect');

select is(private.aitask_generated_task_references_are_valid(
  'pgtap-rpc-boundaries',
  '{"clientId":"rpc-foreign-client","serviceCycleId":"missing-cycle","deliverableId":"missing-deliverable"}'::jsonb
), false, 'generated task validation rejects forged object references');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-rpc-boundaries','client','rpc-ambiguous-a','{"id":"rpc-ambiguous-a","clientName":"Ambiguous Co"}'::jsonb),
  ('pgtap-rpc-boundaries','client','rpc-ambiguous-b','{"id":"rpc-ambiguous-b","clientName":"Ambiguous Co"}'::jsonb);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009904', true);
set local role authenticated;
select throws_ok(
  $$select public.aitask_read_client_portal('pgtap-rpc-boundaries')$$,
  '42501', 'Client workspace mapping is unavailable.',
  'client portal fails closed when the client mapping is ambiguous'
);

select * from finish();
rollback;
