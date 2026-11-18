begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009701','authenticated','authenticated','reopen-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-reopen','Reopen delivered work');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('reopen-boss','pgtap-reopen','00000000-0000-0000-0000-000000009701','Boss','reopen-boss@aitask.local','Project Manager','Management',array['Management'],'{}',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-reopen','client','reopen-company','{"id":"reopen-company","clientName":"Reopen Co","createdBy":"reopen-boss"}'),
  ('pgtap-reopen','service_cycle','reopen-cycle','{"id":"reopen-cycle","clientId":"reopen-company","clientName":"Reopen Co","status":"Completed","serviceItems":[],"periodStart":"2026-11-01","periodEnd":"2026-11-30"}'),
  ('pgtap-reopen','deliverable','reopen-deliverable','{"id":"reopen-deliverable","title":"Fee 1","status":"Delivered","clientId":"reopen-company","clientName":"Reopen Co","cycleId":"reopen-cycle","serviceItemId":"reopen-item","taskIds":[],"attachments":[],"sequence":1}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009701',true);
select set_config('request.jwt.claim.role','authenticated',true);

create temp table reopen_result as
  select public.aitask_execute_service_command('pgtap-reopen',gen_random_uuid(),'deliverable.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','reopen-deliverable','expectedVersion',1,
      'data',(select (data || '{"status":"Ready"}'::jsonb) - 'deliveredAt' from public.aitask_entities where workspace_id='pgtap-reopen' and entity_type='deliverable' and entity_id='reopen-deliverable')))) as response;

select is((select response->>'ok' from reopen_result),'true','reopening a delivered deliverable is accepted');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen' and entity_type='service_cycle' and entity_id='reopen-cycle'),'Published','its completed cycle returns to Published');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen' and entity_type='deliverable' and entity_id='reopen-deliverable'),'Ready','the deliverable stays Ready');

-- A cycle whose deliverables are all Delivered still cannot be moved back by hand.
update public.aitask_entities set data = data || '{"status":"Delivered"}'::jsonb where workspace_id='pgtap-reopen' and entity_type='deliverable' and entity_id='reopen-deliverable';
create temp table reopen_manual as
  select public.aitask_execute_service_command('pgtap-reopen',gen_random_uuid(),'service_cycle.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','reopen-cycle','expectedVersion',
      (select version from public.aitask_entities where workspace_id='pgtap-reopen' and entity_type='service_cycle' and entity_id='reopen-cycle'),
      'data',(select data || '{"status":"Completed"}'::jsonb from public.aitask_entities where workspace_id='pgtap-reopen' and entity_type='service_cycle' and entity_id='reopen-cycle')))) as response;
select is((select response->>'ok' from reopen_manual),'true','a completed cycle with every deliverable delivered stays valid');

select * from finish();
rollback;
