begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005501','authenticated','authenticated','stage-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005502','authenticated','authenticated','stage-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005503','authenticated','authenticated','stage-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005504','authenticated','authenticated','stage-client@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('stage-signed-readiness-test','Stage progress test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name) values
('stage-pm','stage-signed-readiness-test','00000000-0000-0000-0000-000000005501','PM','stage-pm@aitask.local','Project Manager','Management',array['Management'],false,null),
('stage-hod','stage-signed-readiness-test','00000000-0000-0000-0000-000000005502','HOD','stage-hod@aitask.local','HOD','Designer',array['Designer'],false,null),
('stage-staff','stage-signed-readiness-test','00000000-0000-0000-0000-000000005503','Staff','stage-staff@aitask.local','Staff','Designer',array['Designer'],false,null),
('stage-client','stage-signed-readiness-test','00000000-0000-0000-0000-000000005504','Client','stage-client@aitask.local','Client','Client',array['Client'],false,'Stage Company');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('stage-signed-readiness-test','task','stage-task','{"id":"stage-task","clientName":"Stage Company","title":"Artwork","department":"Designer","assignedTo":"stage-hod","createdBy":"stage-pm","assignedBy":"stage-pm","status":"Pending","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"client-visible"}');
create function pg_temp.stage_update(p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId','stage-task',
 'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='stage-task' and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='stage-task' and entity_type='task') || p_patch)))
$$;

create function pg_temp.signed_role_flow() returns setof text language plpgsql as $test$
declare task_id text:='frozen-review'; payload jsonb; result jsonb; first_decision text; first_version text;
begin
 if to_regprocedure('private.aitask_guard_workflow_task()') is null then
  -- Preserve the seven signed-role assertions in the declared TAP plan.
  return query select * from skip('Optional signed frozen-workflow gate is not installed on this database.', 7); return;
 end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('stage-signed-readiness-test','client','frozen-company','{"id":"frozen-company","clientName":"Stage Company","createdBy":"stage-pm"}'),
 ('stage-signed-readiness-test','service_cycle','frozen-cycle','{"id":"frozen-cycle","clientId":"frozen-company","clientName":"Stage Company","status":"Published","serviceItems":[{"id":"frozen-service","workflow":{"templateId":"frozen-template","templateRevision":1,"steps":[{"id":"review","kind":"internal_review","order":1,"required":true,"department":"Designer","clientVisible":false},{"id":"work","kind":"work","order":2,"required":true,"department":"Designer","clientVisible":false}]}}]}'),
 ('stage-signed-readiness-test','deliverable','frozen-output','{"id":"frozen-output","clientId":"frozen-company","clientName":"Stage Company","cycleId":"frozen-cycle","serviceItemId":"frozen-service","status":"Planned","taskIds":[],"attachments":[]}');
 payload:='{"id":"frozen-review","title":"Frozen artwork review","clientId":"frozen-company","clientName":"Stage Company","serviceCycleId":"frozen-cycle","deliverableId":"frozen-output","department":"Designer","assignedTo":"stage-staff","createdBy":"stage-pm","status":"Pending","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"internal","generatedFromDeliverable":true,"workflowStepId":"review","workflowStepOrder":1,"workflowStepRequired":true,"workflowTemplateId":"frozen-template","workflowTemplateRevision":1,"predecessorTaskIds":[],"notes":null,"attachmentName":null,"attachmentLink":"https://example.com/artwork.pdf"}';
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('stage-signed-readiness-test','task',task_id,payload);
 for payload in select value from jsonb_array_elements('[{"actor":"00000000-0000-0000-0000-000000005503","status":"Waiting Approval"},{"actor":"00000000-0000-0000-0000-000000005502","status":"Approved"},{"actor":"00000000-0000-0000-0000-000000005501","status":"Completed"}]') loop
  perform set_config('request.jwt.claim.sub',payload->>'actor',true);
  result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',task_id,'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id),'data',((select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id) - case when payload->>'status'='Completed' then array['notes','attachmentName'] else array[]::text[] end)||jsonb_build_object('status',payload->>'status','isCompleted',payload->>'status'='Completed'))));
  if not coalesce((result->>'ok')::boolean,false) then raise exception 'Signed role transition % failed: %',payload->>'status',result; end if;
  if payload->>'status'='Approved' then
   select data->'internalReview'->>'decisionId',data->>'workflowOutputVersion' into first_decision,first_version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id;
   if first_decision is null then raise exception 'HOD 80 percent approval was not signed'; end if;
  end if;
 end loop;
 select data into payload from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id;
 if payload->'internalReview'->>'reviewedBy' is distinct from 'stage-hod' or payload->'internalReview'->>'decisionId' is distinct from first_decision or payload->>'workflowOutputVersion' is distinct from first_version then raise exception 'PM completion replaced or invalidated the HOD signature'; end if;
 if not private.aitask_workflow_task_satisfied('stage-signed-readiness-test',payload) then raise exception 'Final signed review did not satisfy the workflow'; end if;
 -- Ordinary downstream work must lose its approval when its input changes.
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('stage-signed-readiness-test','task','frozen-work',
 (payload-array['internalReview','reviewDecision','workflowOutputVersion','completedAt'])||jsonb_build_object('id','frozen-work','workflowStepId','work','workflowStepOrder',2,'predecessorTaskIds',jsonb_build_array(task_id),'status','Pending','isCompleted',false,'clientApprovalStatus','Pending'));
 for result in select value from jsonb_array_elements('[{"actor":"00000000-0000-0000-0000-000000005503","status":"Waiting Approval"},{"actor":"00000000-0000-0000-0000-000000005502","status":"Approved"}]') loop
  perform set_config('request.jwt.claim.sub',result->>'actor',true);
  if not coalesce((public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId','frozen-work','expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work')||jsonb_build_object('status',result->>'status','isCompleted',false))))->>'ok')::boolean,false) then raise exception 'Downstream setup failed'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',task_id,'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id),'data',payload||jsonb_build_object('status','Revision','isCompleted',false))));
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'PM revision failed: %',result; end if;
 select data into payload from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id;
 if payload->>'completionPercentage'<>'50' or payload ? 'internalReview' then raise exception 'Revision retained an old signature or incorrect progress'; end if;
 return next is((select data->>'status' from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'Pending','Upstream revision invalidates a downstream HOD approval at 80 percent');
 return next ok((select not (data ? 'internalReview') and data->>'clientApprovalStatus'='Pending' and not (data->>'isCompleted')::boolean from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'Invalidated work cannot retain customer acceptance or completion');
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
 result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId','frozen-work','expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work')||jsonb_build_object('status','Waiting Approval'))));
 return next is((result->>'ok')::boolean,false,'Staff cannot resubmit downstream work before its upstream revision is complete');
 for payload in select value from jsonb_array_elements('[{"task":"frozen-review","actor":"00000000-0000-0000-0000-000000005503","status":"Waiting Approval"},{"task":"frozen-review","actor":"00000000-0000-0000-0000-000000005502","status":"Approved"},{"task":"frozen-review","actor":"00000000-0000-0000-0000-000000005501","status":"Completed"},{"task":"frozen-work","actor":"00000000-0000-0000-0000-000000005503","status":"Waiting Approval"},{"task":"frozen-work","actor":"00000000-0000-0000-0000-000000005502","status":"Approved"},{"task":"frozen-work","actor":"00000000-0000-0000-0000-000000005501","status":"Completed"}]') loop
  perform set_config('request.jwt.claim.sub',payload->>'actor',true);
  result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',payload->>'task','expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=payload->>'task'),'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=payload->>'task')||jsonb_build_object('status',payload->>'status','isCompleted',payload->>'status'='Completed'))));
  if not coalesce((result->>'ok')::boolean,false) then raise exception 'Revised chain transition % failed: %',payload,result; end if;
 end loop;
 return next is((select data->>'completionPercentage' from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'100','Staff, HOD and PM can complete the revised downstream chain');
 -- Completed private notes remain editable and must not silently re-sign
 -- HOD approval or invalidate unchanged downstream output.
 select data->'internalReview'->>'decisionId' into first_decision from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
 result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',task_id,'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id),'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id)||jsonb_build_object('notes','Private follow-up after completion'))));
 return next is((result->>'ok')::boolean,true,'Assigned Staff can save private notes on completed signed work');
 return next ok((select data->'internalReview'->>'decisionId'=first_decision from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id) and (select data->>'status'='Completed' from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='frozen-work'),'Private notes preserve the HOD signature and downstream completion');
 return next pass('Staff submits frozen work, HOD signs at 80%, PM completes at 100% preserving the HOD signature, and revision invalidates it');
end;
$test$;
select * from pg_temp.signed_role_flow();

create function pg_temp.optional_chain_update(p_id text,p_status text) returns jsonb language sql as $$
 select public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_id,'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=p_id),'data',(select data from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=p_id)||jsonb_build_object('status',p_status,'isCompleted',false))))
$$;
create function pg_temp.optional_chain_restore() returns setof text language plpgsql as $test$
declare payload jsonb; result jsonb;
begin
 if to_regprocedure('private.aitask_workflow_task_satisfied(text,jsonb)') is null then return next skip('Signed workflow extension is not installed',3); return; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('stage-signed-readiness-test','service_cycle','optional-cycle','{"id":"optional-cycle","clientId":"frozen-company","clientName":"Stage Company","status":"Published","serviceItems":[{"id":"optional-service","workflow":{"templateId":"frozen-template","templateRevision":1,"steps":[{"id":"optional","kind":"work","order":1,"required":false,"department":"Designer","clientVisible":false},{"id":"work","kind":"work","order":2,"required":true,"department":"Designer","clientVisible":false}]}}]}'),
 ('stage-signed-readiness-test','deliverable','optional-output','{"id":"optional-output","clientId":"frozen-company","clientName":"Stage Company","cycleId":"optional-cycle","serviceItemId":"optional-service","status":"Planned","taskIds":[],"attachments":[]}');
 payload:='{"id":"optional-root","title":"Optional artwork","clientId":"frozen-company","clientName":"Stage Company","serviceCycleId":"optional-cycle","deliverableId":"optional-output","department":"Designer","assignedTo":"stage-staff","createdBy":"stage-pm","status":"Pending","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"internal","generatedFromDeliverable":true,"workflowStepId":"optional","workflowStepOrder":1,"workflowStepRequired":false,"workflowTemplateId":"frozen-template","workflowTemplateRevision":1,"predecessorTaskIds":[],"attachmentLink":"https://example.com/artwork.pdf"}';
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('stage-signed-readiness-test','task','optional-root',payload),('stage-signed-readiness-test','task','optional-child',payload||jsonb_build_object('id','optional-child','workflowStepId','work','workflowStepOrder',2,'workflowStepRequired',true,'predecessorTaskIds',jsonb_build_array('optional-root')));
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
 if not coalesce((pg_temp.optional_chain_update('optional-root','Cancelled')->>'ok')::boolean,false) or not coalesce((pg_temp.optional_chain_update('optional-child','Waiting Approval')->>'ok')::boolean,false) then raise exception 'Optional chain setup failed'; end if;
 return next is((pg_temp.optional_chain_update('optional-child','Pending')->>'ok')::boolean,false,'Staff cannot directly withdraw submitted downstream work');
 result:=pg_temp.optional_chain_update('optional-root','Pending');
 return next is((result->>'ok')::boolean,true,'Staff can restore an optional upstream task while the server invalidates submitted downstream work');
 return next is((select data->>'status' from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id='optional-child'),'Pending','Only the automatic nested reset withdraws downstream review');
end;
$test$;
select * from pg_temp.optional_chain_restore();
select * from finish();
rollback;
