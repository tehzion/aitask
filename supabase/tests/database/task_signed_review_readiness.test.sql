begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
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
  return query select * from skip('Optional signed frozen-workflow gate is not installed on this database.'); return;
 end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('stage-signed-readiness-test','client','frozen-company','{"id":"frozen-company","clientName":"Stage Company","createdBy":"stage-pm"}'),
 ('stage-signed-readiness-test','service_cycle','frozen-cycle','{"id":"frozen-cycle","clientId":"frozen-company","clientName":"Stage Company","status":"Published","serviceItems":[{"id":"frozen-service","workflow":{"templateId":"frozen-template","templateRevision":1,"steps":[{"id":"review","kind":"internal_review","order":1,"required":true,"department":"Designer","clientVisible":false}]}}]}'),
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
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
 result:=public.aitask_execute_command('stage-signed-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',task_id,'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id),'data',payload||jsonb_build_object('status','Revision','isCompleted',false))));
 if not coalesce((result->>'ok')::boolean,false) then raise exception 'PM revision failed: %',result; end if;
 select data into payload from public.aitask_entities where workspace_id='stage-signed-readiness-test' and entity_id=task_id;
 if payload->>'completionPercentage'<>'50' or payload ? 'internalReview' then raise exception 'Revision retained an old signature or incorrect progress'; end if;
 return next pass('Staff submits frozen work, HOD signs at 80%, PM completes at 100% preserving the HOD signature, and revision invalidates it');
end;
$test$;
select * from pg_temp.signed_role_flow();
select * from finish();
rollback;
