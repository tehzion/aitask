-- Keep Staff permissions identical at the UI and database boundaries.
-- Staff may create work only for themselves, may emit only canonical task-linked
-- notifications, and may execute (but not administrate) assigned service work.

create or replace function private.aitask_task_assignment_is_valid(
  p_workspace_id text,
  p_action text,
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
  v_old_assignee text := coalesce(p_old_data ->> 'assignedTo', '');
  v_new_assignee text := coalesce(p_new_data ->> 'assignedTo', '');
  v_old_department text := private.aitask_task_department(p_old_data ->> 'department');
  v_new_department text := private.aitask_task_department(p_new_data ->> 'department');
  v_actor_member_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
begin
  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department then
    return true;
  end if;
  if v_new_assignee = '' or v_new_department is null then return false; end if;

  if p_action = 'insert' and v_actor_role = 'Staff' and not exists (
    select 1
    from public.aitask_members actor
    where actor.workspace_id = p_workspace_id
      and actor.id = v_actor_member_id
      and v_new_department = any(actor.departments)
      and (
        v_new_assignee = v_actor_member_id
        or private.aitask_has_permission(p_workspace_id, 'editTasks')
      )
  ) then
    return false;
  end if;

  return exists (
    select 1
    from public.aitask_members member
    where member.workspace_id = p_workspace_id
      and member.id = v_new_assignee
      and member.role <> 'Client'
      and v_new_department = any(member.departments)
  );
end;
$$;

revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb)
  from public, anon, authenticated;

-- Record task writes completed inside the current command transaction. A Staff
-- notification must refer to one of these task ids, preventing standalone or
-- unrelated notification inserts through the generic command endpoint.
create or replace function private.aitask_track_staff_task_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := coalesce(new.workspace_id, old.workspace_id);
  v_task_id text := coalesce(new.entity_id, old.entity_id);
  v_actor_id text := private.aitask_member_id(v_workspace_id);
  v_actor_name text;
  v_notification_id text;
  v_context jsonb;
  v_delete_notice_context jsonb;
begin
  if coalesce(new.entity_type, old.entity_type) <> 'task' then
    return coalesce(new, old);
  end if;
  if private.aitask_member_role(v_workspace_id) is distinct from 'Staff' then
    return coalesce(new, old);
  end if;

  begin
    v_context := coalesce(nullif(current_setting('aitask.staff_task_context', true), ''), '[]')::jsonb;
  exception when others then
    v_context := '[]'::jsonb;
  end;
  if not (v_context ? v_task_id) then
    perform set_config(
      'aitask.staff_task_context',
      (v_context || jsonb_build_array(v_task_id))::text,
      true
    );
  end if;

  if tg_op = 'DELETE' then
    begin
      v_delete_notice_context := coalesce(
        nullif(current_setting('aitask.staff_delete_notice_context', true), ''),
        '[]'
      )::jsonb;
    exception when others then
      v_delete_notice_context := '[]'::jsonb;
    end;
    if v_delete_notice_context ? v_task_id then
      return old;
    end if;

    select member.name into v_actor_name
    from public.aitask_members member
    where member.workspace_id = v_workspace_id and member.id = v_actor_id;
    v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
    perform set_config('aitask.server_notification', 'true', true);
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
    values (
      v_workspace_id,
      'notification',
      v_notification_id,
      jsonb_build_object(
        'id', v_notification_id,
        'targetRole', 'Admin',
        'title', 'Task Deleted',
        'message', coalesce(nullif(btrim(v_actor_name), ''), 'Staff')
          || ' deleted "' || left(coalesce(old.data ->> 'title', 'Task'), 160) || '".',
        'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
        'isRead', false,
        'readByUserIds', jsonb_build_array(),
        'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'iconType', 'alert'
      )
    );
    perform set_config('aitask.server_notification', 'false', true);
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_track_staff_task_command()
  from public, anon, authenticated;

drop trigger if exists aitask_track_staff_task_command on public.aitask_entities;
create trigger aitask_track_staff_task_command
  after insert or update or delete on public.aitask_entities
  for each row
  execute function private.aitask_track_staff_task_command();

