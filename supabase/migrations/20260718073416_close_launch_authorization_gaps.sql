-- Close launch-blocking authorization, client feedback, and account lifecycle gaps.

create or replace function private.aitask_is_super_admin(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select member.is_super_admin
    from public.aitask_members member
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

revoke all on function private.aitask_is_super_admin(text) from public, anon;
grant execute on function private.aitask_is_super_admin(text) to authenticated, service_role;

-- Resolve the same effective permissions as the frontend. Admin is a business
-- role; only is_super_admin grants identity, role, and registration controls.
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
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects',
        'viewAllTasks', 'viewAllClients', 'manageAssignedClients',
        'viewReports', 'viewSettings', 'createTasks', 'editTasks', 'createProjects'
      ]::text[])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects',
        'viewReports', 'viewSettings', 'createTasks'
      ]::text[])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects',
        'viewReports', 'viewSettings', 'clientReview'
      ]::text[])
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
    limit 1
  ), false);
$$;

revoke all on function private.aitask_has_permission(text, text) from public, anon;
grant execute on function private.aitask_has_permission(text, text) to authenticated, service_role;

create or replace function private.aitask_guard_member_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_actor_member_id := private.aitask_member_id(old.workspace_id);
  if private.aitask_is_super_admin(old.workspace_id) then
    return new;
  end if;

  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only the Super Admin can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.email is distinct from old.email
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.client_name is distinct from old.client_name
    or new.is_super_admin is distinct from old.is_super_admin
    or new.custom_role_id is distinct from old.custom_role_id
    or new.custom_role_name is distinct from old.custom_role_name
    or new.permissions is distinct from old.permissions
    or (new.must_reset_password and not old.must_reset_password) then
    raise check_violation using message = 'Use the secure account service for identity or permission changes.';
  end if;

  return new;
end;
$$;

drop trigger if exists aitask_guard_member_security on public.aitask_members;
create trigger aitask_guard_member_security
  before update on public.aitask_members
  for each row execute function private.aitask_guard_member_security();

revoke all on function private.aitask_guard_member_security() from public, anon, authenticated;

drop policy if exists "admins can insert members" on public.aitask_members;
drop policy if exists "super admins can insert members" on public.aitask_members;
create policy "super admins can insert members" on public.aitask_members
  for insert to authenticated
  with check (private.aitask_is_super_admin(workspace_id));

drop policy if exists "admins or self can update members" on public.aitask_members;
drop policy if exists "super admins or self can update members" on public.aitask_members;
create policy "super admins or self can update members" on public.aitask_members
  for update to authenticated
  using (private.aitask_is_super_admin(workspace_id) or auth_user_id = (select auth.uid()))
  with check (private.aitask_is_super_admin(workspace_id) or auth_user_id = (select auth.uid()));

drop policy if exists "admins can delete members" on public.aitask_members;
drop policy if exists "super admins can delete members" on public.aitask_members;
create policy "super admins can delete members" on public.aitask_members
  for delete to authenticated
  using (private.aitask_is_super_admin(workspace_id) and auth_user_id is distinct from (select auth.uid()));

drop policy if exists "mfa admins can read audit events" on public.aitask_audit_events;
drop policy if exists "admins can read audit events" on public.aitask_audit_events;
drop policy if exists "super admins can read audit events" on public.aitask_audit_events;
create policy "super admins can read audit events" on public.aitask_audit_events
  for select to authenticated
  using (private.aitask_is_super_admin(workspace_id));

-- Do not let the Admin business role read pending registration data through
-- the broad entity shortcut. Each entity now follows its scoped helper.
drop policy if exists "members can read scoped entities" on public.aitask_entities;
create policy "members can read scoped entities" on public.aitask_entities
  for select to authenticated
  using (
    (entity_type = 'task' and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client' and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project' and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type in ('task_status', 'custom_role') and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'registration' and private.aitask_has_permission(workspace_id, 'approveRegistrations'))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client' and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
  );

