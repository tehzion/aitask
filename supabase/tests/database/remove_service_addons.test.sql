begin;
select plan(6);
insert into public.aitask_workspaces(id, name) values ('addon-removal-test', 'Add-on removal test');

select throws_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values ('addon-removal-test', 'addon', 'addon-new', '{}')$$,
  '23514',
  null,
  'new add-on rows are rejected'
);
select lives_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values ('addon-removal-test', 'cycle_comment', 'comment-still-allowed', '{}')$$,
  'other service entity types are still accepted'
);
select is((select count(*)::int from public.aitask_entities where entity_type = 'addon'), 0, 'no add-on rows remain');
select is((select count(*)::int from public.aitask_entities where entity_type = 'service_pricing_snapshot' and data->>'parentType' = 'addon'), 0, 'no add-on pricing snapshots remain');
select ok(not has_table_privilege('anon', 'private.addon_removal_backup_20261110', 'select'), 'anonymous callers cannot read the add-on backup');
select ok(not has_table_privilege('authenticated', 'private.addon_removal_backup_20261110', 'select'), 'signed-in users cannot read the add-on backup');

select * from finish();
rollback;
