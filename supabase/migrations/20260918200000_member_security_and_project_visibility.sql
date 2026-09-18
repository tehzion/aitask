-- Permission audit follow-ups for Project Managers (role 'Admin') and Staff.
--
-- 1. The command executor authorized every member operation with
--    aitask_is_admin (true for role 'Admin') and the member security trigger
--    let admins bypass all field protections. A Project Manager could
--    therefore create/update/delete members and self-promote to super admin.
--    Member management now requires Boss Koo (super admin); members may still
--    update their own non-security fields.
-- 2. aitask_can_view_project for an Admin now matches the frontend: a Project
--    Manager can also see a project on a company they own, or a project that
--    contains a task visible to them (so assigned tasks remain editable).
-- 3. aitask_can_view_client gains the matching visible-project branch.
-- 4. Company deletion for HOD/Staff now requires the company to be viewable.
-- 5. Admin role defaults drop the two keys their scoped paths no longer use.

-- 1. Member security ---------------------------------------------------------
create or replace function private.aitask_guard_member_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id text;
  v_workspace_id text;
begin
  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  if private.aitask_is_super_admin(v_workspace_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise check_violation using message = 'Only Boss Koo can create members.';
  end if;
  if tg_op = 'DELETE' then
    raise check_violation using message = 'Only Boss Koo can delete members.';
  end if;

  v_actor_member_id := private.aitask_member_id(old.workspace_id);
  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only Boss Koo can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.client_name is distinct from old.client_name
    or new.is_super_admin is distinct from old.is_super_admin
    or new.custom_role_id is distinct from old.custom_role_id
    or new.custom_role_name is distinct from old.custom_role_name
    or new.permissions is distinct from old.permissions
    or (new.must_reset_password and not old.must_reset_password) then
    raise check_violation using message = 'Member security fields require administrator access.';
  end if;

  return new;
end;
$$;

drop trigger if exists aitask_guard_member_security on public.aitask_members;
create trigger aitask_guard_member_security
  before insert or update or delete on public.aitask_members
  for each row execute function private.aitask_guard_member_security();

revoke all on function private.aitask_guard_member_security() from public;

-- 2. Project visibility parity ----------------------------------------------
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
        or exists (
          select 1
          from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = project.client_key
            and client.created_by = private.aitask_member_id(p_workspace_id)
        )
        or exists (
          select 1
          from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.parent_id = p_project_id
            and private.aitask_can_view_task(p_workspace_id, task.entity_id)
        )
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

-- 3. Client visibility parity -----------------------------------------------
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
      or exists (
        select 1
        from public.aitask_entities project
        where project.workspace_id = p_workspace_id
          and project.entity_type = 'project'
          and project.client_key = p_client_key
          and private.aitask_can_view_project(p_workspace_id, project.entity_id)
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

-- 4. Entity mutations (company delete now requires view access) -------------
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
  v_old_client_key text := lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')));
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
    if p_action = 'insert'
      and v_role = 'Admin'
      and v_task_project_id is null
      and not private.aitask_can_view_client(p_workspace_id, v_client_key) then
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
        and private.aitask_can_view_client(p_workspace_id, v_client_key)
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
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_old_client_key)
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

-- 5. Admin role defaults no longer include keys their scoped paths ignore ----
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
        'viewReports','viewApprovals','viewSettings','createTasks','manageCreatedTasks','createProjects','createClients','deleteClients',
        'manageServiceCatalog','manageTaskTemplates','manageClientPlans','manageServiceCycles',
        'viewAllServiceClients','viewServicePrices'
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

revoke all on function private.aitask_can_view_project(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_view_client(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.aitask_has_permission(text, text) from public, anon, authenticated;

grant execute on function private.aitask_can_view_project(text, text) to authenticated;
grant execute on function private.aitask_can_view_client(text, text) to authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;
