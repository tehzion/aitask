begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008101','authenticated','authenticated','pm-scope-one@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008102','authenticated','authenticated','pm-scope-two@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008103','authenticated','authenticated','pm-scope-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-pm-service-scope','PM service scope');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
('pm-one','pgtap-pm-service-scope','00000000-0000-0000-0000-000000008101','PM One','pm-scope-one@aitask.local','Project Manager','Management','{}','{}',false),
('pm-two','pgtap-pm-service-scope','00000000-0000-0000-0000-000000008102','PM Two','pm-scope-two@aitask.local','Project Manager','Management','{}','{}',false),
('pm-boss','pgtap-pm-service-scope','00000000-0000-0000-0000-000000008103','Boss','pm-scope-boss@aitask.local','Project Manager','Management','{}','{}',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-pm-service-scope','client','co-one','{"id":"co-one","clientName":"One","createdBy":"pm-one"}'),
('pgtap-pm-service-scope','client','co-two','{"id":"co-two","clientName":"Two","createdBy":"pm-two"}'),
('pgtap-pm-service-scope','client_plan','plan-one','{"id":"plan-one","clientId":"co-one","clientName":"One","status":"Draft","name":"One plan","serviceItems":[]}'),
('pgtap-pm-service-scope','client_plan','plan-two','{"id":"plan-two","clientId":"co-two","clientName":"Two","status":"Draft","name":"Two plan","serviceItems":[]}'),
('pgtap-pm-service-scope','service_cycle','cycle-one','{"id":"cycle-one","clientId":"co-one","clientName":"One","planId":"plan-one","status":"Draft","periodStart":"2099-01-01","periodEnd":"2099-01-31"}'),
('pgtap-pm-service-scope','service_cycle','cycle-two','{"id":"cycle-two","clientId":"co-two","clientName":"Two","planId":"plan-two","status":"Draft","periodStart":"2099-01-01","periodEnd":"2099-01-31"}'),
('pgtap-pm-service-scope','addon','addon-two','{"id":"addon-two","clientId":"co-two","clientName":"Two","planId":"plan-two","name":"Foreign extra","isActive":true}'),
('pgtap-pm-service-scope','service_pricing_snapshot','price-one','{"id":"price-one","clientId":"co-one","parentType":"client_plan","parentId":"plan-one","totalMinor":1000}'),
('pgtap-pm-service-scope','service_pricing_snapshot','price-two','{"id":"price-two","clientId":"co-two","parentType":"client_plan","parentId":"plan-two","totalMinor":9999}');

-- Test-only command builder. Known fixture versions avoid unauthorized SELECTs.
create function pg_temp.pm_service(action text, kind text, id text, payload jsonb default '{}') returns jsonb language sql as $$
 select public.aitask_execute_service_command('pgtap-pm-service-scope',gen_random_uuid(),
 case when kind='addon' then 'addon.manage' else 'client_plan.manage' end,
 jsonb_build_array(jsonb_build_object('kind','entity','action',action,'entityType',kind,'entityId',id,'expectedVersion',case when action='insert' then 0 else 1 end,'data',payload)),null);
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008101',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_type='service_pricing_snapshot'),1,'PM reads only their portfolio pricing');
select ok(exists(select 1 from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_id='price-one'),'owned pricing remains available');
select is(pg_temp.pm_service('update','client_plan','plan-two','{"id":"plan-two","clientId":"co-two","clientName":"Two","name":"Hijacked"}')->>'code','FORBIDDEN','foreign plan update fails before mutation');
select is(pg_temp.pm_service('delete','client_plan','plan-two')->>'code','FORBIDDEN','foreign plan deletion is forbidden');
select is(pg_temp.pm_service('update','addon','addon-two','{"id":"addon-two","clientId":"co-two","planId":"plan-two","isActive":false}')->>'code','FORBIDDEN','foreign addon update is forbidden');
select is(pg_temp.pm_service('update','service_pricing_snapshot','price-two','{"id":"price-two","clientId":"co-two","parentType":"client_plan","parentId":"plan-two","totalMinor":1}')->>'code','FORBIDDEN','foreign pricing update is forbidden');
select is(pg_temp.pm_service('delete','service_pricing_snapshot','price-two')->>'code','FORBIDDEN','foreign pricing deletion is forbidden');
select is(pg_temp.pm_service('update','client_plan','plan-two','{"id":"plan-two","clientId":"co-one","clientName":"One","name":"Relabelled"}')->>'code','FORBIDDEN','changing clientId cannot hijack a foreign plan');
select is(pg_temp.pm_service('insert','client_plan','forged-plan','{"id":"forged-plan","clientId":"co-two","clientName":"Two","name":"Forged"}')->>'ok','false','cannot insert a plan into a foreign company');
select is(pg_temp.pm_service('insert','service_pricing_snapshot','forged-price','{"id":"forged-price","clientId":"co-one","parentType":"client_plan","parentId":"plan-two","totalMinor":1}')->>'ok','false','owned client cannot conceal a foreign pricing parent');
select is(pg_temp.pm_service('insert','addon','forged-addon','{"id":"forged-addon","clientId":"co-one","planId":"plan-one","targetCycleId":"cycle-two","name":"Forged"}')->>'ok','false','one-off addon cannot target another portfolio cycle');
select is(pg_temp.pm_service('insert','client_plan','new-owned-plan','{"id":"new-owned-plan","clientId":"co-one","clientName":"One","name":"New owned plan","status":"Draft"}')->>'ok','true','owned company can receive a new plan');
select is(pg_temp.pm_service('update','client_plan','plan-one','{"id":"plan-one","clientId":"co-one","clientName":"One","status":"Draft","name":"Updated owned plan","serviceItems":[]}')->>'ok','true','owned plan remains editable');
select is((public.aitask_execute_service_command('pgtap-pm-service-scope',gen_random_uuid(),'client_plan.manage',jsonb_build_array(
 jsonb_build_object('kind','entity','action','insert','entityType','client','entityId','co-new','expectedVersion',0,'data',jsonb_build_object('id','co-new','clientName','New','createdBy','pm-one')),
 jsonb_build_object('kind','entity','action','insert','entityType','client_plan','entityId','plan-new','expectedVersion',0,'data',jsonb_build_object('id','plan-new','clientId','co-new','clientName','New','status','Draft')),
 jsonb_build_object('kind','entity','action','insert','entityType','service_pricing_snapshot','entityId','price-new','expectedVersion',0,'data',jsonb_build_object('id','price-new','clientId','co-new','parentType','client_plan','parentId','plan-new','totalMinor',2500))
),null)->>'ok'),'true','atomic company, plan and pricing creation remains available');
reset role;
select is((select data->>'name' from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_id='plan-two'),'Two plan','foreign plan is unchanged');
select is((select data->>'totalMinor' from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_id='price-two'),'9999','foreign price is unchanged');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_id in ('forged-plan','forged-price','forged-addon')),0,'rejected inserts leave no records');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008103',true);
set local role authenticated;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-service-scope' and entity_type='service_pricing_snapshot'),3,'Boss retains all company pricing');
select is(pg_temp.pm_service('update','client_plan','plan-two','{"id":"plan-two","clientId":"co-two","clientName":"Two","status":"Draft","name":"Boss updated","serviceItems":[]}')->>'ok','true','Boss retains cross-portfolio plan control');
reset role;
select * from finish();
rollback;
