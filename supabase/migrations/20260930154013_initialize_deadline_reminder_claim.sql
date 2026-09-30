-- Fix first-task ledger omission and repeated-run idempotency.
create or replace function private.aitask_generate_due_task_reminders(
  p_workspace_id text,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_today date;
  v_due_date date;
  v_generated integer := 0;
  v_claimed integer;
  v_task record;
  v_recipient record;
  v_assignee text;
  v_title text;
  v_client_name text;
  v_when text;
  v_notification_id text;
  v_created_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select coalesce(nullif(btrim(workspace.reminder_timezone), ''), 'Asia/Kuala_Lumpur')
    into v_timezone
  from public.aitask_workspaces workspace
  where workspace.id = p_workspace_id;

  if v_timezone is null then return 0; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'Asia/Kuala_Lumpur';
  end if;
  v_today := (p_now at time zone v_timezone)::date;

  -- This bypass is restricted to this database-owned job. It allows the
  -- existing Staff notification trigger to distinguish trusted server output
  -- from browser-supplied notification drafts.
  perform set_config('aitask.server_notification', 'true', true);
  perform set_config('aitask.command_type', 'reminder.generate', true);

  for v_task in
    select
      task.entity_id as task_id,
      task.data,
      nullif(btrim(task.data ->> 'assignedTo'), '') as assigned_to,
      nullif(btrim(task.data ->> 'assignedBy'), '') as assigned_by,
      nullif(btrim(task.data ->> 'createdBy'), '') as created_by,
      nullif(btrim(task.data ->> 'projectId'), '') as project_id,
      nullif(btrim(task.data ->> 'clientName'), '') as client_name
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and coalesce(task.data ->> 'isCompleted', 'false') <> 'true'
      and coalesce(task.data ->> 'status', '') not in ('Completed', 'Cancelled')
      and coalesce(task.data ->> 'dueDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
  loop
    begin
      v_due_date := (v_task.data ->> 'dueDate')::date;
    exception when others then
      continue;
    end;

    if v_due_date not between v_today and v_today + 1 then continue; end if;

    v_assignee := v_task.assigned_to;
    v_title := left(coalesce(v_task.data ->> 'title', 'Task'), 160);
    -- Keep the full canonical client name for ownership matching; truncate only
    -- the user-facing notification message below.
    v_client_name := coalesce(v_task.client_name, 'the client');
    v_when := case when v_due_date = v_today then 'today' else 'tomorrow' end;

    -- Each task starts unclaimed, including the first task of every call.
    v_claimed := 0;
    for v_recipient in
      select distinct member.id
      from public.aitask_members member
      where member.workspace_id = p_workspace_id
        and member.role <> 'Client'
        and (
          member.is_super_admin
          or member.id = v_assignee
          or (
            member.role = 'Project Manager'
            and member.id in (
              v_task.assigned_by,
              v_task.created_by,
              (select client.created_by
               from public.aitask_entities client
               where client.workspace_id = p_workspace_id
                 and client.entity_type = 'client'
                 and client.client_key = lower(v_client_name)
               limit 1),
              (select project.created_by
               from public.aitask_entities project
               where project.workspace_id = p_workspace_id
                 and project.entity_type = 'project'
                 and project.entity_id = v_task.project_id
               limit 1)
            )
          )
        )
    loop
      -- Claim only after an eligible recipient exists. Claiming before this
      -- loop would permanently suppress the reminder when a task had no
      -- eligible internal recipient at the time the cron job ran.
      if v_claimed = 0 then
        insert into public.aitask_task_deadline_reminders(workspace_id, task_id, due_date)
        values (p_workspace_id, v_task.task_id, v_due_date)
        on conflict (workspace_id, task_id, due_date, reminder_type) do nothing;
        get diagnostics v_claimed = row_count;
        if v_claimed = 0 then exit; end if;
      end if;

      v_notification_id := 'N-reminder-' || v_task.task_id || '-' || to_char(v_due_date, 'YYYYMMDD') || '-' || v_recipient.id;
      insert into public.aitask_entities(
        workspace_id,
        entity_type,
        entity_id,
        parent_id,
        data
      ) values (
        p_workspace_id,
        'notification',
        v_notification_id,
        v_task.task_id,
        jsonb_build_object(
          'id', v_notification_id,
          'targetUserId', v_recipient.id,
          'title', 'Task Deadline Approaching',
          'message', case when v_recipient.id = v_assignee
            then '"' || v_title || '" is due ' || v_when || '.'
            else '"' || v_title || '" for ' || left(v_client_name, 160) || ' is due ' || v_when || '.'
          end,
          'route', jsonb_build_object('page', 'tasks', 'entityId', v_task.task_id),
          'iconType', 'alert',
          'category', 'deadline',
          'importance', 'action',
          'isRead', false,
          'readByUserIds', '[]'::jsonb,
          'createdAt', v_created_at
        )
      )
      on conflict (workspace_id, entity_type, entity_id) do nothing;
      v_generated := v_generated + 1;
    end loop;
    v_claimed := 0;
  end loop;

  return v_generated;
end;
$$;

revoke all on function private.aitask_generate_due_task_reminders(text, timestamptz) from public, anon, authenticated;
grant execute on function private.aitask_generate_due_task_reminders(text, timestamptz) to service_role;

