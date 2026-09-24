-- Editable default roles.
--
-- Every base role now has one built-in template (builtin-project-manager,
-- builtin-hod, builtin-staff, builtin-client). Boss Koo edits the template from
-- Approvals; members on that base role inherit it unless they hold a custom role
-- or member-level overrides. Custom roles stay exhaustive (absent key = false).
--
-- The template identity is fixed (id/baseRole/name/departmentScoped/isBuiltin)
-- and the protected Boss Koo permissions and HOD restrictions still apply.

-- 1. Keep every built-in template honest at the write boundary --------------
create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
  base_role text := coalesce(new.data ->> 'baseRole', '');
  canonical_base text := case new.entity_id
    when 'builtin-project-manager' then 'Project Manager'
    when 'builtin-hod' then 'HOD'
    when 'builtin-staff' then 'Staff'
    when 'builtin-client' then 'Client'
    else null
  end;
begin
  if exists (
    select 1
    from jsonb_each_text(permissions) item
    where item.value = 'true'
      and item.key = any(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports','viewApprovals'])
  ) then
    raise check_violation using message = 'Protected Boss Koo permissions cannot be delegated.';
  end if;
  if base_role = 'HOD' and exists (
    select 1
    from jsonb_each_text(permissions) item
    where item.value = 'true'
      and item.key = any(array[
        'viewAllTasks','viewAllClients','viewApprovals',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ])
  ) then
    raise check_violation using message = 'HOD permissions must remain department-scoped and cannot manage services or approvals.';
  end if;
  if coalesce((new.data ->> 'isBuiltin')::boolean, false) then
    if canonical_base is null
      or coalesce(new.data ->> 'id', '') <> new.entity_id
      or base_role <> canonical_base
      or coalesce(new.data ->> 'name', '') <> canonical_base
      or coalesce((new.data ->> 'isProtected')::boolean, true) is not false
      or coalesce((new.data ->> 'departmentScoped')::boolean, false) is distinct from (canonical_base = 'HOD')
    then
      raise check_violation using message = 'Built-in role templates must keep their canonical identity.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_custom_role_scope() from public, anon, authenticated;

create or replace function private.aitask_guard_builtin_role_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((old.data ->> 'isBuiltin')::boolean, false) then
    raise check_violation using message = 'Built-in role templates cannot be deleted.';
  end if;
  return old;
end;
$$;

revoke all on function private.aitask_guard_builtin_role_delete() from public, anon, authenticated;

drop trigger if exists aitask_00_guard_builtin_role_delete on public.aitask_entities;
create trigger aitask_00_guard_builtin_role_delete
  before delete on public.aitask_entities
  for each row
  when (old.entity_type = 'custom_role')
  execute function private.aitask_guard_builtin_role_delete();

-- 2. Seed the missing base-role templates (HOD already exists) --------------
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data, created_at, updated_at)
select
  workspace.id,
  'custom_role',
  seed.entity_id,
  seed.data,
  now(),
  now()