create or replace function private.aitask_guard_staff_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(new.workspace_id);
  v_actor_name text;
  v_command_type text := current_setting('aitask.command_type', true);
  v_context jsonb;
  v_task_id text := nullif(btrim(new.data -> 'route' ->> 'entityId'), '');
  v_task jsonb;
  v_title text := new.data ->> 'title';
  v_target_user text := nullif(btrim(new.data ->> 'targetUserId'), '');
  v_target_role text := nullif(btrim(new.data ->> 'targetRole'), '');
  v_target_client text := lower(btrim(coalesce(new.data ->> 'targetClient', '')));
  v_task_client text;
  v_message text;
begin
  if current_setting('aitask.server_notification', true) = 'true' then return new; end if;
  if private.aitask_member_role(new.workspace_id) is distinct from 'Staff' then return new; end if;

  begin
    v_context := coalesce(nullif(current_setting('aitask.staff_task_context', true), ''), '[]')::jsonb;
  exception when others then
    v_context := '[]'::jsonb;
  end;

  -- Older cached clients placed the deletion notice before the task delete and
  -- did not include its entity id in the route. The command wrapper seeds the
  -- complete authorized task context so that this one legacy shape can be
  -- bound to an unambiguous task without accepting standalone notices.
  if v_task_id is null
    and v_title = 'Task Deleted'
    and v_command_type = 'task.delete'
    and jsonb_array_length(v_context) = 1 then
    v_task_id := v_context ->> 0;
  end if;

  if (new.data -> 'route' ->> 'page') is distinct from 'tasks'
    or v_task_id is null
    or not (v_context ? v_task_id)
    or v_command_type not in (
      'workspace.patch', 'task.create', 'task.update', 'comment.add',
      'approval.revision', 'reminder.generate', 'task.delete'
    ) then
    raise check_violation using message = 'Staff notifications must belong to the task changed by this command.';
  end if;

  select task.data into v_task
  from public.aitask_entities task
  where task.workspace_id = new.workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;
  if v_task is null or not private.aitask_can_edit_task(new.workspace_id, v_task_id) then
    raise check_violation using message = 'Staff notifications require an editable task.';
  end if;

  if ((v_target_user is not null)::integer
      + (v_target_role is not null)::integer
      + (v_target_client <> '')::integer) <> 1 then
    raise check_violation using message = 'Staff notifications require one approved audience.';
  end if;

  v_task_client := lower(btrim(coalesce(v_task ->> 'clientName', '')));
  if v_target_role is not null and v_target_role <> 'Admin' then
    raise check_violation using message = 'Staff role notifications may target Admin only.';
  elsif v_target_user is not null and v_target_user <> nullif(v_task ->> 'assignedTo', '') then
    raise check_violation using message = 'Staff user notifications may target the task assignee only.';
  elsif v_target_client <> '' and (
    v_target_client <> v_task_client
    or coalesce(v_task ->> 'visibility', 'internal') = 'internal'
  ) then
    raise check_violation using message = 'Staff client notifications require a visible task for that client.';
  end if;

  select member.name into v_actor_name
  from public.aitask_members member
  where member.workspace_id = new.workspace_id and member.id = v_actor_id;
  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Staff');

  v_message := case
    when v_title = 'Task Created by Staff' and v_target_role = 'Admin'
      and v_command_type in ('task.create', 'workspace.patch')
      then v_actor_name || ' created a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Task Assigned' and v_target_user is not null
      and v_command_type in ('task.create', 'workspace.patch')
      then 'You have been assigned a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Assigned To You' and v_target_user is not null
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" has been assigned to you by ' || v_actor_name || '.'
    when v_title = 'Task Status Updated' and v_target_role = 'Admin'
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" was moved to '
        || left(coalesce(v_task ->> 'status', 'Updated'), 80) || ' by ' || v_actor_name || '.'
    when v_title = 'Task Deleted' and v_target_role = 'Admin'
      and v_command_type = 'task.delete'
      then v_actor_name || ' deleted "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title in ('Task Completed', 'Task Ready for Approval') and v_target_client <> ''
      and v_command_type in ('task.update', 'workspace.patch')
      and coalesce(v_task ->> 'status', '') in ('Completed', 'Waiting Approval')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is ready for client review.'
    when v_title = 'New Comment' and v_target_user is not null
      and v_command_type in ('comment.add', 'workspace.patch')
      then 'You have a new comment on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Comment' and v_target_role = 'Admin'
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' commented on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Team Update' and v_target_client <> ''
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' posted an update on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Revision Requested' and v_target_user is not null
      and v_command_type in ('approval.revision', 'workspace.patch')
      then v_actor_name || ' requested a revision on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Deadline Approaching'
      and (v_target_role = 'Admin' or v_target_user is not null)
      and v_command_type in ('reminder.generate', 'workspace.patch')
      then case
        when coalesce(v_task ->> 'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then null
        else (
          case
            when (v_task ->> 'dueDate')::date = current_date then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is due today.'
            when (v_task ->> 'dueDate')::date = current_date + 1 then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is due tomorrow.'
            else null
          end
        )
      end
    else null
  end;

  if v_message is null then
    raise check_violation using message = 'This Staff notification is not permitted.';
  end if;
  new.data := jsonb_set(
    new.data,
    '{route}',
    jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
    true
  );
  new.data := jsonb_set(new.data, '{message}', to_jsonb(v_message), true);
  if v_title = 'Task Deleted' then
    begin
      v_context := coalesce(
        nullif(current_setting('aitask.staff_delete_notice_context', true), ''),
        '[]'
      )::jsonb;
    exception when others then
      v_context := '[]'::jsonb;
    end;
    if not (v_context ? v_task_id) then
      perform set_config(
        'aitask.staff_delete_notice_context',
        (v_context || jsonb_build_array(v_task_id))::text,
        true
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_staff_notification_insert()
  from public, anon, authenticated;

drop trigger if exists aitask_00_guard_staff_notification_insert on public.aitask_entities;
create trigger aitask_00_guard_staff_notification_insert
  before insert on public.aitask_entities
  for each row
  when (new.entity_type = 'notification')
  execute function private.aitask_guard_staff_notification_insert();

-- The service RPC is intentionally callable by authenticated members. This
-- trigger is therefore the final write boundary for scoped Staff, including old
-- RPC signatures retained for compatible clients.
create or replace function private.aitask_guard_scoped_staff_service_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
  v_actor_id text := private.aitask_member_id(v_workspace_id);
  v_expected_cycle_status text;
  v_cycle_id text;
  v_client_id text;
begin
  if v_entity_type not in ('service_cycle', 'deliverable', 'cycle_comment') then
    return coalesce(new, old);
  end if;
  if private.aitask_member_role(v_workspace_id) is distinct from 'Staff'
    or private.aitask_has_permission(v_workspace_id, 'manageServiceCycles') then
    return coalesce(new, old);
  end if;

  if v_entity_type = 'service_cycle' then
    if tg_op <> 'UPDATE'
      or (old.data - array['status', 'updatedAt']::text[])
        is distinct from (new.data - array['status', 'updatedAt']::text[]) then
      raise check_violation using message = 'Staff cannot administer service cycles.';
    end if;

    select case
      when count(*) > 0 and bool_and(deliverable.data ->> 'status' = 'Delivered') then 'Completed'
      when old.data ->> 'status' = 'Completed' then 'Published'
      else null
    end into v_expected_cycle_status
    from public.aitask_entities deliverable
    where deliverable.workspace_id = v_workspace_id
      and deliverable.entity_type = 'deliverable'
      and deliverable.cycle_id = old.entity_id;
    if v_expected_cycle_status is null or new.data ->> 'status' <> v_expected_cycle_status then
      raise check_violation using message = 'Staff cannot publish or manually change service cycles.';
    end if;
    return new;
  end if;

  if v_entity_type = 'deliverable' then
    if tg_op <> 'UPDATE'
      or (
        not private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'updatedAt']::text[])
      )
      or (
        private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'taskIds', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'taskIds', 'updatedAt']::text[])
      )
      or new.data ->> 'status' not in ('Planned', 'In Progress', 'Ready', 'Delivered') then
      raise check_violation using message = 'Staff may update deliverable execution fields only.';
    end if;
    return new;
  end if;

  if v_entity_type = 'cycle_comment' then
    v_cycle_id := coalesce(new.data ->> 'cycleId', old.data ->> 'cycleId');
    v_client_id := coalesce(new.data ->> 'clientId', old.data ->> 'clientId');
    if not exists (
      select 1
      from public.aitask_entities cycle
      where cycle.workspace_id = v_workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.entity_id = v_cycle_id
        and cycle.client_id = v_client_id
    ) then
      raise check_violation using message = 'Cycle comment scope is invalid.';
    end if;

    if tg_op = 'INSERT' then
      if new.data ->> 'userId' <> v_actor_id
        or btrim(coalesce(new.data ->> 'text', '')) = ''
        or length(new.data ->> 'text') > 10000
        or new.data ->> 'visibility' not in ('internal', 'client-visible') then
        raise check_violation using message = 'Staff comments must be valid and owned by the signed-in member.';
      end if;
      return new;
    elsif tg_op = 'UPDATE' then
      if old.data ->> 'userId' <> v_actor_id
        or new.data ->> 'userId' <> v_actor_id
        or (old.data - array['attachments', 'updatedAt']::text[])
          is distinct from (new.data - array['attachments', 'updatedAt']::text[])
        or jsonb_typeof(coalesce(new.data -> 'attachments', '[]'::jsonb)) <> 'array' then
        raise check_violation using message = 'Staff may update attachments on their own cycle comments only.';
      end if;
      return new;
    end if;
  end if;

  raise check_violation using message = 'Staff cannot create or delete service-management records.';
