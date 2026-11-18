begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000008001', 'authenticated', 'authenticated', 'paystat-client@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.aitask_workspaces(id, name) values ('pgtap-pay-status', 'Payment status');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, client_name, permissions, is_super_admin) values
  ('paystat-client', 'pgtap-pay-status', '00000000-0000-0000-0000-000000008001', 'Client', 'paystat-client@aitask.local', 'Client', 'Client', array['Client'], 'Pay Co', '{}'::jsonb, false);

set local session_replication_role = replica;
insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, created_by, data) values
  ('pgtap-pay-status', 'client', 'pay-co', 'pay co', 'pay-co', 'x', '{"id":"pay-co","clientName":"Pay Co"}');
insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, period_start, data) values
  ('pgtap-pay-status', 'service_cycle', 'cycle-unpaid', 'pay co', 'pay-co', '2026-01-01', '{"id":"cycle-unpaid","clientId":"pay-co","status":"Published","periodStart":"2026-01-01","periodEnd":"2026-01-31","serviceItems":[]}'),
  ('pgtap-pay-status', 'service_cycle', 'cycle-partial', 'pay co', 'pay-co', '2026-02-01', '{"id":"cycle-partial","clientId":"pay-co","status":"Published","periodStart":"2026-02-01","periodEnd":"2026-02-28","serviceItems":[]}'),
  ('pgtap-pay-status', 'service_cycle', 'cycle-paid', 'pay co', 'pay-co', '2026-03-01', '{"id":"cycle-paid","clientId":"pay-co","status":"Completed","periodStart":"2026-03-01","periodEnd":"2026-03-31","serviceItems":[]}'),
  ('pgtap-pay-status', 'service_cycle', 'cycle-voided', 'pay co', 'pay-co', '2026-04-01', '{"id":"cycle-voided","clientId":"pay-co","status":"Published","periodStart":"2026-04-01","periodEnd":"2026-04-30","serviceItems":[]}'),
  ('pgtap-pay-status', 'service_cycle', 'cycle-draft', 'pay co', 'pay-co', '2026-05-01', '{"id":"cycle-draft","clientId":"pay-co","status":"Draft","periodStart":"2026-05-01","periodEnd":"2026-05-31","serviceItems":[]}');
insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, data)
select 'pgtap-pay-status', 'service_pricing_snapshot', 'price-' || c, 'pay co', 'pay-co',
  jsonb_build_object('id', 'price-' || c, 'clientId', 'pay-co', 'parentType', 'service_cycle', 'parentId', c, 'totalMinor', 10000)
from unnest(array['cycle-unpaid', 'cycle-partial', 'cycle-paid', 'cycle-voided']) c;
insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, data) values
  ('pgtap-pay-status', 'service_cycle_payment', 'pay-1', 'pay co', 'pay-co', '{"id":"pay-1","cycleId":"cycle-partial","clientId":"pay-co","amountMinor":4000,"paymentDate":"2026-02-10"}'),
  ('pgtap-pay-status', 'service_cycle_payment', 'pay-2', 'pay co', 'pay-co', '{"id":"pay-2","cycleId":"cycle-paid","clientId":"pay-co","amountMinor":10000,"paymentDate":"2026-03-10"}'),
  ('pgtap-pay-status', 'service_cycle_payment', 'pay-3', 'pay co', 'pay-co', '{"id":"pay-3","cycleId":"cycle-voided","clientId":"pay-co","amountMinor":10000,"paymentDate":"2026-04-10","voidedAt":"2026-04-12T00:00:00.000Z"}');
set local session_replication_role = origin;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000008001', true);
set local role authenticated;

create temporary table portal_read as select public.aitask_read_client_portal('pgtap-pay-status') as body;
grant all on portal_read to authenticated;

select is((select c ->> 'paymentStatus' from portal_read, jsonb_array_elements(body -> 'serviceCycles') c where c ->> 'id' = 'cycle-unpaid'), 'unpaid', 'a month with no receipt is unpaid');
select is((select c ->> 'paymentStatus' from portal_read, jsonb_array_elements(body -> 'serviceCycles') c where c ->> 'id' = 'cycle-partial'), 'partial', 'a part payment is partial');
select is((select c ->> 'paymentStatus' from portal_read, jsonb_array_elements(body -> 'serviceCycles') c where c ->> 'id' = 'cycle-paid'), 'paid', 'a settled month is paid');
select is((select c ->> 'paymentStatus' from portal_read, jsonb_array_elements(body -> 'serviceCycles') c where c ->> 'id' = 'cycle-voided'), 'unpaid', 'a voided receipt does not count');
select is((select count(*)::integer from portal_read, jsonb_array_elements(body -> 'serviceCycles') c where c ->> 'id' = 'cycle-draft'), 0, 'a draft month is not shown to the client at all');
select is((select position('amountMinor' in body::text) + position('4000' in body::text) from portal_read), 0, 'no payment amount or row reaches the client');

reset role;
select * from finish();
rollback;
