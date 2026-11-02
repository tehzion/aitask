begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008401','authenticated','authenticated','activation-pm@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-plan-activation','Plan activation');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('activation-pm','pgtap-plan-activation','00000000-0000-0000-0000-000000008401','PM','activation-pm@aitask.local','Project Manager','Management','{Management}','{}',false);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-plan-activation','client','act-co','{"id":"act-co","clientName":"Activation Co","createdBy":"activation-pm"}'),
  ('pgtap-plan-activation','client_plan','act-plan','{"id":"act-plan","clientId":"act-co","clientName":"Activation Co","name":"Plan","origin":"custom","status":"Draft","currency":"MYR","revision":1,"startDate":"2026-10-27","billingDay":27,"taxRateBps":0,"discountType":"none","discountValue":0,"createdBy":"activation-pm","serviceItems":[{"id":"item","name":"Video","unit":"item","quantity":1,"platforms":[],"unitPriceMinor":0}]}');

create function pg_temp.run(p_ops jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008401',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  v := public.aitask_execute_service_command('pgtap-plan-activation', gen_random_uuid(), 'client_plan.manage', p_ops,
    (select version from public.aitask_workspaces where id='pgtap-plan-activation'));
  execute 'reset role';
  return v;
end;
$$;

-- What the app sends when a plan is activated: the plan, its first cycle, the
-- cycle's deliverable and its pricing snapshot, in one command.
select is(pg_temp.run(jsonb_build_array(
  jsonb_build_object('kind','entity','action','update','entityType','client_plan','entityId','act-plan','expectedVersion',1,
    'data',(select data from public.aitask_entities where entity_id='act-plan') || '{"status":"Active","nextCycleStart":"2026-11-27"}'),
  jsonb_build_object('kind','entity','action','insert','entityType','service_cycle','entityId','act-cycle','expectedVersion',0,
    'data','{"id":"act-cycle","clientId":"act-co","clientName":"Activation Co","planId":"act-plan","planRevision":1,"periodStart":"2026-10-27","periodEnd":"2026-11-26","status":"Draft","currency":"MYR","serviceItems":[{"id":"item","name":"Video","unit":"item","quantity":1,"platforms":[],"unitPriceMinor":0}],"addonSnapshots":[],"discountType":"none","discountValue":0,"taxRateBps":0,"pricingSnapshotId":"act-price"}'::jsonb),
  jsonb_build_object('kind','entity','action','insert','entityType','deliverable','entityId','act-dl','parentId','act-cycle','expectedVersion',0,
    'data','{"id":"act-dl","clientId":"act-co","clientName":"Activation Co","planId":"act-plan","cycleId":"act-cycle","serviceItemId":"item","sequence":1,"title":"Video 1","status":"Planned","taskIds":[],"attachments":[]}'::jsonb),
  jsonb_build_object('kind','entity','action','insert','entityType','service_pricing_snapshot','entityId','act-price','parentId','act-cycle','expectedVersion',0,
    'data','{"id":"act-price","clientId":"act-co","parentType":"service_cycle","parentId":"act-cycle","currency":"MYR","itemPrices":[{"serviceItemId":"item","unitPriceMinor":0}],"discountType":"none","discountValue":0,"taxRateBps":0,"subtotalMinor":0,"discountMinor":0,"taxMinor":0,"totalMinor":0}'::jsonb)
))->>'ok', 'true', 'a Project Manager can activate a plan with its first cycle and deliverable');

select is((select data->>'status' from public.aitask_entities where entity_id='act-plan'), 'Active', 'the plan is active');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-plan-activation' and entity_type in ('service_cycle','deliverable')), 2, 'the cycle and deliverable were created');

-- A plan save still cannot change an existing cycle.
select is(pg_temp.run(jsonb_build_array(
  jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','act-cycle','expectedVersion',
    (select version from public.aitask_entities where entity_id='act-cycle'),
    'data',(select data from public.aitask_entities where entity_id='act-cycle') || '{"periodEnd":"2026-12-26"}')
))->>'ok', 'false', 'a plan save cannot update an existing cycle');

select * from finish();
rollback;