end;
$$;

revoke all on function private.aitask_guard_scoped_staff_service_write()
  from public, anon, authenticated;

drop trigger if exists aitask_00_guard_scoped_staff_service_write on public.aitask_entities;
create trigger aitask_00_guard_scoped_staff_service_write
  before insert or update or delete on public.aitask_entities
  for each row
  execute function private.aitask_guard_scoped_staff_service_write();

-- Seed the complete set of task ids from the command before the legacy command
-- engine begins applying operations. This keeps notification authorization
-- independent of operation order for cached clients while the legacy engine's
-- all-operation preflight remains the authority for whether each task write is
-- permitted.
create or replace function private.aitask_seed_staff_task_context(
  p_workspace_id text,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := '[]'::jsonb;
begin
  if private.aitask_member_role(p_workspace_id) = 'Staff'
    and jsonb_typeof(p_operations) = 'array' then
    select coalesce(jsonb_agg(distinct operation ->> 'entityId'), '[]'::jsonb)
      into v_context
    from jsonb_array_elements(p_operations) operation
    where operation ->> 'kind' = 'entity'
      and operation ->> 'entityType' = 'task'
      and operation ->> 'action' in ('insert', 'update', 'delete')
      and nullif(btrim(operation ->> 'entityId'), '') is not null;
  end if;

  perform set_config('aitask.staff_task_context', v_context::text, true);
  perform set_config('aitask.staff_delete_notice_context', '[]', true);
end;
$$;

revoke all on function private.aitask_seed_staff_task_context(text, jsonb)
  from public, anon, authenticated, service_role;

-- Keep both public signatures stable. Their former implementations remain
-- callable only by these security-definer wrappers.
alter function public.aitask_execute_command(text, uuid, text, jsonb)
  rename to aitask_execute_command_before_staff_context;
alter function public.aitask_execute_command(text, uuid, text, jsonb, bigint)
  rename to aitask_execute_command_with_lock_before_staff_context;

revoke all on function public.aitask_execute_command_before_staff_context(text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.aitask_execute_command_with_lock_before_staff_context(text, uuid, text, jsonb, bigint)
  from public, anon, authenticated, service_role;

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
begin
  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
  return public.aitask_execute_command_before_staff_context(
    p_workspace_id, p_command_id, p_command_type, p_operations
  );
end;
$$;

create or replace function public.aitask_execute_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
  return public.aitask_execute_command_with_lock_before_staff_context(
    p_workspace_id, p_command_id, p_command_type, p_operations,
    p_expected_workspace_version
  );
end;
$$;

revoke all on function public.aitask_execute_command(text, uuid, text, jsonb)
  from public, anon;
revoke all on function public.aitask_execute_command(text, uuid, text, jsonb, bigint)
  from public, anon;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb, bigint)
  to authenticated, service_role;
