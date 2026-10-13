begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001301','authenticated','authenticated','staff-workflow@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001302','authenticated','authenticated','owner-workflow@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001303','authenticated','authenticated','client-workflow@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001304','authenticated','authenticated','hod-workflow@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('staff-workflow-test','Staff workflow test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('workflow-staff','staff-workflow-test','00000000-0000-0000-0000-000000001301','Staff','staff-workflow@aitask.local','Staff','Designer',array['Designer'],false),
('workflow-hod','staff-workflow-test','00000000-0000-0000-0000-000000001304','HOD','hod-workflow@aitask.local','HOD','Designer',array['Designer'],false),
('workflow-owner','staff-workflow-test','00000000-0000-0000-0000-000000001302','Owner','owner-workflow@aitask.local','Project Manager','Designer',array['Designer'],true);
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,client_name) values ('workflow-client','staff-workflow-test','00000000-0000-0000-0000-000000001303','Client','client-workflow@aitask.local','Client','Client',array['Client'],'Company');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('staff-workflow-test','task','workflow-task','{"id":"workflow-task","clientId":"company","clientName":"Company","title":"Artwork","department":"Designer","assignedTo":"workflow-staff","createdBy":"workflow-owner","assignedBy":"workflow-owner","status":"Pending","isCompleted":false,"visibility":"internal","deliverableId":"output"}'),
('staff-workflow-test','task','workflow-admin-task','{"id":"workflow-admin-task","clientName":"Company","title":"Meeting notes","department":"Designer","assignedTo":"workflow-staff","createdBy":"workflow-owner","status":"Pending","isCompleted":false,"visibility":"internal"}');
-- Exercise the actual command/RLS boundary using the current canonical row.
create function pg_temp.work_update(p_id text, p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('staff-workflow-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId',p_id,
 'expectedVersion',(select version from public.aitask_entities where workspace_id='staff-workflow-test' and entity_type='task' and entity_id=p_id),
 'data',(select data from public.aitask_entities where workspace_id='staff-workflow-test' and entity_type='task' and entity_id=p_id) || p_patch)))
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((pg_temp.work_update('workflow-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'RPC rejects linked completion without evidence');
select is((pg_temp.work_update('workflow-task','{"status":"Waiting Approval","attachmentLink":"https://user:pass@example.com/file"}')->>'ok')::boolean,false,'RPC rejects credential-bearing evidence');
select is((pg_temp.work_update('workflow-task','{"workState":{"acceptedBy":"forged","acceptedAt":"2000-01-01T00:00:00Z"}}')->>'ok')::boolean,true,'assignee can accept with actor/time stamped server-side');
select is((select data->'workState'->>'acceptedBy' from public.aitask_entities where entity_id='workflow-task'),'workflow-staff','acceptance cannot forge another actor');
select isnt((select data->'workState'->>'acceptedAt' from public.aitask_entities where entity_id='workflow-task'),'2000-01-01T00:00:00Z','acceptance cannot forge the timestamp');
select is((pg_temp.work_update('workflow-task','{"workState":{"acceptedBy":"workflow-staff","blocker":{"reason":"Need assets","openedBy":"forged","openedAt":"2000-01-01T00:00:00Z"}},"workHistory":[]}')->>'ok')::boolean,true,'assignee can request help without erasing history');
select is((select data->'workState'->'blocker'->>'openedBy' from public.aitask_entities where entity_id='workflow-task'),'workflow-staff','blocker is attributed to authenticated actor');
select is((select jsonb_array_length(data->'workHistory') from public.aitask_entities where entity_id='workflow-task'),2,'provided history cannot erase server events');
select is((pg_temp.work_update('workflow-task','{"status":"Waiting Approval","attachmentLink":"https://example.com/artwork"}')->>'ok')::boolean,true,'evidence permits review');
select is((select data->'workState'->>'reviewRequestedBy' from public.aitask_entities where entity_id='workflow-task'),'workflow-staff','review submission has authenticated actor');
select is((pg_temp.work_update('workflow-admin-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'Staff administrative work still requires final PM completion');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001302',true);
set local role authenticated;
select is((pg_temp.work_update('workflow-task','{"assignedTo":"workflow-owner"}')->>'ok')::boolean,true,'authorized reassignment succeeds');
select ok((select not (data->'workState' ? 'acceptedBy') and not (data->'workState' ? 'blocker') from public.aitask_entities where entity_id='workflow-task'),'reassignment clears old acceptance and blockers');
select is((pg_temp.work_update('workflow-admin-task','{"workState":{"acceptedBy":"workflow-staff"}}')->>'ok')::boolean,false,'owner cannot accept another member’s closed task');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001302',true);
update public.aitask_entities set data=data || '{"visibility":"client-visible","status":"Waiting Approval","clientApprovalStatus":"Pending","revisionCount":3,"completionPercentage":100}'::jsonb where workspace_id='staff-workflow-test' and entity_id='workflow-task';
update public.aitask_entities set data=data || '{"status":"Approved","isCompleted":false,"completionPercentage":80}'::jsonb where workspace_id='staff-workflow-test' and entity_id='workflow-task';
select set_config('aitask.test_task_version',(select version::text from public.aitask_entities where entity_id='workflow-task'),true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001303',true);
set local role authenticated;
create temp table client_review_result as select public.aitask_execute_command('staff-workflow-test',gen_random_uuid(),'approval.review',jsonb_build_array(
 jsonb_build_object('kind','entity','action','update','entityType','task','entityId','workflow-task','expectedVersion',current_setting('aitask.test_task_version')::bigint,
 'data',jsonb_build_object('id','workflow-task','clientApprovalStatus','Approved','status','Completed','isCompleted',true,'completionPercentage',100)),
 jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId','workflow-approval','expectedVersion',0,'parentId','workflow-task',
 'data',jsonb_build_object('id','workflow-approval','taskId','workflow-task','userId','workflow-client','status','Approved','createdAt',now()::text))
)) as result;
select is((select (result->>'ok')::boolean from client_review_result),true,'projected client approval does not need the hidden revision counter');
select diag(result::text) from client_review_result where result->>'ok' <> 'true';
reset role;
select is((select data->>'revisionCount' from public.aitask_entities where entity_id='workflow-task'),'3','client approval preserves canonical revision count');
select ok((select data->>'completedAt' is null and data->>'completionPercentage'='80' and jsonb_array_length(data->'workHistory') > 2 from public.aitask_entities where entity_id='workflow-task'),'customer acceptance remains 80 percent and preserves internal history');
select * from finish();
rollback;
