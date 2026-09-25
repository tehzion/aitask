-- Staff notifications may reach the Project Manager who assigned or created the task.
--
-- resolveTaskUpdateRecipientIds notifies super admins plus the owning Project
-- Manager, chosen as task.assignedBy, then task.createdBy, then the client or
-- project owner. The guard only accepted the client/project owner, so when a PM
-- assigned a task on a company owned by someone else (very common: Boss owns
-- the company), the notification to that PM was rejected with check_violation
-- and the whole Staff status update / comment failed with "The command contains
-- invalid data." Accept the task's assignedBy/createdBy Project Manager too.

CREATE OR REPLACE FUNCTION private.aitask_guard_staff_notification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_target_role is not null and v_target_role <> 'Project Manager' then
    raise check_violation using message = 'Staff role notifications may target Project Manager only.';
  elsif v_target_user is not null
    and v_target_user <> coalesce(nullif(v_task ->> 'assignedTo', ''), '')
    and not exists (
      select 1
      from public.aitask_members recipient
      where recipient.workspace_id = new.workspace_id
        and recipient.id = v_target_user
        and (
          recipient.is_super_admin
          or recipient.id = (
            select client.created_by from public.aitask_entities client
            where client.workspace_id = new.workspace_id
              and client.entity_type = 'client'
              and client.client_key = lower(btrim(coalesce(v_task ->> 'clientName', '')))
            limit 1
          )
          or recipient.id = (
            select project.created_by from public.aitask_entities project
            where project.workspace_id = new.workspace_id
              and project.entity_type = 'project'
              and project.entity_id = nullif(btrim(coalesce(v_task ->> 'projectId', '')), '')
            limit 1
          )
          or (
            recipient.role = 'Project Manager'
            and recipient.id in (
              nullif(btrim(coalesce(v_task ->> 'assignedBy', '')), ''),
              nullif(btrim(coalesce(v_task ->> 'createdBy', '')), '')
            )
          )
        )
    ) then
    raise check_violation using message = 'Staff user notifications may target the assignee, the owning Project Manager, or a super admin.';
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
    when v_title = 'Task Created by Staff' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.create', 'workspace.patch')
      then v_actor_name || ' created a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Task Assigned' and v_target_user is not null
      and v_command_type in ('task.create', 'workspace.patch')
      then 'You have been assigned a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Assigned To You' and v_target_user is not null
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" has been assigned to you by ' || v_actor_name || '.'
    when v_title = 'Task Status Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" was moved to '
        || left(coalesce(v_task ->> 'status', 'Updated'), 80) || ' by ' || v_actor_name || '.'
    when v_title = 'Task Deleted' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type = 'task.delete'
      then v_actor_name || ' deleted "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title in ('Task Completed', 'Task Ready for Approval') and v_target_client <> ''
      and v_command_type in ('task.update', 'workspace.patch')
      and coalesce(v_task ->> 'status', '') in ('Completed', 'Waiting Approval')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is ready for client review.'
    when v_title = 'New Comment' and v_target_user is not null
      and v_command_type in ('comment.add', 'workspace.patch')
      then 'You have a new comment on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Comment' and v_target_role = 'Project Manager'
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' commented on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Team Update' and v_target_client <> ''
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' posted an update on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Revision Requested' and v_target_user is not null
      and v_command_type in ('approval.revision', 'workspace.patch')
      then v_actor_name || ' requested a revision on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Deadline Approaching'
      and (v_target_role = 'Project Manager' or v_target_user is not null)
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
$function$;

