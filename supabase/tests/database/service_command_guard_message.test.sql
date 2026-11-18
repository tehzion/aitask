begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009601','authenticated','authenticated','svc-msg-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-svc-msg','Service command message');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('svc-msg-boss','pgtap-svc-msg','00000000-0000-0000-0000-000000009601','Boss','svc-msg-boss@aitask.local','Project Manager','Management',array['Management'],'{}',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-svc-msg','client','svc-msg-company','{"id":"svc-msg-company","clientName":"Message Co","createdBy":"svc-msg-boss"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-svc-msg','deliverable','svc-msg-deliverable','{"id":"svc-msg-deliverable","title":"Fee 1","status":"Planned","clientId":"svc-msg-company","clientName":"Message Co","cycleId":"svc-msg-cycle","serviceItemId":"svc-msg-item","taskIds":[],"attachments":[],"sequence":1}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009601',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table svc_result as
  select public.aitask_execute_service_command('pgtap-svc-msg',gen_random_uuid(),'deliverable.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','svc-msg-deliverable','expectedVersion',1,
      'data',(select data || '{"status":"Bogus"}'::jsonb from public.aitask_entities where workspace_id='pgtap-svc-msg' and entity_type='deliverable' and entity_id='svc-msg-deliverable')))) as response;

select is((select response->>'code' from svc_result),'VALIDATION','a refused service save reports a validation failure');
select is((select response->>'error' from svc_result),'Deliverable status must match the progress of its required tasks.','the refusal names the guard message instead of generic invalid data');

select * from finish();
rollback;
