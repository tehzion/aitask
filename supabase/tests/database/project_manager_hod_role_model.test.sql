begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select is(
  (select count(*)::integer from public.aitask_members where role = 'Admin'),
  0,
  'the persisted member table has no legacy Admin roles'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'system-hod'),
  0,
  'the obsolete system-hod template is removed'
);
select ok(
  (select count(*) from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod')
  = (select count(*) from public.aitask_workspaces),
  'every workspace has one built-in HOD template'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod' and data ->> 'baseRole' = 'HOD'),
  (select count(*)::integer from public.aitask_workspaces),
  'built-in HOD templates target the HOD base role'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod' and coalesce((data ->> 'isBuiltin')::boolean, false) and not coalesce((data ->> 'isProtected')::boolean, true)),
  (select count(*)::integer from public.aitask_workspaces),
  'built-in HOD templates are editable rather than protected'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod' and coalesce((data ->> 'departmentScoped')::boolean, false)),
  (select count(*)::integer from public.aitask_workspaces),
  'built-in HOD templates preserve department scoping'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod' and coalesce(data -> 'permissions' ->> 'viewApprovals', 'false') = 'false'),
  (select count(*)::integer from public.aitask_workspaces),
  'HOD defaults cannot access Approvals'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'custom_role' and entity_id = 'builtin-hod' and coalesce(data -> 'permissions' ->> 'createProjects', 'false') = 'false'),
  (select count(*)::integer from public.aitask_workspaces),
  'HOD defaults do not create projects'
);
select is(
  (select count(*)::integer from public.aitask_entities where entity_type = 'notification' and (target_role = 'Admin' or data ->> 'targetRole' = 'Admin')),
  0,
  'role-targeted notifications use Project Manager instead of Admin'
);

select * from finish();
rollback;
