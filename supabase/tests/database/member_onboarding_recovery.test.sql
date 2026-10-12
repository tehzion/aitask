begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-4000-8000-000000009801','authenticated','authenticated','onboarding-boss@example.test','{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('onboarding-test','Onboarding test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values ('onboarding-boss','onboarding-test','00000000-0000-4000-8000-000000009801','Boss','onboarding-boss@example.test','Project Manager','Management',array['Management'],true);
create temporary table onboarding_fixture(payload jsonb,first_result jsonb);
insert into onboarding_fixture(payload) values ('{"name":"Freelancer","email":"onboarding-new@example.test","role":"Staff","departments":["Designer"],"companyName":null,"customRoleId":null,"customRoleName":null,"memberId":null,"registrationId":null,"workerType":"freelancer","sendInvitation":false}');
select ok(not has_table_privilege('authenticated','private.aitask_member_onboarding','SELECT'),'journal is private');
select ok(not has_function_privilege('anon','public.aitask_reserve_member_onboarding(text,uuid,jsonb)','EXECUTE'),'anon cannot reserve');
select ok(not has_function_privilege('authenticated','public.aitask_finalize_member_invitation_v3(text,uuid,uuid,jsonb)','EXECUTE'),'signed-in callers cannot finalize');
select is((public.aitask_reserve_member_onboarding('onboarding-boss','00000000-0000-4000-8000-000000009802',(select payload from onboarding_fixture))->>'ok')::boolean,true,'reserve succeeds');
select throws_ok($$select public.aitask_reserve_member_onboarding('onboarding-boss','00000000-0000-4000-8000-000000009802',(select payload||'{"workerType":"supplier"}' from onboarding_fixture))$$,'P0001','Onboarding command belongs to another request','changed replay conflicts');
select throws_ok($$select public.aitask_reserve_member_onboarding('onboarding-boss','00000000-0000-4000-8000-000000009803',(select payload||'{"password":"never-store-this"}' from onboarding_fixture))$$,'P0001','Invalid onboarding payload','password cannot enter the journal');
select throws_ok($$select public.aitask_reserve_member_onboarding('onboarding-boss','00000000-0000-4000-8000-000000009803',(select payload from onboarding_fixture))$$,'P0001','Another onboarding request for this email is pending. Retry the original request','one pending email intent');
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-4000-8000-000000009804','authenticated','authenticated','onboarding-new@example.test','{}','{"aitask_onboarding_command":"00000000-0000-4000-8000-000000009802"}',now(),now());
select ok((select not (raw_app_meta_data ? 'aitask_onboarding_command') from auth.users where id='00000000-0000-4000-8000-000000009804'),'signup metadata cannot claim an invitation');
update auth.users set invited_at=now() where id='00000000-0000-4000-8000-000000009804';
select is((select raw_app_meta_data->>'aitask_onboarding_command' from auth.users where id='00000000-0000-4000-8000-000000009804'),'00000000-0000-4000-8000-000000009802','admin invite stamps ownership when invited_at is written');
update auth.users set raw_app_meta_data='{}' where id='00000000-0000-4000-8000-000000009804';
select throws_ok($$select public.aitask_finalize_member_invitation_v3('onboarding-boss','00000000-0000-4000-8000-000000009802','00000000-0000-4000-8000-000000009804',(select payload from onboarding_fixture))$$,'P0001','An unrelated Auth account cannot be adopted','unrelated Auth denied');
update auth.users set raw_app_meta_data='{"aitask_onboarding_command":"00000000-0000-4000-8000-000000009802","aitask_onboarding_actor":"onboarding-boss","aitask_onboarding_workspace":"onboarding-test"}' where id='00000000-0000-4000-8000-000000009804';
update onboarding_fixture set first_result=public.aitask_finalize_member_invitation_v3('onboarding-boss','00000000-0000-4000-8000-000000009802','00000000-0000-4000-8000-000000009804',payload);
select is((select worker_type from public.aitask_members where auth_user_id='00000000-0000-4000-8000-000000009804'),'freelancer','worker type saved atomically');
select is(public.aitask_finalize_member_invitation_v3('onboarding-boss','00000000-0000-4000-8000-000000009802','00000000-0000-4000-8000-000000009804',(select payload from onboarding_fixture)),(select first_result from onboarding_fixture),'replay returns identical receipt');
select is((select count(*)::integer from public.aitask_members where auth_user_id='00000000-0000-4000-8000-000000009804'),1,'one member');
select is((select count(*)::integer from public.aitask_audit_events where workspace_id='onboarding-test' and action='member.invite'),1,'one onboarding audit event');
select is((public.aitask_reserve_member_onboarding('onboarding-boss','00000000-0000-4000-8000-000000009802',(select payload from onboarding_fixture))->'result'),(select first_result from onboarding_fixture),'lost confirmation reconciles from journal');
select * from finish();
rollback;
