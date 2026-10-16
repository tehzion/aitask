-- Department-scoped roles are confined to their own departments, so they must
-- never carry workspace-wide visibility. The frontend strips viewAllTasks /
-- viewAllClients from these roles on read and on write, but a role persisted
-- before that rule (or written directly) still holds the grant, and the
-- database would honour it in aitask_can_view_task / aitask_can_view_client.
-- Strip the keys from any department-scoped custom role and from the member
-- permission overrides that reference one, so the policy is enforced at the
-- data layer as well as the interface.

update public.aitask_entities
set data = jsonb_set(data, '{permissions}', (data -> 'permissions') - 'viewAllTasks' - 'viewAllClients')
where entity_type = 'custom_role'
  and jsonb_typeof(data -> 'permissions') = 'object'
  and (data -> 'permissions') ?| array['viewAllTasks', 'viewAllClients']
  and coalesce(data ->> 'baseRole', '') = 'Staff'
  and coalesce((data ->> 'departmentScoped')::boolean, false);

update public.aitask_members member
set permissions = member.permissions - 'viewAllTasks' - 'viewAllClients'
where member.permissions is not null
  and member.permissions ?| array['viewAllTasks', 'viewAllClients']
  and (
    member.role = 'HOD'
    or member.custom_role_id = 'builtin-hod'
    or exists (
      select 1
      from public.aitask_entities role
      where role.workspace_id = member.workspace_id
        and role.entity_type = 'custom_role'
        and role.entity_id = member.custom_role_id
        and coalesce((role.data ->> 'departmentScoped')::boolean, false)
    )
  );
