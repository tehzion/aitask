begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005361','authenticated','authenticated','handoff-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005362','authenticated','authenticated','handoff-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005363','authenticated','authenticated','handoff-other@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('hod-handoff-test','HOD handoff test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('handoff-staff','hod-handoff-test','00000000-0000-0000-0000-000000005361','Staff','handoff-staff@aitask.local','Staff','Designer',array['Designer'],false),
('handoff-hod','hod-handoff-test','00000000-0000-0000-0000-000000005362','HOD','handoff-hod@aitask.local','HOD','Designer',array['Designer'],false),
('handoff-other','hod-handoff-test','00000000-0000-0000-0000-000000005363','Other HOD','handoff-other@aitask.local','HOD','Video Editor',array['Video Editor'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','handoff-task','{"id":"handoff-task","clientName":"Company","title":"Artwork","department":"Designer","assignedTo":"handoff-staff","createdBy":"handoff-hod","assignedBy":"handoff-hod","status":"In Progress","isCompleted":false,"visibility":"internal"}');
create function pg_temp.submit_work(p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('hod-handoff-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId','handoff-task',
 'expectedVersion',(select version from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='handoff-task' and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='handoff-task' and entity_type='task') || p_patch)))
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005361',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((pg_temp.submit_work('{"status":"Waiting Approval","completionPercentage":100}')->>'ok')::boolean,true,'Staff submission persists through the authenticated command');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),1,'one HOD handoff generated');
select is((select data->>'targetUserId' from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),'handoff-hod','only department HOD receives handoff');
select is((select data->'route'->>'entityId' from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),'handoff-task','notification opens submitted task');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),1,'HOD can read the saved review notification through RLS');
select is((select data->>'status' from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='task'),'Waiting Approval','HOD can read the pending task through RLS');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005363',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),0,'other department cannot read the handoff');
select is((pg_temp.submit_work('{"status":"Completed"}')->>'ok')::boolean,false,'unrelated HOD cannot change submitted task');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005361',true);
set local role authenticated;
select is((pg_temp.submit_work('{"notes":"Clarified review brief"}')->>'ok')::boolean,true,'unrelated edits while waiting still save');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),1,'ordinary edits do not repeat handoff');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select pg_temp.submit_work('{"status":"In Progress"}');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005361',true);
set local role authenticated;
select pg_temp.submit_work('{"status":"Waiting Approval"}');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='hod-handoff-test' and entity_type='notification'),2,'resubmission produces a new review handoff');
select * from finish();
rollback;
