begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id::uuid,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
from (values
 ('00000000-0000-0000-0000-000000000981','review-boss@aitask.local'),
 ('00000000-0000-0000-0000-000000000982','review-worker@aitask.local'),
 ('00000000-0000-0000-0000-000000000983','review-hod@aitask.local'),
 ('00000000-0000-0000-0000-000000000984','review-pm@aitask.local'),
 ('00000000-0000-0000-0000-000000000985','review-client@aitask.local'),
 ('00000000-0000-0000-0000-000000000986','designer-hod@aitask.local')
) accounts(id,email);
insert into public.aitask_workspaces(id,name) values('pgtap-review-gate','Review gates');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name)
values
 ('gate-boss','pgtap-review-gate','00000000-0000-0000-0000-000000000981','Boss','review-boss@aitask.local','Project Manager','Management',array['Management'],true,null),
 ('gate-worker','pgtap-review-gate','00000000-0000-0000-0000-000000000982','Worker','review-worker@aitask.local','Staff','Video Editor',array['Video Editor','Designer'],false,null),
 ('gate-hod','pgtap-review-gate','00000000-0000-0000-0000-000000000983','HOD','review-hod@aitask.local','HOD','Video Editor',array['Video Editor'],false,null),
 ('gate-pm','pgtap-review-gate','00000000-0000-0000-0000-000000000984','PM','review-pm@aitask.local','Project Manager','Management',array['Management'],false,null),
 ('gate-designer-hod','pgtap-review-gate','00000000-0000-0000-0000-000000000986','Designer HOD','designer-hod@aitask.local','HOD','Designer',array['Designer'],false,null),
 ('gate-client','pgtap-review-gate','00000000-0000-0000-0000-000000000985','Client','review-client@aitask.local','Client','Client',array['Client'],false,'Gate Company');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('pgtap-review-gate','client','gate-company','{"id":"gate-company","clientName":"Gate Company","createdBy":"gate-pm"}'),
 ('pgtap-review-gate','service_cycle','gate-cycle','{"id":"gate-cycle","clientId":"gate-company","clientName":"Gate Company","planId":"gate-plan","status":"Published","periodStart":"2026-10-01","periodEnd":"2026-10-31","serviceItems":[{"id":"gate-service","name":"Design","quantity":1,"unitPriceMinor":0,"workflow":{"templateId":"gate-template","templateRevision":1,"steps":[{"id":"work-step","order":1,"department":"Designer","kind":"work","required":true,"clientVisible":false},{"id":"review-step","order":2,"department":"Video Editor","kind":"internal_review","required":true,"clientVisible":false},{"id":"optional-step","order":3,"department":"Designer","kind":"work","required":false,"clientVisible":false},{"id":"publish-step","order":4,"department":"Designer","kind":"publishing","required":true,"clientVisible":true}]}}]}'),
 ('pgtap-review-gate','deliverable','gate-output','{"id":"gate-output","clientId":"gate-company","clientName":"Gate Company","planId":"gate-plan","cycleId":"gate-cycle","serviceItemId":"gate-service","status":"Planned","taskIds":[]}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Generate through the real service endpoint, so metadata and identity guards
-- exercise the same ordered insert path used by the frontend.
set local role authenticated;
select is((public.aitask_generate_deliverable_task_chain('pgtap-review-gate',gen_random_uuid(),(
 select jsonb_agg(jsonb_build_object('kind','entity','action','insert','entityType','task','entityId',id,'expectedVersion',0,'data',jsonb_build_object(
  'id',id,'clientId','gate-company','clientName','Gate Company','serviceType','Design','title',title,'department',department,
  'createdBy','gate-boss','assignedTo','','attachmentLink',case when step='review-step' then '' else 'https://example.com/output.pdf' end,'serviceCycleId','gate-cycle','deliverableId','gate-output','generatedFromDeliverable',true,
  'workflowTemplateId','gate-template','workflowTemplateRevision',1,'workflowStepId',step,'workflowStepOrder',ordering,'workflowStepRequired',step<>'optional-step',
  'predecessorTaskIds',dependencies,'visibility',visibility,'status','Pending','isCompleted',false,'completionPercentage',0,'revisionCount',0,'clientApprovalStatus','Pending')) order by ordering)
 from (values ('gate-work','Hidden predecessor title','Designer','work-step',1,'[]'::jsonb,'internal'),
  ('gate-review','Internal review','Video Editor','review-step',2,'["gate-work"]'::jsonb,'internal'),
  ('gate-optional','Optional revision','Designer','optional-step',3,'["gate-review"]'::jsonb,'internal'),
  ('gate-publish','Publish','Designer','publish-step',4,'["gate-optional"]'::jsonb,'client-visible')) fixtures(id,title,department,step,ordering,dependencies,visibility)
))->>'ok')::boolean,true,'canonical workflow generation succeeds');
reset role;
update public.aitask_entities set data=data||'{"assignedTo":"gate-worker"}'::jsonb where workspace_id='pgtap-review-gate' and entity_type='task';

create function pg_temp.patch_task(p_id text,p_patch jsonb) returns jsonb language plpgsql as $$
declare record public.aitask_entities%rowtype;
begin
 select * into record from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_type='task' and entity_id=p_id;
 return public.aitask_execute_command('pgtap-review-gate',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','update','entityType','task','entityId',p_id,'expectedVersion',record.version,'data',record.data||p_patch)));
end; $$;

select is((pg_temp.patch_task('gate-optional','{"status":"Cancelled"}')->>'ok')::boolean,true,'optional revision can be skipped');
reset role;
select ok(not private.aitask_workflow_task_satisfied('pgtap-review-gate',(select data from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-optional')),'skipping revision cannot bypass unfinished required review');
set local role authenticated;
select ok(not has_function_privilege('anon','public.aitask_get_workflow_task_context(text)','EXECUTE'),'anonymous workflow summaries are denied');
select ok(not has_function_privilege('authenticated','private.aitask_workflow_dependencies_ready(text,jsonb)','EXECUTE'),'canonical dependency helper stays private');
select ok(not has_table_privilege('authenticated','private.aitask_internal_review_decisions','SELECT'),'browser cannot read the approval journal directly');
select ok(not has_table_privilege('authenticated','private.aitask_internal_review_decisions','INSERT'),'browser cannot create approval provenance');
select is((public.aitask_get_backend_capabilities('pgtap-review-gate')->>'schemaVersion')::integer,5,'new backend version requires review support');
select is((public.aitask_get_backend_capabilities('pgtap-review-gate')->>'workflowReviewGate')::boolean,true,'review capability is advertised');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-review','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'Staff cannot complete a review with unfinished work');
select is((pg_temp.patch_task('gate-review','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,false,'unfinished predecessors block submission too');
select is((pg_temp.patch_task('gate-work','{"status":"Completed","isCompleted":true,"completionPercentage":100}')->>'ok')::boolean,false,'assigned Staff cannot bypass HOD approval and PM finalization');
select is((pg_temp.patch_task('gate-work','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'assigned Staff submits ordinary workflow work');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000986',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-work','{"status":"Approved","isCompleted":false}')->>'ok')::boolean,true,'Designer HOD approves ordinary work at 80 percent');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000984',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-work','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'responsible PM finalizes ordinary work');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
set local role authenticated;
reset role;
-- Simulate unsigned JSON left by an older client; the new journal must reject
-- it as approval without altering production records or trusting a marker.
alter table public.aitask_entities disable trigger aitask_zz_guard_workflow_task;
update public.aitask_entities set data=data||jsonb_build_object('internalReview',jsonb_build_object('reviewedBy','gate-hod','reviewedAt',now()::text,'inputVersions',jsonb_build_array(jsonb_build_object('taskId','gate-work','outputVersion',2))))
where workspace_id='pgtap-review-gate' and entity_id='gate-review';
alter table public.aitask_entities enable trigger aitask_zz_guard_workflow_task;
select ok(not private.aitask_workflow_task_satisfied('pgtap-review-gate',(select data||'{"status":"Completed","isCompleted":true}'::jsonb from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review')),'legacy JSON cannot supply approval provenance');
set local role authenticated;
select is((pg_temp.patch_task('gate-review','{"status":"Completed","isCompleted":true,"internalReview":{"reviewedBy":"gate-hod"},"workflowStepKind":"work"}')->>'ok')::boolean,false,'forged reviewer and kind cannot bypass authorization');
select is((pg_temp.patch_task('gate-review','{"predecessorTaskIds":[],"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'removing predecessors cannot bypass the gate');
select is((pg_temp.patch_task('gate-review','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'Staff can submit completed work for internal review');
select is((pg_temp.patch_task('gate-publish','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'publication waits for a signed review');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',true);
update public.aitask_entities set data=data||'{"assignedTo":"gate-hod","status":"In Progress"}'::jsonb where workspace_id='pgtap-review-gate' and entity_id='gate-review';
select is((pg_temp.patch_task('gate-review','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'delegated review is submitted before department authorization checks');
update public.aitask_members set department='Designer',departments=array['Designer'] where workspace_id='pgtap-review-gate' and id='gate-hod';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000983',true);
set local role authenticated;
select ok(private.aitask_can_edit_task('pgtap-review-gate','gate-review'),'out-of-department HOD still has assigned-task edit authority');
select is((pg_temp.patch_task('gate-review','{"status":"Approved","isCompleted":false}')->>'ok')::boolean,false,'assigned HOD cannot approve outside their current department');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',true);
update public.aitask_members set department='Video Editor',departments=array['Video Editor'] where workspace_id='pgtap-review-gate' and id='gate-hod';
update public.aitask_entities set data=data||'{"assignedTo":"gate-worker","status":"In Progress"}'::jsonb where workspace_id='pgtap-review-gate' and entity_id='gate-review';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
select is((pg_temp.patch_task('gate-review','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'Staff resubmits after review delegation');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000983',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-work'),0,'HOD cannot read the predecessor outside their department');
select is(jsonb_array_length(public.aitask_get_workflow_task_context('pgtap-review-gate')->'tasks'),1,'summary includes only HOD-visible workflow tasks');
select is((public.aitask_get_workflow_task_context('pgtap-review-gate')->'tasks'->0->>'workflowDependenciesReady')::boolean,true,'summary safely confirms hidden dependency completion');
select ok(public.aitask_get_workflow_task_context('pgtap-review-gate')::text not like '%Hidden predecessor title%','summary does not expose hidden task details');
select is(public.aitask_get_workflow_task_context('pgtap-review-gate')->'tasks'->0->'reviewEvidence'->'links'->0->>'url','https://example.com/output.pdf','HOD can open completed input output without reading its private task');
select is((pg_temp.patch_task('gate-review','{"status":"Approved","isCompleted":false,"completionPercentage":80}')->>'ok')::boolean,true,'department HOD can sign off the completed predecessor');
select is((select data->'internalReview'->>'reviewedBy' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'gate-hod','server records the real reviewer');
reset role;
select is((select (data->'internalReview'->'inputVersions'->0->>'outputVersion')::integer from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),(select (data->>'workflowOutputVersion')::integer from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-work'),'approval is bound to the predecessor output version');
set local role authenticated;
reset role;
select is((select count(*)::integer from private.aitask_internal_review_decisions where workspace_id='pgtap-review-gate'),1,'one trusted decision is journaled');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000984',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-review','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'PM finalization preserves the HOD review');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-review','{"internalReview":{"reviewedBy":"gate-worker","reviewedAt":"fake","inputVersions":[]}}')->>'ok')::boolean,true,'routine update cannot replace the canonical decision');
select is((pg_temp.patch_task('gate-review','{"notes":"Private retrospective"}')->>'ok')::boolean,true,'Staff can save private completed-review notes without reapproving output');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'Completed','Private notes preserve the completed stage');
select is((select data->'internalReview'->>'reviewedBy' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'gate-hod','forged decision is ignored');
select is((pg_temp.patch_task('gate-work','{"dueDate":"2026-10-29"}')->>'ok')::boolean,true,'scheduling edits remain permitted');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'Completed','scheduling edits do not invalidate approved output');
select is((pg_temp.patch_task('gate-publish','{"status":"Waiting Approval","isCompleted":false}')->>'ok')::boolean,true,'publication submits after signed review');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000986',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-publish','{"status":"Approved","isCompleted":false}')->>'ok')::boolean,true,'department HOD approves publication');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000984',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-publish','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'PM completes publication after review');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',true);
select ok(not private.aitask_can_delete_task('pgtap-review-gate','gate-review'),'even Boss cannot delete a step from an active workflow');
select throws_ok($sql$update public.aitask_entities set data=jsonb_set(data,'{serviceItems,0,workflow,steps,1,kind}','"work"') where workspace_id='pgtap-review-gate' and entity_id='gate-cycle'$sql$,'23514','A generated workflow keeps its frozen service items.','changing the frozen kind cannot bypass review');
set local role authenticated;
select is((public.aitask_set_deliverable_status('pgtap-review-gate',gen_random_uuid(),'gate-output',
 (select version from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-output'),'Delivered')->>'ok')::boolean,true,'reviewed workflow can be confirmed delivered');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000984',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-work','{"status":"Revision","isCompleted":false}')->>'ok')::boolean,true,'PM returns upstream work for revision');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-work','{"attachmentLink":"https://example.com/revised.pdf"}')->>'ok')::boolean,true,'Staff can revise their output');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'Pending','upstream revision reopens the review');
select ok((select not(data ? 'internalReview') from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-review'),'revision removes the stale approval');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-publish'),'Pending','revision reopens downstream publication');
reset role;
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-review-gate' and entity_id='gate-output'),'In Progress','derived delivery progress reopens too');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000984',true);
set local role authenticated;
select is((pg_temp.patch_task('gate-review','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'responsible PM cannot replace HOD signoff or finalize unfinished review');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000985',true);
set local role authenticated;
select is((public.aitask_get_workflow_task_context('pgtap-review-gate')->>'ok')::boolean,false,'Client cannot read internal workflow context');
reset role;
select * from finish();
rollback;
