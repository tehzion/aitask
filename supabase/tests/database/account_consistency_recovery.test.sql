begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000008801','authenticated','authenticated','recovery-boss@example.test','{}','{}',now(),now()),
 ('00000000-0000-4000-8000-000000008802','authenticated','authenticated','recovery-staff@example.test','{}','{}',now(),now());
insert into auth.users(id,aud,role,email,raw_app_meta_data) values ('00000000-0000-4000-8000-000000008830','authenticated','authenticated','other-recovery-boss@example.test','{}');
insert into public.aitask_workspaces(id,name) values ('recovery-test','Recovery test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
 ('recovery-boss','recovery-test','00000000-0000-4000-8000-000000008801','Boss','recovery-boss@example.test','Project Manager','Management',array['Management'],true),
 ('recovery-staff','recovery-test','00000000-0000-4000-8000-000000008802','Staff','recovery-staff@example.test','Staff','Designer',array['Designer'],false),
 ('recovery-unlinked','recovery-test',null,'Unlinked','recovery-taken@example.test','Staff','Designer',array['Designer'],false);
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
 ('other-recovery-boss','recovery-test','00000000-0000-4000-8000-000000008830','Other Boss','other-recovery-boss@example.test','Project Manager','Management',array['Management'],true);
create temporary table original_revisions as select version from public.aitask_workspaces where id='recovery-test';
update auth.users set email='recovery-new@example.test' where id='00000000-0000-4000-8000-000000008802';
select is((select email from public.aitask_members where id='recovery-staff'),'recovery-new@example.test','Auth updates member in the same transaction');
select is((select version::integer from public.aitask_members where id='recovery-staff'),2,'member version increments');
select is((select version::integer from public.aitask_workspaces where id='recovery-test'),(select version::integer+1 from original_revisions),'workspace revision increments');
select is((select count(*)::integer from public.aitask_audit_events where workspace_id='recovery-test' and action='account.email.update'),1,'one email audit event');
select is((public.aitask_update_member_email('recovery-staff','recovery-new@example.test')->>'unchanged')::boolean,true,'legacy RPC is an idempotent canonical replay');
select is((select count(*)::integer from public.aitask_audit_events where workspace_id='recovery-test' and action='account.email.update'),1,'replay adds no audit event');
select throws_ok($$update auth.users set email='recovery-taken@example.test' where id='00000000-0000-4000-8000-000000008802'$$,'P0001','Email already belongs to another member','duplicate member email rejects Auth transaction');
select is((select email from auth.users where id='00000000-0000-4000-8000-000000008802'),'recovery-new@example.test','duplicate rejection preserves canonical Auth');
select throws_ok($$select public.aitask_update_member_email('recovery-staff','arbitrary@example.test')$$,'P0001','Member email must match canonical Auth email','RPC cannot introduce mismatch');
create temporary table operation_payload(payload jsonb);
insert into operation_payload values ('{"name":"Prepared","email":"recovery-prepared@example.test","role":"Staff","departments":["Designer"],"companyName":null,"customRoleId":null,"customRoleName":null,"memberId":null,"registrationId":null,"workerType":"employee","sendInvitation":false}');
select public.aitask_reserve_member_onboarding('recovery-boss','00000000-0000-4000-8000-000000008803',(select payload from operation_payload));
select is(jsonb_array_length(public.aitask_list_member_onboarding('recovery-boss')->'operations'),1,'original Boss can discover a request across browsers');
select ok(not has_function_privilege('authenticated','public.aitask_list_member_onboarding(text)','execute'),'client cannot impersonate Boss in list RPC');
select ok(not has_function_privilege('authenticated','public.aitask_cancel_member_onboarding(text,uuid,boolean)','execute'),'client cannot impersonate Boss in cancellation RPC');
select throws_ok($$select public.aitask_cancel_member_onboarding('recovery-staff','00000000-0000-4000-8000-000000008803')$$,'P0001','Super Admin permission required','Staff cannot cancel');
select is(jsonb_array_length(public.aitask_list_member_onboarding('other-recovery-boss')->'operations'),0,'another Boss cannot list original actor operations');
select throws_ok($$select public.aitask_cancel_member_onboarding('other-recovery-boss','00000000-0000-4000-8000-000000008803')$$,'P0001','Onboarding request not found for this account','another Boss cannot cancel original actor operations');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000008804','authenticated','authenticated','recovery-prepared@example.test',
 '{"aitask_onboarding_command":"00000000-0000-4000-8000-000000008803","aitask_onboarding_actor":"recovery-boss","aitask_onboarding_workspace":"recovery-test"}','{}',now(),now());
select is((public.aitask_cancel_member_onboarding('recovery-boss','00000000-0000-4000-8000-000000008803')->>'state'),'cancelling','cancellation fences request');
select throws_ok($$select public.aitask_cancel_member_onboarding('recovery-boss','00000000-0000-4000-8000-000000008803',true)$$,'P0001','Cancellation cleanup is not confirmed','email remains reserved before confirmed cleanup');
select throws_ok($$select public.aitask_finalize_member_invitation_v3('recovery-boss','00000000-0000-4000-8000-000000008803','00000000-0000-4000-8000-000000008804',(select payload from operation_payload))$$,'P0001','Cancel this request before starting a replacement','late finalization is fenced');
delete from auth.users where id='00000000-0000-4000-8000-000000008804';
select is((public.aitask_cancel_member_onboarding('recovery-boss','00000000-0000-4000-8000-000000008803',true)->>'state'),'cancelled','cleanup releases reservation');
select throws_ok($$insert into auth.users(id,aud,role,email,raw_app_meta_data) values ('00000000-0000-4000-8000-000000008805','authenticated','authenticated','recovery-prepared@example.test','{"aitask_onboarding_command":"00000000-0000-4000-8000-000000008803","aitask_onboarding_actor":"recovery-boss","aitask_onboarding_workspace":"recovery-test"}')$$,'P0001','Onboarding request is cancelled or cancelling','late admin creation is fenced');
select is((public.aitask_reserve_member_onboarding('recovery-boss','00000000-0000-4000-8000-000000008806',(select payload from operation_payload))->>'ok')::boolean,true,'replacement can reserve after cleanup');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select is((public.aitask_get_backend_capabilities('recovery-test')->>'emailSynchronization')::boolean,true,'email capability enabled');
select is((public.aitask_get_backend_capabilities('recovery-test')->>'onboardingRecovery')::boolean,true,'recovery capability enabled');
select * from finish();
rollback;
