begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','fallback-'||n||'@aitask.local','',now(),'{}','{}',now(),now() from generate_series(1401,1404) n;
insert into public.aitask_workspaces(id,name) values('pgtap-operation-fallback','PM fallback');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments)
select id,'pgtap-operation-fallback',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,id,'fallback-'||n||'@aitask.local',role,case when id='fallback-worker' then 'Video Editor' else department end,case when id='fallback-worker' then array['Operation','Video Editor'] else array[department] end
from (values ('fallback-worker',1401,'Staff','Operation'),('fallback-pm',1402,'Project Manager','Management'),('fallback-other',1403,'Project Manager','Management'),('fallback-hod',1404,'HOD','Video Editor')) fixtures(id,n,role,department);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-operation-fallback','client','fallback-client','{"id":"fallback-client","clientName":"Fallback Co","createdBy":"fallback-pm"}'),
('pgtap-operation-fallback','task','fallback-task','{"id":"fallback-task","clientName":"Fallback Co","title":"Design","department":"Operation","assignedTo":"fallback-worker","createdBy":"fallback-worker","status":"In Progress","isCompleted":false,"visibility":"internal"}'),
('pgtap-operation-fallback','service_cycle','fallback-cycle','{"id":"fallback-cycle","clientId":"fallback-client","clientName":"Fallback Co","planId":"fallback-plan","status":"Published","periodStart":"2026-10-01","periodEnd":"2026-10-31","serviceItems":[{"id":"fallback-service","name":"Review","quantity":1,"unitPriceMinor":0,"workflow":{"templateId":"fallback-template","templateRevision":1,"steps":[{"id":"review","order":1,"department":"Operation","kind":"internal_review","required":true,"clientVisible":false}]}}]}'),
('pgtap-operation-fallback','deliverable','fallback-output','{"id":"fallback-output","clientId":"fallback-client","clientName":"Fallback Co","planId":"fallback-plan","cycleId":"fallback-cycle","serviceItemId":"fallback-service","status":"Planned","taskIds":[]}');
create function pg_temp.patch_task(p_id text,p_patch jsonb) returns jsonb language sql as $$
select public.aitask_execute_command('pgtap-operation-fallback',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_id,'expectedVersion',version,'data',data||p_patch)))
from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_type='task' and entity_id=p_id;
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001401',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-task','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'Staff submits Operation work without an HOD');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_type='notification' and data->>'targetUserId'='fallback-pm'),1,'responsible PM receives the handoff');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_type='notification' and data->>'targetUserId'='fallback-other'),0,'unrelated PM receives no handoff');
select ok(not has_function_privilege('authenticated','private.aitask_task_reviewers(text,jsonb)','EXECUTE'),'reviewer enumeration stays private');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001403',true);
set local role authenticated;
select is(jsonb_array_length(public.aitask_get_workflow_task_context('pgtap-operation-fallback')->'tasks'),0,'unrelated PM receives no task context');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001402',true);
set local role authenticated;
select is((public.aitask_get_workflow_task_context('pgtap-operation-fallback')->'tasks'->0->'reviewAccess'->>'canApprove')::boolean,true,'responsible PM receives canonical approval permission');
select is((pg_temp.patch_task('fallback-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'PM must still approve before finalizing');
select is((pg_temp.patch_task('fallback-task','{"status":"Approved","isCompleted":false}')->>'ok')::boolean,true,'responsible PM approves Operation work');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_id='fallback-task'),80,'PM review remains at 80 percent');
select is((pg_temp.patch_task('fallback-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'PM separately confirms final completion');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('pgtap-operation-fallback','task','fallback-video','{"id":"fallback-video","clientName":"Fallback Co","title":"Video","department":"Video Editor","assignedTo":"fallback-worker","createdBy":"fallback-pm","status":"In Progress","isCompleted":false,"visibility":"internal"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001401',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-video','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'Staff submits other-department work to its HOD');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001402',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-video','{"status":"Approved","department":"Operation"}')->>'ok')::boolean,false,'PM cannot move another department into the fallback while approving');
select is((select data->>'department' from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_id='fallback-video'),'Video Editor','Denied approval preserves the submitted department');
select is((public.aitask_generate_deliverable_task_chain('pgtap-operation-fallback',gen_random_uuid(),jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','task','entityId','fallback-review','expectedVersion',0,'data',
'{"id":"fallback-review","clientId":"fallback-client","clientName":"Fallback Co","serviceType":"Design","title":"Review","department":"Operation","createdBy":"fallback-pm","assignedTo":"","attachmentLink":"https://example.com/output.pdf","serviceCycleId":"fallback-cycle","deliverableId":"fallback-output","generatedFromDeliverable":true,"workflowTemplateId":"fallback-template","workflowTemplateRevision":1,"workflowStepId":"review","workflowStepOrder":1,"workflowStepRequired":true,"predecessorTaskIds":[],"visibility":"internal","status":"Pending","isCompleted":false,"completionPercentage":0,"revisionCount":0,"clientApprovalStatus":"Pending"}'::jsonb)))->>'ok')::boolean,true,'generate Operation review workflow');
select is((pg_temp.patch_task('fallback-review','{"assignedTo":"fallback-worker"}')->>'ok')::boolean,true,'PM assigns generated review to Staff');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001401',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-review','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'Staff submits a frozen Operation review');
select is((pg_temp.patch_task('fallback-review','{"status":"Approved"}')->>'ok')::boolean,false,'Staff cannot approve themselves');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001402',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-review','{"status":"Approved","isCompleted":false}')->>'ok')::boolean,true,'portfolio PM can sign frozen Operation review');
select is((select data->'internalReview'->>'reviewedBy' from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_id='fallback-review'),'fallback-pm','canonical journal stamps the PM');
select ok((select bool_or(item->'internalReview'->>'reviewedBy'='fallback-pm') from jsonb_array_elements(public.aitask_get_workflow_task_context('pgtap-operation-fallback')->'tasks') item where item->>'id'='fallback-review'),'signed review is visible before final completion');
select is((pg_temp.patch_task('fallback-review','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'PM finalization preserves signed review');
select is((pg_temp.patch_task('fallback-task','{"status":"In Progress","isCompleted":false}')->>'ok')::boolean,true,'PM may return work for revision');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set department='Operation',departments=array['Operation'] where workspace_id='pgtap-operation-fallback' and id='fallback-hod';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001401',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-task','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'Staff resubmits after HOD configuration');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-operation-fallback' and entity_type='notification' and parent_id='fallback-task' and data->>'targetUserId'='fallback-hod'),1,'configured HOD receives the next handoff');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001402',true);
set local role authenticated;
select is((pg_temp.patch_task('fallback-task','{"status":"Approved"}')->>'ok')::boolean,true,'responsible PM can approve when an Operation HOD is configured');
reset role;
select * from finish();
rollback;
