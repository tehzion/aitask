begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.aitask_workspaces(id, name) values ('pgtap-legacy-addons', 'Legacy add-on snapshots');
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  ('pgtap-legacy-addons','service_cycle','c-legacy','{"id":"c-legacy","status":"Completed","publishedAt":"2026-11-01T00:00:00Z","discountType":"none","discountValue":0,"taxRateBps":0,"serviceItems":[],"addonSnapshots":[]}'),
  ('pgtap-legacy-addons','service_cycle','c-modern','{"id":"c-modern","status":"Completed","publishedAt":"2026-11-01T00:00:00Z","discountType":"none","discountValue":0,"taxRateBps":0,"serviceItems":[]}');

-- The current app omits the retired addonSnapshots field when it saves a cycle.
select lives_ok($$update public.aitask_entities set data = (data - 'addonSnapshots') || '{"status":"Published"}' where workspace_id='pgtap-legacy-addons' and entity_id='c-legacy'$$,
  'a published cycle can be saved without the retired addonSnapshots field');
select ok((select data ? 'addonSnapshots' from public.aitask_entities where workspace_id='pgtap-legacy-addons' and entity_id='c-legacy'),
  'the stored addonSnapshots value is kept');
select is((select data ->> 'status' from public.aitask_entities where workspace_id='pgtap-legacy-addons' and entity_id='c-legacy'),'Published',
  'the status change is saved');
select throws_ok($$update public.aitask_entities set data = data || '{"addonSnapshots":[{"id":"x"}]}' where workspace_id='pgtap-legacy-addons' and entity_id='c-legacy'$$,
  '23514', 'A published service cycle keeps its frozen price terms.', 'an explicit change to the snapshot is still refused');
select lives_ok($$update public.aitask_entities set data = data || '{"status":"Published"}' where workspace_id='pgtap-legacy-addons' and entity_id='c-modern'$$,
  'a cycle that never had the field saves normally');

select * from finish();
rollback;