create or replace function private.aitask_client_command_allowed(
  p_workspace_id text,
  p_command_type text,
  p_operations jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_client_key text := private.aitask_member_client_key(p_workspace_id);
  v_task_operation jsonb;
  v_child_operation jsonb;
  v_task_id text;
  v_old_task jsonb;
  v_new_task jsonb;
  v_child_data jsonb;
  v_review_status text;
  v_old_revision integer;
  v_old_completion integer;
begin
  if private.aitask_member_role(p_workspace_id) <> 'Client'
    or v_member_id is null
    or v_client_key = '' then
    return false;
  end if;

  if p_command_type = 'comment.add' then
    if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) <> 1 then
      return false;
    end if;
    v_child_operation := p_operations -> 0;
    if v_child_operation ->> 'kind' <> 'entity'
      or v_child_operation ->> 'action' <> 'insert'
      or v_child_operation ->> 'entityType' <> 'comment' then
      return false;
    end if;
    v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);
    v_task_id := coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId');
    select task.data into v_old_task
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = v_task_id;

    return v_old_task is not null
      and lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) = v_client_key
      and v_child_data ->> 'id' = v_child_operation ->> 'entityId'
      and v_child_data ->> 'taskId' = v_task_id
      and v_child_data ->> 'userId' = v_member_id
      and length(btrim(coalesce(v_child_data ->> 'text', ''))) between 1 and 2000;
  end if;

  if p_command_type <> 'approval.review'
    or jsonb_typeof(p_operations) <> 'array'
    or jsonb_array_length(p_operations) <> 2 then
    return false;
  end if;

  select value into v_task_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'update'
    and value ->> 'entityType' = 'task'
  limit 1;

  select value into v_child_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'insert'
    and value ->> 'entityType' = 'approval'
  limit 1;

  if v_task_operation is null or v_child_operation is null then return false; end if;
  v_task_id := v_task_operation ->> 'entityId';
  v_new_task := coalesce(v_task_operation -> 'data', '{}'::jsonb);
  v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);

  select task.data into v_old_task
  from public.aitask_entities task
  where task.workspace_id = p_workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;

  if v_old_task is null
    or lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) <> v_client_key
    or not (coalesce((v_old_task ->> 'isCompleted')::boolean, false) or v_old_task ->> 'status' = 'Waiting Approval')
    or coalesce(v_old_task ->> 'clientApprovalStatus', 'Pending') = 'Approved'
    or v_child_data ->> 'id' <> v_child_operation ->> 'entityId'
    or v_child_data ->> 'taskId' <> v_task_id
    or coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId') <> v_task_id
    or v_child_data ->> 'userId' <> v_member_id
    or length(coalesce(v_child_data ->> 'note', '')) > 2000
    or (v_old_task - array['clientApprovalStatus', 'status', 'isCompleted', 'completionPercentage', 'revisionCount']::text[])
      is distinct from
      (v_new_task - array['clientApprovalStatus', 'status', 'isCompleted', 'completionPercentage', 'revisionCount']::text[])
    or coalesce(v_old_task ->> 'revisionCount', '0') !~ '^[0-9]+$'
    or coalesce(v_old_task ->> 'completionPercentage', '0') !~ '^[0-9]+$' then
    return false;
  end if;

  v_review_status := v_child_data ->> 'status';
  v_old_revision := coalesce((v_old_task ->> 'revisionCount')::integer, 0);
  v_old_completion := coalesce((v_old_task ->> 'completionPercentage')::integer, 0);

  if v_new_task ->> 'clientApprovalStatus' <> v_review_status then return false; end if;
  if v_review_status = 'Approved' then
    return v_new_task ->> 'status' = 'Completed'
      and coalesce((v_new_task ->> 'isCompleted')::boolean, false)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = 100
      and coalesce((v_new_task ->> 'revisionCount')::integer, -1) = v_old_revision;
  end if;
  if v_review_status = 'Rejected' then
    return v_new_task ->> 'status' = 'In Progress'
      and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = least(v_old_completion, 90)
      and coalesce((v_new_task ->> 'revisionCount')::integer, -1) = v_old_revision + 1;
  end if;
  return false;
