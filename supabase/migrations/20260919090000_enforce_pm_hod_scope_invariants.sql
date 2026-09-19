-- Enforce the role invariants that remain true even when a built-in HOD
-- template or editable custom role is changed by Boss Koo.

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
      when member.role = 'HOD' and builtin_role.data -> 'permissions' ? p_permission then builtin_role.data -> 'permissions' ->> p_permission = 'true'
      when p_permission = 'viewDeliveryTracker'
        and not (member.permissions ? p_permission)
        and not (custom_role.data -> 'permissions' ? p_permission)
        and (
          (member.permissions ? 'viewProjects' and member.permissions ->> 'viewProjects' = 'true')
          or (not (member.permissions ? 'viewProjects') and custom_role.data -> 'permissions' ->> 'viewProjects' = 'true')
        ) then true
      when member.permissions <> '{}'::jsonb then false
      when custom_role.data is not null then false
      when member.role = 'Project Manager' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker','viewReports','viewSettings',
        'createTasks','manageCreatedTasks','createProjects','createClients','deleteClients','manageServiceCatalog',
        'manageTaskTemplates','manageClientPlans','manageServiceCycles','viewAllServiceClients','viewServicePrices'
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
        and entity.entity_id = 'builtin-hod'
      limit 1
    ) builtin_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

-- Keep all role templates honest at the write boundary. The frontend mirrors
-- this rule, but the trigger is the authoritative protection for direct RPC,
-- REST, and replayed mutation paths.
create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
  base_role text := coalesce(new.data ->> 'baseRole', '');
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
  if new.entity_id = 'builtin-hod' and (
    coalesce(new.data ->> 'id', '') <> 'builtin-hod'
    or coalesce(new.data ->> 'name', '') <> 'HOD'
    or coalesce(new.data ->> 'baseRole', '') <> 'HOD'
    or coalesce((new.data ->> 'isBuiltin')::boolean, false) is not true
    or coalesce((new.data ->> 'isProtected')::boolean, true) is not false
    or coalesce((new.data ->> 'departmentScoped')::boolean, false) is not true
  ) then
    raise check_violation using message = 'The built-in HOD role must remain an editable department-scoped HOD template.';
  end if;
  return new;
end;
$$;

create or replace function private.aitask_guard_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_data jsonb;
begin
  if new.permissions ->> 'editTasks' = 'true' then
    raise check_violation using message = 'Only Boss Koo can manage every task.';
  end if;
  if new.role = 'HOD' and exists (
    select 1
    from jsonb_each_text(coalesce(new.permissions, '{}'::jsonb)) item
    where item.value = 'true'
      and item.key = any(array[
        'viewAllTasks','viewAllClients','viewApprovals',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans',
        'manageServiceCycles','viewAllServiceClients','viewServicePrices'
      ])
  ) then
    raise check_violation using message = 'HOD permissions must remain department-scoped and cannot manage services or approvals.';
  end if;
  if new.custom_role_id is null then return new; end if;
  select entity.data into role_data
  from public.aitask_entities entity
  where entity.workspace_id = new.workspace_id
    and entity.entity_type = 'custom_role'
    and entity.entity_id = new.custom_role_id;
  if role_data is null or coalesce((role_data ->> 'isBuiltin')::boolean, false) or role_data ->> 'baseRole' is distinct from new.role then
    raise check_violation using message = 'Built-in roles cannot be assigned as custom member roles.';
  end if;
  return new;
end;
$$;

-- HOD is represented as Staff by the compatibility role helper. Add the raw
-- HOD exception anywhere notifications currently compare target_role to that
-- helper so HOD-targeted notifications are visible and markable as read.
do $$
declare
  item record;
  definition text;
  original text;
begin
  for item in
    select proc.oid
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = 'aitask_set_notifications_read'
      and proc.prokind = 'f'
  loop
    definition := pg_get_functiondef(item.oid);
    original := definition;
    definition := replace(
      definition,
      'entity.target_role = v_member_role',
      '(entity.target_role = v_member_role or (private.aitask_is_hod(p_workspace_id) and entity.target_role = ''HOD''))'
    );
    if definition = original then
      raise exception 'Notification read RPC does not contain the expected role predicate.';
    end if;
    execute definition;
  end loop;
end;
$$;

do $$
declare
  policy_row record;
  statement text;
  updated_qual text;
  updated_check text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%target_role = private.aitask_member_role(workspace_id)%'
        or coalesce(with_check, '') like '%target_role = private.aitask_member_role(workspace_id)%'
      )
  loop
    updated_qual := replace(
      policy_row.qual,
      'target_role = private.aitask_member_role(workspace_id)',
      '(target_role = private.aitask_member_role(workspace_id) or (private.aitask_is_hod(workspace_id) and target_role = ''HOD''))'
    );
    updated_check := replace(
      policy_row.with_check,
      'target_role = private.aitask_member_role(workspace_id)',
      '(target_role = private.aitask_member_role(workspace_id) or (private.aitask_is_hod(workspace_id) and target_role = ''HOD''))'
    );
    statement := format('alter policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    if updated_qual is not null then statement := statement || format(' using (%s)', updated_qual); end if;
    if updated_check is not null then statement := statement || format(' with check (%s)', updated_check); end if;
    execute statement;
  end loop;
end;
$$;

revoke all on function private.aitask_guard_custom_role_scope() from public, anon, authenticated;
revoke all on function private.aitask_guard_member_role_scope() from public, anon, authenticated;
revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;
