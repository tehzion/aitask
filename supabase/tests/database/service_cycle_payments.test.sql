begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000b901','authenticated','authenticated','payment-test@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000b902','authenticated','authenticated','payment-client@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000b903','authenticated','authenticated','payment-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('payment-test','Payment tests');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values('payment-pm','payment-test','00000000-0000-0000-0000-00000000b901','Payment PM','payment-test@aitask.local','Project Manager','Management',array['Management'],true),
('payment-client','payment-test','00000000-0000-0000-0000-00000000b902','Client','payment-client@aitask.local','Client','Client',array['Client'],false),
('payment-staff','payment-test','00000000-0000-0000-0000-00000000b903','Staff','payment-staff@aitask.local','Staff','Designer',array['Designer'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('payment-test','client','payment-co','{"id":"payment-co","clientName":"Payment Co","createdBy":"payment-pm"}'),
('payment-test','client_plan','payment-plan','{"id":"payment-plan","clientId":"payment-co","clientName":"Payment Co","status":"Active","name":"Changed live terms"}'),
('payment-test','service_cycle','payment-cycle','{"id":"payment-cycle","clientId":"payment-co","clientName":"Payment Co","planId":"payment-plan","status":"Completed","serviceItems":[],"discountType":"none","discountValue":0,"taxRateBps":0}'),
('payment-test','service_pricing_snapshot','payment-price','{"id":"payment-price","clientId":"payment-co","parentType":"service_cycle","parentId":"payment-cycle","currency":"MYR","itemPrices":[],"totalMinor":9540}');
create function pg_temp.pay(amount bigint, identity text default gen_random_uuid()::text, payment_date text default '2026-01-01', command_id uuid default gen_random_uuid(), client text default 'payment-co', cycle text default 'payment-cycle') returns jsonb language sql as $$
select public.aitask_execute_payment_command('payment-test',command_id,'service_cycle_payment.record',jsonb_build_array(jsonb_build_object('kind','entity','entityType','service_cycle_payment','entityId',identity,'parentId',cycle,'action','insert','data',jsonb_build_object('id',identity,'cycleId',cycle,'clientId',client,'amountMinor',amount,'paymentDate',payment_date,'createdBy','forged','createdAt','1900-01-01'))),null)
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b901',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_cycle_payment'),0,'old cycles have no invented receipts');
select is(pg_temp.pay(0)->>'code','VALIDATION','reject zero');
select is(pg_temp.pay(-1)->>'code','VALIDATION','reject negative');
select is(pg_temp.pay(9541)->>'code','VALIDATION','reject overpayment');
select is(pg_temp.pay(1,payment_date=>'2999-01-01')->>'code','VALIDATION','reject future date');
select is(pg_temp.pay(1,payment_date=>'2026-02-30')->>'code','VALIDATION','reject impossible date');
select is(pg_temp.pay(1,client=>'foreign')->>'code','FORBIDDEN','reject forged client');
select is(pg_temp.pay(2000,'first','2026-01-01','00000000-0000-0000-0000-00000000c901')->>'ok','true','first unequal instalment succeeds');
select is(pg_temp.pay(2000,'first','2026-01-01','00000000-0000-0000-0000-00000000c901')->>'replayed','true','lost response replays safely');
select is((select data->>'createdBy' from public.aitask_entities where entity_id='first' and workspace_id='payment-test'),'payment-pm','actor stamped on server');
select isnt((select data->>'createdAt' from public.aitask_entities where entity_id='first' and workspace_id='payment-test'),'1900-01-01','time stamped on server');
select is(pg_temp.pay(7540,'second')->>'ok','true','outstanding unequal instalment succeeds');
select is(pg_temp.pay(1)->>'code','VALIDATION','settled cycle rejects further payment');
select is((select sum((data->>'amountMinor')::integer)::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_cycle_payment'),9540,'both receipts preserved');
select is((public.aitask_execute_payment_command('payment-test',gen_random_uuid(),'service_cycle_payment.void',jsonb_build_array(jsonb_build_object('kind','entity','entityType','service_cycle_payment','entityId','first','parentId','payment-cycle','action','update','expectedVersion',(select version from public.aitask_entities where workspace_id='payment-test' and entity_id='first'),'data',(select data||jsonb_build_object('voidReason','Wrong amount','voidedBy','forged','voidedAt','1900-01-01') from public.aitask_entities where workspace_id='payment-test' and entity_id='first'))),null)->>'ok'),'true','void correction succeeds');
select is(pg_temp.pay(2000,'replacement')->>'ok','true','replace voided amount');
select is((select count(*)::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_cycle_payment'),3,'voided receipt retained');
reset role;
select is((select count(*)::integer from public.aitask_entity_history where workspace_id='payment-test' and entity_type='service_cycle_payment'),4,'append-only insert and void history retained');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b902',true);
set local role authenticated;
select is(pg_temp.pay(1)->>'code','FORBIDDEN','client cannot record payments');
select is((select count(*)::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_cycle_payment'),0,'client cannot read payment amounts');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b903',true);
set local role authenticated;
select is(pg_temp.pay(1)->>'code','FORBIDDEN','staff without capabilities cannot record');

reset role;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000b904','authenticated','authenticated','payment-no-price@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions)
values('payment-no-price','payment-test','00000000-0000-0000-0000-00000000b904','Limited PM','payment-no-price@aitask.local','Project Manager','Management',array['Management'],'{"manageClientPlans":true,"manageServiceCycles":true,"viewServicePrices":false}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('payment-test','client','hidden-co','{"id":"hidden-co","clientName":"Hidden Co","createdBy":"payment-no-price"}'),
('payment-test','client_plan','hidden-plan','{"id":"hidden-plan","clientId":"hidden-co","clientName":"Hidden Co","status":"Paused","name":"Hidden terms","startDate":"2026-01-01","billingDay":1}'),
('payment-test','service_pricing_snapshot','hidden-price','{"id":"hidden-price","clientId":"hidden-co","parentType":"client_plan","parentId":"hidden-plan","currency":"MYR","itemPrices":[],"totalMinor":9540}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b904',true);
set local role authenticated;
select is(pg_temp.pay(1)->>'code','FORBIDDEN','cycle manager without price access cannot record');
select is((select count(*)::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_cycle_payment'),0,'cycle manager without prices cannot read receipts');
select is((public.aitask_execute_service_command('payment-test',gen_random_uuid(),'client_plan.manage',jsonb_build_array(jsonb_build_object(
'kind','entity','entityType','client_plan','entityId','hidden-revision','parentId','hidden-co','action','insert','expectedVersion',0,
'data','{"id":"hidden-revision","clientId":"hidden-co","clientName":"Hidden Co","name":"New name","status":"Draft","supersedesPlanId":"hidden-plan","startDate":"2027-01-01","billingDay":1,"revision":2,"currency":"MYR","serviceItems":[],"discountValue":0,"taxRateBps":0}'::jsonb)),null)->>'ok'),'true','plan manager can revise nonfinancial details while source stays paused');
reset role;
select is((select (data->>'totalMinor')::integer from public.aitask_entities where workspace_id='payment-test' and entity_type='service_pricing_snapshot' and data->>'parentId'='hidden-revision'),9540,'hidden revision pricing is copied on server without exposure or zeroing');

select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set permissions='{"manageClientPlans":true,"manageServiceCycles":true,"viewServicePrices":true}' where id='payment-no-price';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b904',true);
set local role authenticated;
select is(pg_temp.pay(1)->>'code','FORBIDDEN','payment manager with prices cannot write outside client access');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('payment-test','service_cycle','legacy-cycle','{"id":"legacy-cycle","clientId":"payment-co","clientName":"Payment Co","planId":"payment-plan","status":"Completed","serviceItems":[{"id":"legacy-item","quantity":1,"unitPriceMinor":0}],"discountType":"none","discountValue":0,"taxRateBps":0}'),
('payment-test','service_pricing_snapshot','legacy-price','{"id":"legacy-price","clientId":"payment-co","parentType":"service_cycle","parentId":"legacy-cycle","itemPrices":[{"serviceItemId":"legacy-item","unitPriceMinor":10000}],"discountType":"percent","discountValue":1000,"taxRateBps":600}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000b901',true);
set local role authenticated;
select is(pg_temp.pay(9540,cycle=>'legacy-cycle')->>'ok','true','legacy charge resolves own frozen item prices, tax and discount');
select is(pg_temp.pay(1,cycle=>'legacy-cycle')->>'code','VALIDATION','legacy cycle balance cannot be exceeded');
select throws_ok($$insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data) values('payment-test','service_cycle_payment','direct-forgery','payment-cycle','{"id":"direct-forgery","clientId":"payment-co","cycleId":"payment-cycle","amountMinor":1,"paymentDate":"2026-01-01"}')$$,'42501','permission denied for table aitask_entities','direct authenticated inserts cannot bypass command validation');
select * from finish();
rollback;
