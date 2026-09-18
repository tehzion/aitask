-- Scope Project Managers (role 'Admin') to the companies, projects, and tasks
-- they own. Boss Koo (super admin) keeps full visibility. Staff/HOD rules are
-- unchanged except that Staff may no longer link to another Project Manager's
-- project just because its creator is an Admin; only Boss/legacy projects stay
-- open to them.
--
-- Ownership is derived from the entity's created_by column, which the
-- aitask_guard_entity trigger mirrors from data ->> 'createdBy'.

-- 1. Task visibility: Admin sees own/assigned work plus work inside owned
--    companies and projects. Super admin is never scoped.
create or replace function private.aitask_can_view_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then
        private.aitask_is_super_admin(p_workspace_id)
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = task.client_key
            and client.created_by = private.aitask_member_id(p_workspace_id)
        )
        or exists (
          select 1
          from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = task.parent_id
            and project.created_by = private.aitask_member_id(p_workspace_id)
        )
      when 'Staff' then
        private.aitask_has_permission(p_workspace_id, 'viewAllTasks')
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or (
          private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
          and task.created_by = private.aitask_member_id(p_workspace_id)
        )
        or (
          private.aitask_role_is_department_scoped(p_workspace_id)
          and coalesce(task.data ->> 'department', '') = any(coalesce((
            select member.departments from public.aitask_members member
            where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
          ), array[]::text[]))
        )
      when 'Client' then task.client_key = private.aitask_member_client_key(p_workspace_id)
      else false
    end
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

-- 2. Project visibility: Admin sees own projects (and projects owned via their
--    companies). Staff keep their own/visible/department rules, but a project
--    curated by another Project Manager no longer leaks to them.
create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then
        private.aitask_is_super_admin(p_workspace_id)
        or project.created_by = private.aitask_member_id(p_workspace_id)
      when 'Client' then project.client_key = private.aitask_member_client_key(p_workspace_id)
      when 'Staff' then
        project.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.parent_id = p_project_id
            and private.aitask_can_view_task(p_workspace_id, task.entity_id)
        )
        or (
          private.aitask_has_permission(p_workspace_id, 'createTasks')
          and (
            project.created_by is null
            or exists (
              select 1
              from public.aitask_members creator
              where creator.workspace_id = p_workspace_id
                and creator.id = project.created_by
                and creator.is_super_admin
            )
          )
        )
      else false
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
    limit 1
  ), false);
$$;

-- 3. Client visibility: Admin sees companies they created, plus companies
--    referenced by tasks visible to them.
create or replace function private.aitask_can_view_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.aitask_member_role(p_workspace_id)
    when 'Admin' then
      private.aitask_is_super_admin(p_workspace_id)
      or exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.client_key = p_client_key
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
      or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.client_key = p_client_key
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
    when 'Client' then p_client_key = private.aitask_member_client_key(p_workspace_id)
    when 'Staff' then private.aitask_has_permission(p_workspace_id, 'viewAllClients')
      or exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.client_key = p_client_key
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
      or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.client_key = p_client_key
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
    else false
  end;
$$;

-- 4. Client editing: Admin only edits companies they created; Staff keep the
--    assigned-client rule. Super admin is never scoped.
create or replace function private.aitask_can_edit_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_is_super_admin(p_workspace_id)
    or (
      private.aitask_member_role(p_workspace_id) = 'Admin'
      and exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.client_key = p_client_key
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
    )
    or (
      private.aitask_member_role(p_workspace_id) = 'Staff'
      and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')
      and exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.client_key = p_client_key
          and task.assigned_to = private.aitask_member_id(p_workspace_id)
      )
    );
$$;

