-- Keep Staff-created companies visible and reject unsafe linked-task rewrites.

create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
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
      else false
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_rewrite_project_tasks(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.parent_id = p_project_id
      and not private.aitask_can_edit_task(p_workspace_id, task.entity_id)
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
  v_client_key text := lower(trim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
  v_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', p_old_data ->> 'createdBy', p_old_data ->> 'userId');
  v_notification_visible boolean := false;
  v_old_reads jsonb := coalesce(p_old_data -> 'readByUserIds', '[]'::jsonb);
  v_new_reads jsonb := coalesce(p_new_data -> 'readByUserIds', '[]'::jsonb);
  v_command_type text := current_setting('aitask.command_type', true);
  v_client_command_allowed boolean := current_setting('aitask.client_command_allowed', true) = 'true';
  v_project_identity_unchanged boolean :=
    coalesce(p_new_data ->> 'clientName', '') = coalesce(p_old_data ->> 'clientName', '')
    and coalesce(p_new_data ->> 'projectName', '') = coalesce(p_old_data ->> 'projectName', '');
begin
  if v_member_id is null then return false; end if;
  if private.aitask_is_super_admin(p_workspace_id) then return true; end if;

  if private.aitask_is_admin(p_workspace_id)
    and p_entity_type in ('client', 'project', 'task', 'comment', 'approval', 'notification') then
    return true;
  end if;

  if p_action = 'insert' then
    return case
      when p_entity_type = 'task' then v_role = 'Staff' and v_creator = v_member_id
      when p_entity_type = 'project' then private.aitask_has_permission(p_workspace_id, 'createProjects') and v_creator = v_member_id
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type in ('comment', 'approval') then
        v_creator = v_member_id
        and private.aitask_can_view_task(p_workspace_id, p_parent_id)
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
      when p_entity_type = 'project' then
        coalesce(p_old_data ->> 'createdBy', '') = v_member_id
        and private.aitask_can_rewrite_project_tasks(p_workspace_id, p_entity_id)
      when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
      when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
      when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
      else false
    end;
  end if;

  if p_entity_type = 'notification' then
    v_notification_visible :=
      coalesce(p_old_data ->> 'targetUserId', '') = v_member_id
      or coalesce(p_old_data ->> 'targetRole', '') = v_role
      or (v_role = 'Client' and lower(trim(coalesce(p_old_data ->> 'targetClient', ''))) = private.aitask_member_client_key(p_workspace_id));
    return v_notification_visible
      and (p_old_data - 'readByUserIds' - 'isRead') = (p_new_data - 'readByUserIds' - 'isRead')
      and v_new_reads @> v_old_reads
      and v_new_reads @> jsonb_build_array(v_member_id);
  end if;

  return case
    when p_entity_type = 'task' then
      private.aitask_can_edit_task(p_workspace_id, p_entity_id)
      or (v_role = 'Client' and v_command_type = 'approval.review' and v_client_command_allowed)
    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_client_key)
    when p_entity_type = 'project' then
      coalesce(p_old_data ->> 'createdBy', '') = v_member_id
      and (
        v_project_identity_unchanged
        or private.aitask_can_rewrite_project_tasks(p_workspace_id, p_entity_id)
      )
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_view_project(text, text) from public, anon;
revoke all on function private.aitask_can_rewrite_project_tasks(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.aitask_can_view_project(text, text) to authenticated;
