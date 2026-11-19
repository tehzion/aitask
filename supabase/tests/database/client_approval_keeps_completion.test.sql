begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008401','authenticated','authenticated','keep-client@aitask.local','','{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-keep-complete','Keep completion');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,client_name,department,departments,permissions)
values ('keep-client','pgtap-keep-complete','00000000-0000-0000-0000-000000008401','Customer','keep-client@aitask.local','Client','Keep Co','Client',array['Client'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-keep-complete','client','keep-co','{"id":"keep-co","clientName":"Keep Co"}'),
('pgtap-keep-complete','task','done-task','{"id":"done-task","clientId":"keep-co","clientName":"Keep Co","title":"Finished","assignedTo":"nobody","visibility":"client-visible","status":"Completed","isCompleted":true,"completedAt":"2026-11-10T08:00:00.000Z","completionPercentage":100,"revisionCount":1,"clientApprovalStatus":"Pending"}'),
('pgtap-keep-complete','task','ready-task','{"id":"ready-task","clientId":"keep-co","clientName":"Keep Co","title":"Ready","assignedTo":"nobody","visibility":"client-visible","status":"Approved","isCompleted":false,"completionPercentage":80,"revisionCount":0,"clientApprovalStatus":"Pending"}'),
('pgtap-keep-complete','task','redo-task','{"id":"redo-task","clientId":"keep-co","clientName":"Keep Co","title":"Redo","assignedTo":"nobody","visibility":"client-visible","status":"Completed","isCompleted":true,"completedAt":"2026-11-10T08:00:00.000Z","completionPercentage":100,"revisionCount":2,"clientApprovalStatus":"Pending"}');

create function pg_temp.ops(p_task text, p_status text, p_final jsonb) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_task,'expectedVersion',version,
      'data',private.aitask_client_task_projection(data) || p_final),
    jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId',p_task||'-event','parentId',p_task,
      'data',jsonb_build_object('id',p_task||'-event','taskId',p_task,'userId','keep-client','status',p_status,'note','ok')))
  from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id=p_task;
$$;

-- The server stamps the completion date when a task is first stored, so remember it.
select set_config('pgtap.done_at',(select data->>'completedAt' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008401',true);
select set_config('pgtap.ops_done', pg_temp.ops('done-task','Approved','{"status":"Completed","isCompleted":true,"completionPercentage":100,"clientApprovalStatus":"Approved"}')::text, true);
select set_config('pgtap.ops_ready', pg_temp.ops('ready-task','Approved','{"status":"Approved","isCompleted":false,"completionPercentage":80,"clientApprovalStatus":"Approved"}')::text, true);
select set_config('pgtap.ops_redo', pg_temp.ops('redo-task','Rejected','{"status":"In Progress","isCompleted":false,"completionPercentage":50,"revisionCount":3,"clientApprovalStatus":"Rejected"}')::text, true);
set local role authenticated;
select is((public.aitask_execute_command('pgtap-keep-complete',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_done')::jsonb)->>'ok')::boolean,true,'accepting finished work saves');
select is((public.aitask_execute_command('pgtap-keep-complete',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_ready')::jsonb)->>'ok')::boolean,true,'accepting work that is ready for the client saves');
select is((public.aitask_execute_command('pgtap-keep-complete',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_redo')::jsonb)->>'ok')::boolean,true,'asking for changes on finished work saves');
reset role;

select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),'Completed','accepting finished work leaves it completed');
select is((select (data->>'isCompleted')::boolean from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),true,'it is still marked completed');
select is((select data->>'completedAt' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),current_setting('pgtap.done_at'),'the real completion date is kept');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),100,'progress stays at 100%');
select is((select data->>'clientApprovalStatus' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),'Approved','the client acceptance is recorded');
select is((select (data->>'revisionCount')::integer from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='done-task'),1,'an acceptance does not add a revision');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='ready-task'),'Approved','accepting work that was only ready stays Approved, waiting for the PM to complete it');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='ready-task'),80,'and sits at 80%');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='redo-task'),'In Progress','a change request reopens finished work');
select is((select data->>'completedAt' from public.aitask_entities where workspace_id='pgtap-keep-complete' and entity_id='redo-task') is null,true,'a reopened task has no completion date');

select * from finish();
rollback;
