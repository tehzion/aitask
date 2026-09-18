-- Canonical Project Manager / HOD role model.
--
-- The earlier authorization migrations intentionally used the legacy Admin and
-- system-hod names while the frontend was being migrated. This migration is
-- the cut-over point: stored data, role-targeted notifications, constraints,
-- and the executable RPC/RLS helpers all use the canonical model.

-- 1. Make the persisted role and feedback domains canonical -----------------
alter table public.aitask_members drop constraint if exists aitask_members_role_check;
alter table public.aitask_members drop constraint if exists aitask_members_departments_valid;
alter table public.aitask_feedback_submissions drop constraint if exists aitask_feedback_submissions_role_check;

update public.aitask_members
set role = 'Project Manager'
where role = 'Admin';

update public.aitask_members
set role = 'HOD',
    department = coalesce(nullif(department, ''), 'Designer'),
    departments = case
      when coalesce(cardinality(departments), 0) > 0 then departments
      else array[coalesce(nullif(department, ''), 'Designer')]
    end,
    custom_role_id = null,
    custom_role_name = null,
    permissions = coalesce(permissions, '{}'::jsonb)
where custom_role_id in ('system-hod', 'builtin-hod')
   or (role = 'Staff' and lower(coalesce(custom_role_name, '')) = 'hod');

alter table public.aitask_members
  add constraint aitask_members_role_valid
  check (role in ('Project Manager', 'HOD', 'Staff', 'Client'));

alter table public.aitask_feedback_submissions
  add constraint aitask_feedback_submissions_role_valid
  check (role in ('Super Admin', 'Project Manager', 'HOD', 'Staff', 'Client'));

-- 2. Normalize legacy role-targeted notifications ---------------------------
update public.aitask_entities
set target_role = 'Project Manager',
    data = jsonb_set(coalesce(data, '{}'::jsonb), '{targetRole}', '"Project Manager"'::jsonb, true),
    updated_at = now(),
    version = version + 1
where entity_type = 'notification'
  and (target_role = 'Admin' or data ->> 'targetRole' = 'Admin');

-- 3. Install the editable built-in HOD template ------------------------------
-- The template lives in the existing custom_role persistence path so older
-- clients can load it without a second role-template table.
delete from public.aitask_entities
where entity_type = 'custom_role' and entity_id = 'system-hod';

insert into public.aitask_entities(
  workspace_id, entity_type, entity_id, data, created_at, updated_at
)
select
  workspace.id,
  'custom_role',
  'builtin-hod',
  jsonb_build_object(
    'id', 'builtin-hod',
    'name', 'HOD',
    'description', 'Department lead with scoped task ownership and review access.',
    'baseRole', 'HOD',
    'departmentScoped', true,
    'isProtected', false,
    'isBuiltin', true,
    'permissions', jsonb_build_object(
      'viewDashboard', true, 'viewTasks', true, 'viewCalendar', true,
      'viewProjects', true, 'viewDeliveryTracker', true, 'viewReports', true,
      'viewSettings', true, 'createTasks', true, 'manageCreatedTasks', true,
      'createClients', true, 'deleteClients', true,
      'viewAssignedServiceClients', true,
      'viewAllTasks', false, 'viewAllClients', false, 'manageAssignedClients', false,
      'viewApprovals', false, 'editTasks', false, 'createProjects', false,
      'manageUsers', false, 'approveRegistrations', false, 'deleteUsers', false,
      'clientReview', false, 'manageServiceCatalog', false,
      'manageTaskTemplates', false, 'manageClientPlans', false,
      'manageServiceCycles', false, 'viewAllServiceClients', false,
      'viewServicePrices', false, 'viewProductionReports', false
    ),
    'createdAt', now(),
    'updatedAt', now()
  ),
  now(),
  now()
from public.aitask_workspaces workspace
on conflict (workspace_id, entity_type, entity_id) do update
set data = excluded.data,
    updated_at = now(),
    version = public.aitask_entities.version + 1;

