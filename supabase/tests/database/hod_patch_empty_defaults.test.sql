begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002801','authenticated','authenticated','defaults-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002802','authenticated','authenticated','defaults-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-defaults','HOD patch empty defaults');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,custom_role_id,permissions) values
('defaults-hod','pgtap-hod-defaults','00000000-0000-0000-0000-000000002801','HOD','defaults-hod@aitask.local','HOD','Designer',array['Designer'],null,'{}'),
('defaults-staff','pgtap-hod-defaults','00000000-0000-0000-0000-000000002802','Staff','defaults-staff@aitask.local','Staff','Designer',array['Designer'],null,'{}');
-- Ordinary tasks are stored without the optional workflow fields.
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-hod-defaults','task','defaults-task','{"id":"defaults-task","title":"Defaults artwork","clientName":"Defaults Co","department":"Designer","assignedTo":"defaults-staff","createdBy":"defaults-staff","status":"Waiting Approval","approvalMode":"hod","isCompleted":false,"completionPercentage":60,"clientApprovalStatus":"Pending","visibility":"internal"}');

create function pg_temp.hod_update(p_patch jsonb) returns jsonb language sql as $$
  select public.aitask_execute_command('pgtap-hod-defaults',gen_random_uuid(),'task.update',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId','defaults-task','expectedVersion',version,
      'data',data || p_patch)))
  from public.aitask_entities where workspace_id='pgtap-hod-defaults' and entity_type='task' and entity_id='defaults-task';
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002801',true);
set local role authenticated;

-- The app serializes absent optional fields with their defaults, including
-- requiresInternalApproval: true and recurrenceFrequency: "None".
select is((pg_temp.hod_update('{"predecessorTaskIds":[],"generatedFromDeliverable":false,"requiresInternalApproval":true,"recurrenceFrequency":"None","status":"Approved"}')->>'ok')::boolean,true,'HOD approval with empty-default workflow fields saves');
reset role;
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-hod-defaults' and entity_id='defaults-task'),'Approved','the HOD approval is stored');
set local role authenticated;
select is((pg_temp.hod_update('{"generatedFromDeliverable":true}')->>'ok')::boolean,false,'HOD still cannot mark a task as deliverable-generated');
select is((pg_temp.hod_update('{"predecessorTaskIds":["other-task"]}')->>'ok')::boolean,false,'HOD still cannot add workflow dependencies');
select is((pg_temp.hod_update('{"requiresInternalApproval":false}')->>'ok')::boolean,false,'HOD still cannot switch off internal approval');
reset role;

select * from finish();
rollback;
