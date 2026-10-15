begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
insert into public.aitask_workspaces(id,name) values('delivery-integrity-test','Delivery integrity regression');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('delivery-integrity-test','service_cycle','integrity-cycle','{"id":"integrity-cycle","clientId":"integrity-client","status":"Published","serviceItems":[]}'),
('delivery-integrity-test','deliverable','integrity-output','{"id":"integrity-output","clientId":"integrity-client","cycleId":"integrity-cycle","status":"Planned","taskIds":[],"attachments":[]}'),
('delivery-integrity-test','task','integrity-task','{"id":"integrity-task","clientId":"integrity-client","deliverableId":"integrity-output","status":"Pending","isCompleted":false}');

select throws_ok($$update public.aitask_entities set data=jsonb_set(data,'{status}','"Delivered"') where workspace_id='delivery-integrity-test' and entity_id='integrity-output'$$,
  '23514','Deliverable status must match the progress of its required tasks.','ordinary unfinished required tasks block direct delivery');
select throws_ok($$update public.aitask_entities set data=jsonb_set(data,'{status}','"Ready"') where workspace_id='delivery-integrity-test' and entity_id='integrity-output'$$,
  '23514','Deliverable status must match the progress of its required tasks.','ordinary unfinished required tasks block direct readiness');
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'Planned','rejected transitions leave status unchanged');

update public.aitask_entities set data=jsonb_set(data,'{status}','"In Progress"') where workspace_id='delivery-integrity-test' and entity_id='integrity-task';
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'In Progress','started task derives in-progress delivery');
update public.aitask_entities set data=data||'{"workflowStepRequired":false}' where workspace_id='delivery-integrity-test' and entity_id='integrity-task';
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'Ready','optional-only work does not block readiness');
select lives_ok($$update public.aitask_entities set data=jsonb_set(data,'{status}','"Delivered"') where workspace_id='delivery-integrity-test' and entity_id='integrity-output'$$,'optional-only work allows delivery');
select ok((select nullif(data->>'deliveredAt','') is not null from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'direct delivery receives a confirmation timestamp');
update public.aitask_entities set data=data||'{"workflowStepRequired":true}' where workspace_id='delivery-integrity-test' and entity_id='integrity-task';
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'In Progress','required unfinished work reopens a delivered output');
select ok((select not data ? 'deliveredAt' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-output'),'reopening removes the stale confirmation timestamp');
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='integrity-cycle'),'Published','reopened output reopens its cycle');

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('delivery-integrity-test','service_cycle','frozen-cycle','{"id":"frozen-cycle","clientId":"integrity-client","status":"Published","serviceItems":[{"id":"frozen-service","workflow":{"templateId":"frozen-workflow","templateRevision":1,"steps":[{"id":"required-step","required":true,"kind":"work"}]}}]}'),
('delivery-integrity-test','deliverable','frozen-output','{"id":"frozen-output","clientId":"integrity-client","cycleId":"frozen-cycle","serviceItemId":"frozen-service","status":"Planned","taskIds":[],"attachments":[]}');
select throws_ok($$update public.aitask_entities set data=jsonb_set(data,'{status}','"Delivered"') where workspace_id='delivery-integrity-test' and entity_id='frozen-output'$$,
  '23514','Deliverable status must match the progress of its required tasks.','ungenerated required workflow blocks direct delivery');
select throws_ok($$update public.aitask_entities set data=jsonb_set(data,'{status}','"Ready"') where workspace_id='delivery-integrity-test' and entity_id='frozen-output'$$,
  '23514','Deliverable status must match the progress of its required tasks.','ungenerated required workflow blocks direct readiness');

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('delivery-integrity-test','service_cycle','cancelled-cycle','{"id":"cancelled-cycle","clientId":"integrity-client","status":"Cancelled","serviceItems":[]}'),
('delivery-integrity-test','deliverable','cancelled-output','{"id":"cancelled-output","clientId":"integrity-client","cycleId":"cancelled-cycle","status":"Delivered","taskIds":[],"attachments":[]}');
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='cancelled-cycle'),'Cancelled','confirmed output does not republish a cancelled cycle');
update public.aitask_entities set data=jsonb_set(data,'{updatedAt}',to_jsonb(now()::text)) where workspace_id='delivery-integrity-test' and entity_id='cancelled-output';
select is((select data->>'status' from public.aitask_entities where workspace_id='delivery-integrity-test' and entity_id='cancelled-cycle'),'Cancelled','later output edits keep the cycle cancelled');
select * from finish();
rollback;
