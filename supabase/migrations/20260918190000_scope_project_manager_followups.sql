-- Project Manager ownership follow-ups discovered in the post-release audit.
--
-- 1. Renaming a company must authorize against the OLD client key: the
--    command preflight runs before the write, so the new name has no row yet.
-- 2. Editing a legacy company that has no client profile should match the
--    frontend rule (a task the Admin created or is assigned to).
-- 3. An Admin creating a task with no project may only reference a company
--    they can already view.
-- 4. The service-client workspace (entities + storage) is scoped to the
--    owning Project Manager; Boss Koo keeps full access.

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
      and (
        exists (
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
            and (
              task.created_by = private.aitask_member_id(p_workspace_id)
              or task.assigned_to = private.aitask_member_id(p_workspace_id)
            )
        )
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

create or replace function private.aitask_can_access_service_client(p_workspace_id text, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.aitask_is_super_admin(p_workspace_id) then true
    when private.aitask_member_role(p_workspace_id) = 'Admin' then
      exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.entity_id = p_client_id
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
      or exists (
        select 1
        from public.aitask_entities task
        join public.aitask_entities client
          on client.workspace_id = task.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and (task.client_id = p_client_id or task.client_key = client.client_key)
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
    else
      coalesce(
        private.aitask_has_permission(p_workspace_id, 'viewAllServiceClients')
        or private.aitask_has_permission(p_workspace_id, 'manageClientPlans')
        or private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.entity_id = p_client_id
            and client.client_key = private.aitask_member_client_key(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Client'
        )
        or exists (
          select 1 from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.client_id = p_client_id
            and task.assigned_to = private.aitask_member_id(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Staff'
            and private.aitask_has_permission(p_workspace_id, 'viewAssignedServiceClients')
        ), false
      )
  end;
$$;

revoke all on function private.aitask_can_edit_client(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.aitask_can_access_service_client(text, text) from public, anon;

grant execute on function private.aitask_can_edit_client(text, text) to authenticated;
grant execute on function private.aitask_can_access_service_client(text, text) to authenticated, service_role;