exception
  when invalid_text_representation then return false;
end;
$$;

revoke all on function private.aitask_client_command_allowed(text, text, jsonb) from public, anon, authenticated;

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
      when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
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
    when p_entity_type = 'project' then coalesce(p_old_data ->> 'createdBy', '') = v_member_id
    when p_entity_type in ('comment', 'approval') then v_creator = v_member_id and v_role <> 'Client'
    when p_entity_type in ('registration', 'custom_role', 'task_status') then private.aitask_is_super_admin(p_workspace_id)
    else false
  end;
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Keep the proven version/conflict engine, but put a strict authorization and
-- server-side notification wrapper in front of it.
alter function public.aitask_execute_command(text, uuid, text, jsonb)
  rename to aitask_execute_command_legacy;

revoke all on function public.aitask_execute_command_legacy(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.aitask_execute_command_legacy(text, uuid, text, jsonb) to service_role;

create or replace function public.aitask_execute_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
  v_actor_name text;
  v_super_admin boolean := private.aitask_is_super_admin(p_workspace_id);
  v_client_allowed boolean := false;
  v_operation jsonb;
  v_operations jsonb := p_operations;
  v_task_id text;
  v_task_data jsonb;
  v_notification_id text;
  v_now_text text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_title text;
  v_message text;
begin
  if (select auth.uid()) is null or v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed command operations.');
  end if;

  if p_command_type in ('member.manage', 'role.manage', 'registration.review', 'task_status.manage')
    and not v_super_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if v_operation ->> 'kind' = 'member' then
      if v_operation ->> 'action' in ('insert', 'delete') then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Use the secure account service to add or remove members.');
      end if;
      if (v_operation ->> 'entityId') <> v_actor_id and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
      end if;
      if (v_operation ->> 'entityId') = v_actor_id and p_command_type <> 'member.update' and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid member update command.');
      end if;
    end if;
    if v_operation ->> 'kind' = 'entity'
      and v_operation ->> 'entityType' in ('registration', 'custom_role', 'task_status')
      and not v_super_admin then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
    end if;
  end loop;

  if v_actor_role = 'Client' and p_command_type in ('comment.add', 'approval.review') then
    v_client_allowed := private.aitask_client_command_allowed(p_workspace_id, p_command_type, p_operations);
    if not v_client_allowed then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This client feedback command is not allowed.');
    end if;

    if p_command_type = 'comment.add' then
      v_task_id := coalesce(nullif(p_operations -> 0 ->> 'parentId', ''), p_operations -> 0 -> 'data' ->> 'taskId');
    else
      select value ->> 'entityId' into v_task_id
      from jsonb_array_elements(p_operations) item(value)
      where value ->> 'entityType' = 'task' and value ->> 'action' = 'update'
      limit 1;
    end if;

    select task.data into v_task_data
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id and task.entity_type = 'task' and task.entity_id = v_task_id;
    select member.name into v_actor_name
    from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.id = v_actor_id;

    if p_command_type = 'comment.add' then
      v_title := 'Client Feedback';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' commented on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    elsif p_operations @? '$[*] ? (@.entityType == "approval" && @.data.status == "Approved")' then
      v_title := 'Client Approved Task';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' approved "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    else
      v_title := 'Client Requested Revision';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' requested changes on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    end if;

    v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
    v_operations := v_operations || jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
      'entityId', v_notification_id, 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', v_notification_id, 'targetRole', 'Admin', 'title', v_title,
        'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
        'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
        'iconType', case when p_command_type = 'comment.add' then 'status'
          when v_title = 'Client Approved Task' then 'success' else 'alert' end
      )
    ));

    if nullif(v_task_data ->> 'assignedTo', '') is not null then
      v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
      v_operations := v_operations || jsonb_build_array(jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', v_notification_id, 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', v_notification_id, 'targetUserId', v_task_data ->> 'assignedTo', 'title', v_title,
          'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
          'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
          'iconType', case when p_command_type = 'comment.add' then 'status'
            when v_title = 'Client Approved Task' then 'success' else 'alert' end
        )
      ));
    end if;
  end if;

  perform set_config('aitask.command_type', p_command_type, true);
  perform set_config('aitask.client_command_allowed', case when v_client_allowed then 'true' else 'false' end, true);
  return public.aitask_execute_command_legacy(p_workspace_id, p_command_id, p_command_type, v_operations);
