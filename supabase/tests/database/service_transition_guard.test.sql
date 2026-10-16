begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000007b1','authenticated','authenticated','guard-pm@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values('service-guard-test','Service transition guard');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values('guard-pm','service-guard-test','00000000-0000-0000-0000-0000000007b1','PM','guard-pm@aitask.local','Project Manager','Management',array['Management'],true);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data,client_id) values
('service-guard-test','client','guard-client','{"id":"guard-client","clientName":"Guard Co","createdBy":"guard-pm"}','guard-client'),
('service-guard-test','service_cycle','guard-draft','{"id":"guard-draft","clientId":"guard-client","clientName":"Guard Co","planId":"guard-plan","status":"Draft"}','guard-client'),
('service-guard-test','service_cycle','guard-published','{"id":"guard-published","clientId":"guard-client","clientName":"Guard Co","planId":"guard-plan","status":"Published"}','guard-client');

create function pg_temp.set_cycle(p_id text,p_status text) returns jsonb language sql as $$
  select public.aitask_execute_service_command('service-guard-test',gen_random_uuid(),'service_cycle.manage',jsonb_build_array(jsonb_build_object(
    'kind','entity','action','update','entityType','service_cycle','entityId',p_id,'parentId',null,
    'expectedVersion',(select version from public.aitask_entities where workspace_id='service-guard-test' and entity_type='service_cycle' and entity_id=p_id),
    'data',(select data from public.aitask_entities where workspace_id='service-guard-test' and entity_type='service_cycle' and entity_id=p_id)||jsonb_build_object('status',p_status)
  )),null);
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000007b1',true);
set local role authenticated;

select is((pg_temp.set_cycle('guard-draft','Published')->>'ok')::boolean,true,'a Draft cycle may be published');
select is((pg_temp.set_cycle('guard-draft','Completed')->>'ok')::boolean,false,'a Published cycle cannot jump to Completed without delivered work');
select is((pg_temp.set_cycle('guard-draft','Draft')->>'ok')::boolean,false,'a Published cycle cannot return to Draft');
select is((pg_temp.set_cycle('guard-published','Draft')->>'ok')::boolean,false,'a Published cycle with no delivered work cannot be reverted to Draft');

reset role;
select * from finish();
rollback;
