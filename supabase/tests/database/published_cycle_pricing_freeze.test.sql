begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.aitask_workspaces(id, name) values ('pgtap-cycle-freeze', 'Cycle freeze');
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  ('pgtap-cycle-freeze','service_cycle','c-pub','{"id":"c-pub","status":"Active","publishedAt":"2026-11-01T00:00:00Z","discountType":"none","discountValue":0,"taxRateBps":0,"serviceItems":[]}'),
  ('pgtap-cycle-freeze','service_pricing_snapshot','p-pub','{"id":"p-pub","parentType":"service_cycle","parentId":"c-pub","totalMinor":1000}'),
  ('pgtap-cycle-freeze','service_cycle','c-draft','{"id":"c-draft","status":"Draft","discountType":"none","discountValue":0,"taxRateBps":0,"serviceItems":[]}'),
  ('pgtap-cycle-freeze','service_pricing_snapshot','p-draft','{"id":"p-draft","parentType":"service_cycle","parentId":"c-draft","totalMinor":1000}');

select throws_ok($$update public.aitask_entities set data = data || '{"discountValue":50}' where workspace_id='pgtap-cycle-freeze' and entity_id='c-pub'$$,
  '23514', 'A published service cycle keeps its frozen price terms.', 'published cycle price terms cannot change');
select lives_ok($$update public.aitask_entities set data = data || '{"status":"Completed"}' where workspace_id='pgtap-cycle-freeze' and entity_id='c-pub'$$,
  'published cycle status can still change');
select throws_ok($$update public.aitask_entities set data = data || '{"totalMinor":1}' where workspace_id='pgtap-cycle-freeze' and entity_id='p-pub'$$,
  '23514', 'A service cycle pricing snapshot cannot be changed after creation.', 'published cycle snapshot cannot change');
select throws_ok($$delete from public.aitask_entities where workspace_id='pgtap-cycle-freeze' and entity_id='p-pub'$$,
  '23514', 'A published service cycle keeps its frozen pricing snapshot.', 'published cycle snapshot cannot be deleted');
select lives_ok($$update public.aitask_entities set data = data || '{"discountValue":10}' where workspace_id='pgtap-cycle-freeze' and entity_id='c-draft'$$,
  'draft cycle pricing remains editable');
select throws_ok($$update public.aitask_entities set data = data || '{"totalMinor":5}' where workspace_id='pgtap-cycle-freeze' and entity_id='p-draft'$$,
  '23514', 'A service cycle pricing snapshot cannot be changed after creation.', 'draft cycle snapshot is write-once too');
select lives_ok($$delete from public.aitask_entities where workspace_id='pgtap-cycle-freeze' and entity_id='p-draft'$$,
  'a draft cycle snapshot can still be removed with its cycle');

select * from finish();
rollback;