from public.aitask_workspaces workspace
cross join (
  values
    ('builtin-project-manager', jsonb_build_object(
      'id', 'builtin-project-manager', 'name', 'Project Manager',
      'description', 'Portfolio-scoped operational access. Account and role administration stays with Boss Koo.',
      'baseRole', 'Project Manager', 'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
      'permissions', jsonb_build_object(
        'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true, 'viewProjects', true,
        'viewDeliveryTracker', true, 'viewReports', true, 'viewSettings', true,
        'createTasks', true, 'manageCreatedTasks', true, 'createProjects', true,
        'createClients', true, 'deleteClients', true, 'manageServiceCatalog', true,
        'manageTaskTemplates', true, 'manageClientPlans', true, 'manageServiceCycles', true,
        'viewServicePrices', true,
        'viewAllTasks', false, 'viewAllClients', false, 'manageAssignedClients', false,
        'viewApprovals', false, 'editTasks', false, 'manageUsers', false,
        'approveRegistrations', false, 'deleteUsers', false, 'clientReview', false,
        'viewAllServiceClients', false, 'viewAssignedServiceClients', false, 'viewProductionReports', false
      )
    )),
    ('builtin-staff', jsonb_build_object(
      'id', 'builtin-staff', 'name', 'Staff',
      'description', 'Standard employee access to assigned work.',
      'baseRole', 'Staff', 'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
      'permissions', jsonb_build_object(
        'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true, 'viewProjects', true,
        'viewDeliveryTracker', true, 'viewReports', true, 'viewSettings', true,
        'createTasks', true, 'viewAssignedServiceClients', true,
        'viewAllTasks', false, 'viewAllClients', false, 'manageAssignedClients', false,
        'viewApprovals', false, 'editTasks', false, 'manageCreatedTasks', false,
        'createProjects', false, 'createClients', false, 'deleteClients', false,
        'manageUsers', false, 'approveRegistrations', false, 'deleteUsers', false,
        'clientReview', false, 'manageServiceCatalog', false, 'manageTaskTemplates', false,
        'manageClientPlans', false, 'manageServiceCycles', false, 'viewAllServiceClients', false,
        'viewServicePrices', false, 'viewProductionReports', false
      )
    )),
    ('builtin-client', jsonb_build_object(
      'id', 'builtin-client', 'name', 'Client',
      'description', 'Reviews and approves their company work.',
      'baseRole', 'Client', 'departmentScoped', false, 'isProtected', false, 'isBuiltin', true,
      'permissions', jsonb_build_object(
        'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true, 'viewProjects', true,
        'viewDeliveryTracker', true, 'viewReports', true, 'viewSettings', true,
        'clientReview', true,
        'viewAllTasks', false, 'viewAllClients', false, 'manageAssignedClients', false,
        'viewApprovals', false, 'createTasks', false, 'editTasks', false, 'manageCreatedTasks', false,
        'createProjects', false, 'createClients', false, 'deleteClients', false,
        'manageUsers', false, 'approveRegistrations', false, 'deleteUsers', false,
        'manageServiceCatalog', false, 'manageTaskTemplates', false, 'manageClientPlans', false,
        'manageServiceCycles', false, 'viewAllServiceClients', false, 'viewAssignedServiceClients', false,
        'viewServicePrices', false, 'viewProductionReports', false
      )
    ))
) as seed(entity_id, data)
on conflict (workspace_id, entity_type, entity_id) do nothing;

-- 3. Permission resolution honours the base-role template --------------------
create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when member.role = 'HOD' and p_permission = any(array[
        'viewAllTasks','viewAllClients','viewApprovals',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ]) then false
      when p_permission = any(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports','viewApprovals']) then false
      when member.permissions ? p_permission then member.permissions ->> p_permission = 'true'
      when custom_role.data -> 'permissions' ? p_permission then custom_role.data -> 'permissions' ->> p_permission = 'true'
      when p_permission = 'viewDeliveryTracker'
        and not (member.permissions ? p_permission)
        and not (custom_role.data -> 'permissions' ? p_permission)
        and (
          (member.permissions ? 'viewProjects' and member.permissions ->> 'viewProjects' = 'true')
          or (not (member.permissions ? 'viewProjects') and custom_role.data -> 'permissions' ->> 'viewProjects' = 'true')
        ) then true
      when custom_role.data is not null then false
      when builtin_role.data -> 'permissions' ? p_permission then builtin_role.data -> 'permissions' ->> p_permission = 'true'
      when member.permissions <> '{}'::jsonb then false
      when member.role = 'Project Manager' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createProjects','createClients','deleteClients','manageServiceCatalog',
        'manageTaskTemplates','manageClientPlans','manageServiceCycles','viewServicePrices'
      ])
      when member.role = 'HOD' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createClients','deleteClients','viewAssignedServiceClients'
      ])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','viewAssignedServiceClients'
      ])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings','clientReview'
      ])
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and coalesce((entity.data ->> 'isBuiltin')::boolean, false) = true
        and entity.data ->> 'baseRole' = member.role
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;

-- 4. Department scoping reads the template's departmentScoped flag -----------
create or replace function private.aitask_role_is_department_scoped(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.role = 'HOD' then true
      when custom_role.data is not null then coalesce((custom_role.data ->> 'departmentScoped')::boolean, false)
      else coalesce((builtin_role.data ->> 'departmentScoped')::boolean, false)
    end
    from public.aitask_members member
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    left join lateral (
      select entity.data from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and coalesce((entity.data ->> 'isBuiltin')::boolean, false) = true
        and entity.data ->> 'baseRole' = member.role
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

revoke all on function private.aitask_role_is_department_scoped(text) from public, anon, authenticated;
grant execute on function private.aitask_role_is_department_scoped(text) to authenticated, service_role;
