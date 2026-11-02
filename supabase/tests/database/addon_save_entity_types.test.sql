begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008601','authenticated','authenticated','addon-pm@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-addon-save','Add-on save');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('addon-pm','pgtap-addon-save','00000000-0000-0000-0000-000000008601','PM','addon-pm@aitask.local','Project Manager','Management','{Management}','{}',false);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-addon-save','client','add-co','{"id":"add-co","clientName":"Addon Co","createdBy":"addon-pm"}'),
  ('pgtap-addon-save','client_plan','add-plan','{"id":"add-plan","clientId":"add-co","clientName":"Addon Co","name":"Plan","origin":"custom","status":"Active","currency":"MYR","revision":1,"startDate":"2026-11-01","billingDay":1,"taxRateBps":0,"discountType":"none","discountValue":0,"createdBy":"addon-pm","serviceItems":[{"id":"item","name":"Video","unit":"item","quantity":1,"platforms":[],"unitPriceMinor":0}]}'),
  ('pgtap-addon-save','service_cycle','add-draft','{"id":"add-draft","clientId":"add-co","clientName":"Addon Co","planId":"add-plan","planRevision":1,"periodStart":"2026-12-01","periodEnd":"2026-12-31","status":"Draft","currency":"MYR","serviceItems":[],"addonSnapshots":[],"discountType":"none","discountValue":0,"taxRateBps":0}'),
  ('pgtap-addon-save','service_cycle','add-live','{"id":"add-live","clientId":"add-co","clientName":"Addon Co","planId":"add-plan","planRevision":1,"periodStart":"2026-11-01","periodEnd":"2026-11-30","status":"Published","currency":"MYR","serviceItems":[],"addonSnapshots":[],"discountType":"none","discountValue":0,"taxRateBps":0}');

create function pg_temp.run(p_ops jsonb) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008601',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  v := public.aitask_execute_service_command('pgtap-addon-save', gen_random_uuid(), 'addon.manage', p_ops,
    (select version from public.aitask_workspaces where id='pgtap-addon-save'));
  execute 'reset role';
  return v;
end;
$$;

create function pg_temp.addon() returns jsonb language sql as $$
  select '{"id":"add-1","name":"Extra","planId":"add-plan","clientId":"add-co","clientName":"Addon Co","isActive":true,"quantity":1,"platforms":[],"billingMode":"monthly","discountType":"none","discountValue":0,"taxRateBps":0,"effectiveFrom":"2026-11-01","unitPriceMinor":0,"pricingSnapshotId":"add-price"}'::jsonb;
$$;

-- What the app sends when an add-on is added: the add-on, its pricing snapshot
-- and the add-on listed on the plan's draft cycle.
select is(pg_temp.run(jsonb_build_array(
  jsonb_build_object('kind','entity','action','insert','entityType','addon','entityId','add-1','expectedVersion',0,'data',pg_temp.addon()),
  jsonb_build_object('kind','entity','action','insert','entityType','service_pricing_snapshot','entityId','add-price','parentId','add-1','expectedVersion',0,
    'data','{"id":"add-price","clientId":"add-co","parentType":"addon","parentId":"add-1","currency":"MYR","itemPrices":[{"serviceItemId":"add-1","unitPriceMinor":0}],"discountType":"none","discountValue":0,"taxRateBps":0,"subtotalMinor":0,"discountMinor":0,"taxMinor":0,"totalMinor":0}'::jsonb),
  jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','add-draft','expectedVersion',1,
    'data',(select data from public.aitask_entities where entity_id='add-draft') || jsonb_build_object('addonSnapshots', jsonb_build_array(pg_temp.addon())))
))->>'ok', 'true', 'a Project Manager can add an add-on with its pricing and draft-cycle listing');

select is((select jsonb_array_length(data->'addonSnapshots') from public.aitask_entities where entity_id='add-draft'), 1, 'the draft cycle lists the add-on');

-- An add-on save still cannot change a published cycle.
select is(pg_temp.run(jsonb_build_array(
  jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','add-live','expectedVersion',1,
    'data',(select data from public.aitask_entities where entity_id='add-live') || '{"addonSnapshots":[{"id":"x"}]}'::jsonb)
))->>'ok', 'false', 'an add-on save cannot change a published cycle');

select * from finish();
rollback;
