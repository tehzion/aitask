begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005501','authenticated','authenticated','stage-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005502','authenticated','authenticated','stage-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005503','authenticated','authenticated','stage-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005504','authenticated','authenticated','stage-client@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('stage-progress-test','Stage progress test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name) values
('stage-pm','stage-progress-test','00000000-0000-0000-0000-000000005501','PM','stage-pm@aitask.local','Project Manager','Management',array['Management'],false,null),
('stage-hod','stage-progress-test','00000000-0000-0000-0000-000000005502','HOD','stage-hod@aitask.local','HOD','Designer',array['Designer'],false,null),
('stage-staff','stage-progress-test','00000000-0000-0000-0000-000000005503','Staff','stage-staff@aitask.local','Staff','Designer',array['Designer'],false,null),
('stage-client','stage-progress-test','00000000-0000-0000-0000-000000005504','Client','stage-client@aitask.local','Client','Client',array['Client'],false,'Stage Company');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('stage-progress-test','task','stage-task','{"id":"stage-task","clientName":"Stage Company","title":"Artwork","department":"Designer","assignedTo":"stage-hod","createdBy":"stage-pm","assignedBy":"stage-pm","status":"Pending","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"client-visible"}');
create function pg_temp.stage_update(p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('stage-progress-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId','stage-task',
 'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-progress-test' and entity_id='stage-task' and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='stage-progress-test' and entity_id='stage-task' and entity_type='task') || p_patch)))
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
set local role authenticated;
select is((pg_temp.stage_update('{"notes":"Assignment brief"}')->>'ok')::boolean,true,'PM assignment saves');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),10,'assigned to HOD is 10 percent');
select is((pg_temp.stage_update('{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'PM cannot skip HOD approval');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select is((pg_temp.stage_update('{"assignedTo":"stage-staff"}')->>'ok')::boolean,true,'HOD delegates to Staff');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),20,'assigned to Staff is 20 percent');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select is((pg_temp.stage_update('{"workState":{"acceptedBy":"stage-staff"}}')->>'ok')::boolean,true,'Staff accepts assignment');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),30,'accepted work is 30 percent');
select is((pg_temp.stage_update('{"status":"In Progress"}')->>'ok')::boolean,true,'Staff starts accepted work');
select is((pg_temp.stage_update('{"status":"Waiting Approval","completionPercentage":100}')->>'ok')::boolean,true,'Staff submits for review');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),60,'cached 100 percent review payload is normalized to 60');
select is((pg_temp.stage_update('{"status":"Approved","completionPercentage":80}')->>'ok')::boolean,false,'Staff cannot approve their submission');
select is((pg_temp.stage_update('{"clientApprovalStatus":"Approved"}')->>'ok')::boolean,false,'Staff cannot forge customer acceptance');
select is((pg_temp.stage_update('{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'Staff cannot finalize work');
select is((pg_temp.stage_update('{"status":"In Progress","clientApprovalStatus":"Rejected","revisionCount":1}')->>'ok')::boolean,false,'Staff cannot perform a reviewer rejection');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"In Progress"}')->>'ok')::boolean,true,'HOD returns work for revision');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),50,'revision drops to 50 percent');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select pg_temp.stage_update('{"status":"Waiting Approval","clientApprovalStatus":"Pending"}');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"Approved"}')->>'ok')::boolean,true,'HOD approves resubmitted work');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),80,'HOD approval is 80 percent');
select is((pg_temp.stage_update('{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'HOD cannot perform PM final completion');
reset role;
select set_config('aitask.stage_version',(select version::text from public.aitask_entities where entity_id='stage-task'),true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005504',true);
set local role authenticated;
select is((public.aitask_execute_command('stage-progress-test',gen_random_uuid(),'approval.review',jsonb_build_array(
 jsonb_build_object('kind','entity','action','update','entityType','task','entityId','stage-task','expectedVersion',current_setting('aitask.stage_version')::bigint,'data',jsonb_build_object('id','stage-task','clientApprovalStatus','Approved','status','Approved','isCompleted',false,'completionPercentage',80)),
 jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId','stage-approval','expectedVersion',0,'parentId','stage-task','data',jsonb_build_object('id','stage-approval','taskId','stage-task','userId','stage-client','status','Approved','createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
))->>'ok')::boolean,true,'Client acceptance saves without completing the task');
reset role;
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),80,'customer OK stays 80 pending PM confirmation');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'PM confirms final completion');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),100,'PM completion is 100 percent');
select ok((select data->>'completedAt' is not null from public.aitask_entities where entity_id='stage-task'),'final completion records its timestamp');
reset role;
select * from finish();
rollback;