-- 4. Replace legacy literals in the executable function bodies ---------------
-- Historical migration files remain immutable; this updates the live function
-- definitions in-place so every existing RLS policy/RPC sees PM and the new
-- built-in template after rollout.
do $$
declare
  item record;
  definition text;
begin
  for item in
    select proc.oid, namespace.nspname, proc.proname, pg_get_function_identity_arguments(proc.oid) as args
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where proc.prokind = 'f'
      and namespace.nspname in ('private', 'public')
  loop
    definition := pg_get_functiondef(item.oid);
    definition := replace(definition, '''Admin''', '''Project Manager''');
    definition := replace(definition, '''system-hod''', '''builtin-hod''');
    if definition <> pg_get_functiondef(item.oid) then
      execute definition;
    end if;
  end loop;
end;
$$;

-- Policies can inline role-target checks instead of calling a helper. Rewrite
-- those live policy expressions as part of the cut-over as well.
do $$
declare
  policy_row record;
  statement text;
begin
  for policy_row in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%''Admin''%'
        or coalesce(qual, '') like '%''system-hod''%'
        or coalesce(with_check, '') like '%''Admin''%'
        or coalesce(with_check, '') like '%''system-hod''%'
      )
  loop
    statement := format(
      'alter policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
    if policy_row.qual is not null then
      statement := statement || format(
        ' using (%s)',
        replace(replace(policy_row.qual, '''Admin''', '''Project Manager'''), '''system-hod''', '''builtin-hod''')
      );
    end if;
    if policy_row.with_check is not null then
      statement := statement || format(
        ' with check (%s)',
        replace(replace(policy_row.with_check, '''Admin''', '''Project Manager'''), '''system-hod''', '''builtin-hod''')
      );
    end if;
    execute statement;
  end loop;
end;
$$;

-- HOD is a first-class base role. Existing Staff-oriented authorization
-- branches intentionally continue to apply to HOD through this compatibility
-- helper, while the explicit HOD predicates below add department scoping.
create or replace function private.aitask_member_role(p_workspace_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when role = 'HOD' then 'Staff' else role end
  from public.aitask_members
  where workspace_id = p_workspace_id
    and auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.aitask_is_hod(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select member.role = 'HOD'
      or member.custom_role_id = 'builtin-hod'
    from public.aitask_members member
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

create or replace function private.aitask_role_is_department_scoped(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select member.role = 'HOD'
      or member.custom_role_id = 'builtin-hod'
      or coalesce((custom_role.data ->> 'departmentScoped')::boolean, false)
    from public.aitask_members member
    left join lateral (
      select entity.data
      from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
  ), false);
$$;

create or replace function private.aitask_normalize_member_departments(
  p_role text,
  p_departments text[]
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  item text;
  canonical text;
  result text[] := '{}'::text[];
  department_order text[] := array[
    'Operation', 'Management', 'Video Shooting', 'Video Editor',
    'Ads Management', 'Account & Finance', 'Designer'
  ];
begin
  if p_role = 'Client' then
    if cardinality(p_departments) <> 1 or lower(btrim(p_departments[1])) <> 'client' then
      raise check_violation using message = 'Client members must belong only to Client.';
    end if;
    return array['Client'];
  end if;

  if p_role = 'Project Manager' and coalesce(cardinality(p_departments), 0) = 0 then
    return '{}'::text[];
  end if;
  if p_role not in ('Project Manager', 'HOD', 'Staff')
    or coalesce(cardinality(p_departments), 0) not between 1 and 7 then
    raise check_violation using message = 'Internal members require at least one valid department.';
  end if;

  foreach item in array p_departments loop
    canonical := case lower(regexp_replace(btrim(coalesce(item, '')), '[\s_-]+', ' ', 'g'))
      when 'operation' then 'Operation'
      when 'management' then 'Management'
      when 'videoshooting' then 'Video Shooting'
      when 'video shooting' then 'Video Shooting'
      when 'editor' then 'Video Editor'
      when 'video editor' then 'Video Editor'
      when 'ads management' then 'Ads Management'
      when 'account & finance' then 'Account & Finance'
      when 'designer' then 'Designer'
      else null
    end;
    if canonical is null then raise check_violation using message = 'Invalid internal department.'; end if;
    if canonical = any(result) then raise check_violation using message = 'Duplicate departments are not allowed.'; end if;
    result := array_append(result, canonical);
  end loop;

  select array_agg(value order by array_position(department_order, value))
    into result from unnest(result) value;
  return result;
end;
$$;

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
      when p_permission = any(array['editTasks','manageUsers','approveRegistrations','deleteUsers','viewProductionReports']) then false
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

create or replace function public.aitask_update_member_role(
  p_workspace_id text,
  p_command_id uuid,
  p_member_id text,
  p_role text,
  p_custom_role_id text,
  p_client_name text,
  p_departments text[],
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.aitask_members%rowtype;
  member_row public.aitask_members%rowtype;
  departments text[];
  custom_role_name text;
  workspace_version bigint;
  response jsonb;
begin
  if p_command_id is null or nullif(btrim(coalesce(p_member_id, '')), '') is null
    or coalesce(p_expected_version, 0) < 1 or p_role is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A command, member, role, and expected version are required.');
  end if;
  if p_role not in ('Project Manager', 'HOD', 'Staff', 'Client') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose a valid system role.');
  end if;

  select * into actor from public.aitask_members
  where workspace_id = p_workspace_id and auth_user_id = (select auth.uid()) and is_super_admin = true;
  if not found then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Boss Koo permission required.'); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into response from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id and receipt.actor_member_id = actor.id and receipt.command_id = p_command_id;
  if response is not null then return response || jsonb_build_object('replayed', true); end if;

  select * into member_row from public.aitask_members
  where workspace_id = p_workspace_id and id = p_member_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Member account was not found.'); end if;
  if member_row.is_super_admin then return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Boss Koo keeps permanent super admin permissions.'); end if;
  if member_row.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'A newer member record is available.');
  end if;

  begin
    departments := private.aitask_normalize_member_departments(p_role, case when p_role = 'Client' then array['Client'] else p_departments end);
  exception when check_violation then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', sqlerrm);
  end;

  if p_role = 'Client' and nullif(btrim(coalesce(p_client_name, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose a company for this client account.');
  end if;

  custom_role_name := null;
  if p_custom_role_id is not null and p_role <> 'Client' then
    select entity.data ->> 'name' into custom_role_name
    from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'custom_role'
      and entity.entity_id = p_custom_role_id
      and entity.data ->> 'baseRole' = p_role
      and coalesce((entity.data ->> 'isBuiltin')::boolean, false) = false
    limit 1;
    if custom_role_name is null then return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'This role can only be assigned to a matching editable custom role.'); end if;
  end if;

  update public.aitask_members
  set role = p_role,
      department = case when p_role = 'Project Manager' then 'Management' when p_role = 'Client' then 'Client' else departments[1] end,
      departments = departments,
      client_name = case when p_role = 'Client' then btrim(p_client_name) else null end,
      custom_role_id = case when p_role = 'Client' then null else nullif(btrim(coalesce(p_custom_role_id, '')), '') end,
      custom_role_name = case when p_role = 'Client' then null else custom_role_name end,
      permissions = '{}'::jsonb,
      version = version + 1,
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_member_id
  returning * into member_row;

  update public.aitask_workspaces set version = version + 1, updated_at = now()
  where id = p_workspace_id returning version into workspace_version;

  insert into public.aitask_audit_events(workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields)
  values (p_workspace_id, actor.id, p_command_id, 'member.role.update', 'member', p_member_id,
    array['role', 'department', 'departments', 'client_name', 'custom_role_id', 'custom_role_name', 'permissions']);

  response := jsonb_build_object('ok', true, 'commandId', p_command_id, 'workspaceVersion', workspace_version,
    'member', jsonb_build_object('id', member_row.id, 'role', member_row.role, 'customRoleId', member_row.custom_role_id,
      'customRoleName', member_row.custom_role_name, 'clientName', member_row.client_name, 'departments', member_row.departments,
      'department', member_row.department, 'version', member_row.version, 'updated_at', member_row.updated_at));
  insert into public.aitask_command_receipts(workspace_id, actor_member_id, command_id, command_type, response)
  values (p_workspace_id, actor.id, p_command_id, 'member.role.update', response);
  return response;
end;
$$;

create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
begin
  if permissions ->> 'editTasks' = 'true'
    or permissions ->> 'manageUsers' = 'true'
    or permissions ->> 'approveRegistrations' = 'true'
    or permissions ->> 'deleteUsers' = 'true'
    or permissions ->> 'viewProductionReports' = 'true' then
    raise check_violation using message = 'Protected Boss Koo permissions cannot be delegated.';
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
declare role_data jsonb;
begin
  if new.permissions ->> 'editTasks' = 'true' then raise check_violation using message = 'Only Boss Koo can manage every task.'; end if;
  if new.custom_role_id is null then return new; end if;
  select entity.data into role_data from public.aitask_entities entity
  where entity.workspace_id = new.workspace_id and entity.entity_type = 'custom_role' and entity.entity_id = new.custom_role_id;
  if role_data is null or coalesce((role_data ->> 'isBuiltin')::boolean, false) or role_data ->> 'baseRole' is distinct from new.role then
    raise check_violation using message = 'Built-in roles cannot be assigned as custom member roles.';
  end if;
  return new;
end;
$$;

-- 5. The legacy permissions RPC already has the right protected-key filter;
-- allow it for direct HOD members as well as Staff.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.aitask_update_member_permissions(text, uuid, text, jsonb, bigint)'::regprocedure) into definition;
  definition := replace(definition, 'v_member.role <> ''Staff''', 'v_member.role not in (''HOD'', ''Staff'')');
  execute definition;
end;
$$;

-- Invitation finalization is still Staff-registration-only, but direct
-- invitations can now use the HOD role through the canonical role RPC.
do $$
declare item record; definition text; updated text;
begin
  for item in select proc.oid from pg_proc proc join pg_namespace n on n.oid = proc.pronamespace
    where n.nspname = 'public' and proc.proname = 'aitask_finalize_member_invitation_v2' and proc.prokind = 'f'
  loop
    definition := pg_get_functiondef(item.oid);
    updated := replace(definition, '''Project Manager'', ''Staff'', ''Client''', '''Project Manager'', ''HOD'', ''Staff'', ''Client''');
    if updated <> definition then execute updated; end if;
  end loop;
end;
$$;

alter table public.aitask_members drop constraint if exists aitask_members_departments_valid;
alter table public.aitask_members add constraint aitask_members_departments_valid
  check (departments = private.aitask_normalize_member_departments(role, departments));

revoke all on function private.aitask_member_role(text) from public, anon, authenticated;
grant execute on function private.aitask_member_role(text) to authenticated, service_role;
revoke all on function private.aitask_is_hod(text) from public, anon, authenticated;
grant execute on function private.aitask_is_hod(text) to authenticated, service_role;
revoke all on function private.aitask_role_is_department_scoped(text) from public, anon, authenticated;
grant execute on function private.aitask_role_is_department_scoped(text) to authenticated, service_role;
revoke all on function private.aitask_normalize_member_departments(text, text[]) from public, anon, authenticated;
revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;
revoke all on function public.aitask_update_member_role(text, uuid, text, text, text, text, text[], bigint) from public, anon;
grant execute on function public.aitask_update_member_role(text, uuid, text, text, text, text, text[], bigint) to authenticated, service_role;