-- 5. Entity mutations: project update/delete require ownership (super admin
--    still bypasses earlier in the function). Client delete for an Admin
--    requires ownership; Staff/HOD keep the deleteClients capability rule.
create or replace function private.aitask_can_mutate_entity(
  p_workspace_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_parent_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_client_key text := lower(btrim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
  v_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', p_old_data ->> 'createdBy', p_old_data ->> 'userId');
  v_notification_visible boolean := false;
  v_old_reads jsonb := coalesce(p_old_data -> 'readByUserIds', '[]'::jsonb);
  v_new_reads jsonb := coalesce(p_new_data -> 'readByUserIds', '[]'::jsonb);
  v_command_type text := current_setting('aitask.command_type', true);
  v_client_command_allowed boolean := current_setting('aitask.client_command_allowed', true) = 'true';
  v_parent_project_id text := nullif(btrim(coalesce(p_parent_id, '')), '');
  v_task_project_id text := nullif(btrim(coalesce(p_new_data ->> 'projectId', p_parent_id, '')), '');
  v_task_client_id text := nullif(btrim(coalesce(p_new_data ->> 'clientId', p_old_data ->> 'clientId', '')), '');
begin
  if v_member_id is null then return false; end if;
  if p_entity_type = 'task' and p_action in ('insert', 'update') then
    if v_parent_project_id is distinct from v_task_project_id
      or not private.aitask_task_project_link_is_valid(
        p_workspace_id, v_task_project_id, v_task_client_id, v_client_key
      )
      or not private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data) then
      return false;
    end if;
  end if;
  if private.aitask_is_super_admin(p_workspace_id) then
    if p_entity_type = 'custom_role' and p_entity_id = 'system-hod' and p_action = 'delete' then return false; end if;
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role in ('Admin', 'Staff') and v_creator = v_member_id
      when p_entity_type = 'project' then
        private.aitask_has_permission(p_workspace_id, 'createProjects')
        and v_creator = v_member_id
        and private.aitask_project_client_is_valid(p_workspace_id, p_new_data ->> 'clientId', v_client_key)
      when p_entity_type = 'client' then private.aitask_can_create_client(p_workspace_id)
      when p_entity_type in ('comment', 'approval') then
        v_creator = v_member_id and private.aitask_can_view_task(p_workspace_id, p_parent_id)
        and (v_role <> 'Client' or v_client_command_allowed)
      when p_entity_type = 'notification' then
        v_role in ('Admin', 'Staff')
        or (v_role = 'Client' and v_client_command_allowed and v_command_type in ('comment.add', 'approval.review'))
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_action = 'delete' then
    return case
      when p_entity_type = 'task' then private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
      when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
      when p_entity_type = 'client' then
        private.aitask_can_delete_client(p_workspace_id)
        and (
          v_role <> 'Admin'
          or exists (
            select 1
            from public.aitask_entities client
            where client.workspace_id = p_workspace_id
              and client.entity_type = 'client'
              and client.client_key = v_client_key
              and client.created_by = v_member_id
          )
        )
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_entity_type = 'notification' then
    v_notification_visible :=
      coalesce(p_old_data ->> 'targetUserId', '') = v_member_id
      or coalesce(p_old_data ->> 'targetRole', '') = v_role
      or (v_role = 'Client' and lower(btrim(coalesce(p_old_data ->> 'targetClient', ''))) = private.aitask_member_client_key(p_workspace_id));
    return v_notification_visible
      and (p_old_data - 'readByUserIds' - 'isRead' - 'unreadByUserIds') = (p_new_data - 'readByUserIds' - 'isRead' - 'unreadByUserIds')
      and (
        v_new_reads = v_old_reads
        or (v_old_reads ? v_member_id and v_new_reads = (v_old_reads - v_member_id))
        or (not (v_old_reads ? v_member_id) and v_new_reads = (v_old_reads || jsonb_build_array(v_member_id)))
      );
  end if;

  return case
    when p_entity_type = 'task' then
      private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      or (v_role = 'Client' and v_command_type = 'approval.review' and v_client_command_allowed)
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
    when p_entity_type = 'project' then
      coalesce(p_old_data ->> 'createdBy', '') = v_member_id
      and (
        coalesce(p_new_data ->> 'clientId', '') = coalesce(p_old_data ->> 'clientId', '')
        and lower(btrim(coalesce(p_new_data ->> 'clientName', ''))) = lower(btrim(coalesce(p_old_data ->> 'clientName', '')))
        or private.aitask_project_client_is_valid(p_workspace_id, p_new_data ->> 'clientId', v_client_key)
      )
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

-- 6. Admin role defaults no longer imply blanket task/client visibility. The
--    scoping above is the source of truth; has_permission stays consistent so
--    custom-role and capability checks behave the same way.
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
      when member.permissions <> '{}'::jsonb then coalesce(member.permissions ->> p_permission = 'true', false)
      when custom_role.data is not null then coalesce(custom_role.data -> 'permissions' ->> p_permission = 'true', false)
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard','viewTasks','viewCalendar','viewProjects','viewDeliveryTracker',
        'manageAssignedClients','viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks','createProjects','createClients','deleteClients',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewAssignedServiceClients','viewServicePrices'
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

revoke all on function private.aitask_can_view_task(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_view_project(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_view_client(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_edit_client(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;

grant execute on function private.aitask_can_view_task(text, text) to authenticated;
grant execute on function private.aitask_can_view_project(text, text) to authenticated;
grant execute on function private.aitask_can_view_client(text, text) to authenticated;
grant execute on function private.aitask_can_edit_client(text, text) to authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;