end;
$$;

revoke all on function public.aitask_execute_command(text, uuid, text, jsonb) from public, anon;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb) to authenticated, service_role;

create or replace function public.aitask_update_member_email(
  p_actor_member_id text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_command_id uuid := gen_random_uuid();
  v_workspace_version bigint;
begin
  select member.* into v_actor
  from public.aitask_members member
  where member.id = p_actor_member_id
  for update;
  if not found or v_actor.auth_user_id is null then raise exception 'Linked member not found'; end if;
  if v_email = '' or length(v_email) > 320 then raise exception 'Valid email required'; end if;
  if exists (
    select 1 from public.aitask_members member
    where member.workspace_id = v_actor.workspace_id
      and member.id <> v_actor.id
      and lower(coalesce(member.email, '')) = v_email
  ) then raise exception 'Email already belongs to another member'; end if;

  update public.aitask_members
  set email = v_email
  where workspace_id = v_actor.workspace_id and id = v_actor.id;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
  ) values (v_actor.workspace_id, v_actor.id, v_command_id, 'account.email.update', 'member', v_actor.id, array['email']);

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = v_actor.workspace_id
  returning version into v_workspace_version;

  return jsonb_build_object('ok', true, 'workspaceVersion', v_workspace_version);
end;
$$;

revoke all on function public.aitask_update_member_email(text, text) from public, anon, authenticated;
grant execute on function public.aitask_update_member_email(text, text) to service_role;

create or replace function public.aitask_delete_member_account(
  p_actor_member_id text,
  p_member_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_target public.aitask_members%rowtype;
  v_command_id uuid := gen_random_uuid();
  v_workspace_version bigint;
begin
  select member.* into v_actor
  from public.aitask_members member
  where member.id = p_actor_member_id and member.is_super_admin = true
  for update;
  if not found then raise exception 'Super Admin permission required'; end if;

  select member.* into v_target
  from public.aitask_members member
  where member.workspace_id = v_actor.workspace_id and member.id = p_member_id
  for update;
  if not found then raise exception 'Member not found'; end if;
  if v_target.id = v_actor.id or v_target.is_super_admin then raise exception 'Protected member cannot be deleted'; end if;
  if exists (
    select 1 from public.aitask_entities task
    where task.workspace_id = v_actor.workspace_id
      and task.entity_type = 'task'
      and task.assigned_to = v_target.id
  ) then raise exception 'Reassign this member''s tasks before deleting the account'; end if;

  delete from public.aitask_members
  where workspace_id = v_actor.workspace_id and id = v_target.id;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
  ) values (v_actor.workspace_id, v_actor.id, v_command_id, 'account.delete', 'member', v_target.id, array['account']);

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = v_actor.workspace_id
  returning version into v_workspace_version;

  return jsonb_build_object('ok', true, 'workspaceVersion', v_workspace_version);
end;
$$;

revoke all on function public.aitask_delete_member_account(text, text) from public, anon, authenticated;
grant execute on function public.aitask_delete_member_account(text, text) to service_role;
