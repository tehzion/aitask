begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000a801','authenticated','authenticated','service-binding@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('service-command-binding','Service command binding');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values('service-binding-pm','service-command-binding','00000000-0000-0000-0000-00000000a801','Binding PM','service-binding@aitask.local','Project Manager','Management',array['Management'],true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data,client_id) values
('service-command-binding','client','binding-client','{"id":"binding-client","clientName":"Binding Co","createdBy":"service-binding-pm"}','binding-client'),
('service-command-binding','client_plan','binding-plan','{"id":"binding-plan","clientId":"binding-client","clientName":"Binding Co","status":"Draft","name":"Binding plan"}','binding-client'),
('service-command-binding','service_cycle','binding-cycle','{"id":"binding-cycle","clientId":"binding-client","clientName":"Binding Co","planId":"binding-plan","status":"Draft"}','binding-client'),
('service-command-binding','deliverable','binding-deliverable','{"id":"binding-deliverable","clientId":"binding-client","clientName":"Binding Co","cycleId":"binding-cycle","status":"Planned"}','binding-client');

create function pg_temp.binding_command(p_type text, p_entity_type text, p_entity_id text, p_data jsonb) returns jsonb language sql as $$
  select public.aitask_execute_service_command(
    'service-command-binding', gen_random_uuid(), p_type,
    jsonb_build_array(jsonb_build_object(
      'kind','entity','action','update','entityType',p_entity_type,'entityId',p_entity_id,
      'expectedVersion',(select version from public.aitask_entities where workspace_id='service-command-binding' and entity_type=p_entity_type and entity_id=p_entity_id),
      'data',p_data
    )), null)
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a801',true);
set local role authenticated;

select is((pg_temp.binding_command(
  'service_cycle.manage','service_cycle','binding-cycle',
  '{"id":"binding-cycle","clientId":"binding-client","clientName":"Binding Co","planId":"binding-plan","status":"Published"}'::jsonb
)->>'ok')::boolean,true,'matching cycle command can publish a Draft cycle');

select is((pg_temp.binding_command(
  'deliverable.manage','service_cycle','binding-cycle',
  '{"id":"binding-cycle","clientId":"binding-client","clientName":"Binding Co","planId":"binding-plan","status":"Draft"}'::jsonb
)->>'code'),'VALIDATION','derived deliverable command cannot bypass cycle transition rules');

select is((pg_temp.binding_command(
  'client_plan.manage','service_cycle','binding-cycle',
  '{"id":"binding-cycle","clientId":"binding-client","clientName":"Binding Co","planId":"binding-plan","status":"Cancelled"}'::jsonb
)->>'code'),'VALIDATION','client-plan command cannot mutate a service cycle');

select is((pg_temp.binding_command(
  'service_cycle.manage','client_plan','binding-plan',
  '{"id":"binding-plan","clientId":"binding-client","clientName":"Binding Co","status":"Draft","name":"forged"}'::jsonb
)->>'code'),'VALIDATION','cycle command cannot mutate a client plan');

select is((pg_temp.binding_command(
  'client_plan.manage','client_plan','binding-plan',
  '{"id":"binding-plan","clientId":"binding-client","clientName":"Binding Co","status":"Draft","name":"updated"}'::jsonb
)->>'ok')::boolean,true,'matching client-plan command remains valid');

select is((pg_temp.binding_command(
  'deliverable.workflow.generate','deliverable','binding-deliverable',
  '{"id":"binding-deliverable","clientId":"binding-client","clientName":"Binding Co","cycleId":"binding-cycle","status":"Planned","taskIds":["binding-generated-task"]}'::jsonb
)->>'ok')::boolean,true,'workflow generation can record generated task ids on its deliverable');

select is((pg_temp.binding_command(
  'deliverable.workflow.generate','service_cycle','binding-cycle',
  '{"id":"binding-cycle","clientId":"binding-client","clientName":"Binding Co","planId":"binding-plan","status":"Cancelled"}'::jsonb
)->>'code'),'VALIDATION','workflow generation still cannot mutate a service cycle');

select is((select data->>'status' from public.aitask_entities where workspace_id='service-command-binding' and entity_type='service_cycle' and entity_id='binding-cycle'),'Published','rejected cross-command writes leave the cycle state unchanged');

reset role;
select * from finish();
rollback;
