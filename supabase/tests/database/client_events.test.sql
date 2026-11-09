begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
select ok(not has_table_privilege('authenticated', 'public.aitask_client_events', 'SELECT'), 'app users cannot read telemetry');
select ok(not has_table_privilege('authenticated', 'public.aitask_client_events', 'UPDATE'), 'app users cannot update telemetry');
select ok(not has_table_privilege('anon', 'public.aitask_client_events', 'INSERT'), 'anonymous users cannot insert telemetry');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e001','authenticated','authenticated','telemetry-a@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e002','authenticated','authenticated','telemetry-b@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000e003','authenticated','authenticated','telemetry-client@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-client-events','Telemetry test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('telemetry-a','pgtap-client-events','00000000-0000-0000-0000-00000000e001','A','telemetry-a@aitask.local','Staff','Designer',array['Designer'],false),
('telemetry-b','pgtap-client-events','00000000-0000-0000-0000-00000000e002','B','telemetry-b@aitask.local','Staff','Designer',array['Designer'],false),
('telemetry-client','pgtap-client-events','00000000-0000-0000-0000-00000000e003','Client','telemetry-client@aitask.local','Client','Client',array['Client'],false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select lives_ok($$insert into public.aitask_client_events(member_id,role,event_type,detail) values ('telemetry-a','Staff','save_failure','OFFLINE')$$, 'member may insert own allowlisted event');
select throws_ok($$insert into public.aitask_client_events(member_id,role,event_type,detail) values ('telemetry-b','Staff','save_failure','OFFLINE')$$, '42501', null, 'member cannot impersonate another member');
select throws_ok($$insert into public.aitask_client_events(member_id,role,event_type,detail) values ('telemetry-a','HOD','save_failure','OFFLINE')$$, '42501', null, 'member cannot forge role');
select throws_ok($$insert into public.aitask_client_events(member_id,role,event_type,detail) values ('telemetry-a','Staff','save_failure','arbitrary sensitive text')$$, '23514', null, 'free text is rejected');
select throws_ok($$insert into public.aitask_client_events(member_id,role,event_type,detail) values ('telemetry-a','Staff','save_failure',null)$$, '23514', null, 'required event details cannot be null');
select lives_ok($$insert into public.aitask_client_events(member_id,role,event_type,duration_ms) values ('telemetry-a','Staff','recovery_duration',1234)$$, 'bounded recovery duration accepted');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e003',true);
set local role authenticated;
select lives_ok($$insert into public.aitask_client_events(member_id,role,event_type) values ('telemetry-client','Client','chunk_load_failure')$$, 'client may insert their own event');
reset role;
select * from finish();
rollback;
