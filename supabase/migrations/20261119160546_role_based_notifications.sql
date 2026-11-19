-- Role-based notifications the hosted workspace was missing.
--
-- 1. Hosted workspaces already tell Boss Koo and the assignee when a client
--    approves or asks for changes, but never the Project Manager or the
--    responsible HOD who run the work. They are now told as well. A low rating
--    (one or two stars) is announced to everyone accountable, Boss Koo included,
--    as an action item.
-- 2. Work that is overdue is announced once, to the assignee, the responsible
--    HOD and the Project Managers who own it. Reminders only covered work due
--    today or tomorrow.
-- 3. The responsible HOD also gets the existing due-today / due-tomorrow reminder,
--    not only when they are the assignee.

-- Reminder rows now carry a type, so an overdue notice is claimed separately.
do $constraint$
declare v_name text;
begin
  for v_name in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.aitask_task_deadline_reminders'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%reminder_type%'
  loop
    execute format('alter table public.aitask_task_deadline_reminders drop constraint %I', v_name);
  end loop;
  alter table public.aitask_task_deadline_reminders
    add constraint aitask_task_deadline_reminders_reminder_type_check
    check (reminder_type in ('deadline_window', 'overdue'));
end;
$constraint$;

-- Who is accountable for a task: Boss Koo, the assignee, the responsible HOD and
-- the Project Managers whose scope covers it (the same scope the reminders use).
create or replace function private.aitask_task_notification_recipients(p_workspace_id text, p_task jsonb)
returns table(member_id text, is_boss boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select member.id, coalesce(member.is_super_admin, false)
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.role <> 'Client'
    and (
      member.is_super_admin
      or member.id = nullif(btrim(p_task ->> 'assignedTo'), '')
      or member.id = nullif(btrim(p_task ->> 'responsibleHodId'), '')
      or (
        member.role = 'Project Manager'
        and (
          nullif(btrim(p_task ->> 'projectId'), '') is null
          or not exists (
            select 1 from public.aitask_entities project
            where project.workspace_id = p_workspace_id and project.entity_type = 'project'
              and project.entity_id = nullif(btrim(p_task ->> 'projectId'), '')
          )
          or private.aitask_project_manager_id_is_assigned(p_workspace_id, nullif(btrim(p_task ->> 'projectId'), ''), member.id)
        )
        and member.id in (
          nullif(btrim(p_task ->> 'assignedBy'), ''),
          nullif(btrim(p_task ->> 'createdBy'), ''),
          (select client.created_by from public.aitask_entities client
           where client.workspace_id = p_workspace_id and client.entity_type = 'client'
             and client.client_key = lower(coalesce(nullif(btrim(p_task ->> 'clientName'), ''), 'the client'))
           limit 1),
          (select project.created_by from public.aitask_entities project
           where project.workspace_id = p_workspace_id and project.entity_type = 'project'
             and project.entity_id = nullif(btrim(p_task ->> 'projectId'), '')
           limit 1)
        )
      )
    );
$$;
revoke all on function private.aitask_task_notification_recipients(text, jsonb) from public, anon, authenticated, service_role;

-- 3. The responsible HOD is also reminded of work due today or tomorrow.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_generate_due_task_reminders(text,timestamptz)'::regprocedure);
  anchor text := $sql$or member.id = v_assignee$sql$;
  replacement text := $sql$or member.id = v_assignee
          or member.id = nullif(btrim(v_task.data ->> 'responsibleHodId'), '')$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one assignee clause in the reminder recipient query';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

-- 1. A client's decision reaches the team.
create or replace function private.aitask_notify_client_decision(p_workspace_id text, p_task_id text, p_task jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := p_task ->> 'clientApprovalStatus';
  v_stars integer := case when (p_task -> 'clientRating' ->> 'stars') ~ '^[1-5]$' then (p_task -> 'clientRating' ->> 'stars')::integer end;
  v_low boolean;
  v_title text;
  v_message text;
  v_category text;
  v_importance text;
  v_task_title text := left(coalesce(p_task ->> 'title', 'Task'), 160);
  v_client text := left(coalesce(nullif(btrim(p_task ->> 'clientName'), ''), 'The client'), 120);
  v_stamp text := to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSMS');
  v_previous text := current_setting('aitask.server_notification', true);
  v_recipient record;
  v_id text;
  v_count integer := 0;
begin
  if v_status not in ('Approved', 'Rejected') then return 0; end if;
  v_low := v_status = 'Approved' and v_stars is not null and v_stars <= 2;
  if v_status = 'Approved' then
    v_title := case when v_low then 'Low Client Rating' else 'Client Approved Task' end;
    v_message := '"' || v_task_title || '" was approved by ' || v_client
      || case when v_stars is not null then ' and rated ' || v_stars || '/5' else '' end || '.';
    v_category := case when v_low then 'feedback' else 'review' end;
    v_importance := case when v_low then 'action' else 'informational' end;
  else
    v_title := 'Client Requested Revision';
    v_message := v_client || ' asked for changes on "' || v_task_title || '".';
    v_category := 'review';
    v_importance := 'action';
  end if;

  perform set_config('aitask.server_notification', 'true', true);
  for v_recipient in
    select recipient.member_id from private.aitask_task_notification_recipients(p_workspace_id, p_task) recipient
    -- Boss Koo and the assignee already get the standard approve / revise notice
    -- from the command itself, so only a low rating goes to everyone.
    where v_low or (not recipient.is_boss and recipient.member_id is distinct from nullif(btrim(p_task ->> 'assignedTo'), ''))
  loop
    v_id := 'N-clientdecision-' || p_task_id || '-' || v_stamp || '-' || v_recipient.member_id;
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
    values (p_workspace_id, 'notification', v_id, p_task_id, jsonb_build_object(
      'id', v_id,
      'targetUserId', v_recipient.member_id,
      'title', v_title,
      'message', v_message,
      'route', jsonb_build_object('page', 'tasks', 'entityId', p_task_id),
      'iconType', case when v_status = 'Approved' and not v_low then 'success' else 'alert' end,
      'category', v_category,
      'importance', v_importance,
      'isRead', false,
      'readByUserIds', '[]'::jsonb,
      'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    on conflict (workspace_id, entity_type, entity_id) do nothing;
    v_count := v_count + 1;
  end loop;
  perform set_config('aitask.server_notification', coalesce(v_previous, 'false'), true);
  return v_count;
end;
$$;
revoke all on function private.aitask_notify_client_decision(text, text, jsonb) from public, anon, authenticated, service_role;

create or replace function private.aitask_merge_client_approval_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rating jsonb := new.data -> 'clientRating';
begin
  if new.entity_type = 'task'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true'
    and private.aitask_member_role(old.workspace_id) = 'Client' then
    new.data := old.data || jsonb_build_object(
      'clientApprovalStatus', new.data -> 'clientApprovalStatus',
      'status', case when new.data->>'clientApprovalStatus' = 'Approved' then to_jsonb('Approved'::text) else to_jsonb('In Progress'::text) end,
      'isCompleted', false,
      'completionPercentage', case when new.data->>'clientApprovalStatus' = 'Approved' then 80 else 50 end,
      'completedAt', 'null'::jsonb,
      'revisionCount', to_jsonb(case when new.data ->> 'clientApprovalStatus' = 'Rejected' then coalesce((old.data ->> 'revisionCount')::integer, 0) + 1 else coalesce((old.data ->> 'revisionCount')::integer, 0) end)
    );
    -- The rating comes from the client; who rated and when come from the server.
    if new.data ->> 'clientApprovalStatus' = 'Approved' and jsonb_typeof(v_rating) = 'object' then
      new.data := new.data || jsonb_build_object('clientRating', jsonb_strip_nulls(jsonb_build_object(
        'stars', (v_rating ->> 'stars')::integer,
        'comment', nullif(left(btrim(coalesce(v_rating ->> 'comment', '')), 500), ''),
        'ratedBy', private.aitask_member_id(old.workspace_id),
        'ratedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )));
    end if;
    -- Tell the team what the client decided.
    perform private.aitask_notify_client_decision(old.workspace_id, new.entity_id, new.data);
  end if;
  return new;
end;
$$;

-- 2. Overdue work is announced once.
create or replace function private.aitask_generate_overdue_task_notices(p_workspace_id text, p_now timestamptz default now())
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
  v_title text;
  v_client text;
  v_notification_id text;
  v_created_at text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select coalesce(nullif(btrim(workspace.reminder_timezone), ''), 'Asia/Kuala_Lumpur')
    into v_timezone from public.aitask_workspaces workspace where workspace.id = p_workspace_id;
  if v_timezone is null then return 0; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'Asia/Kuala_Lumpur';
  end if;
  v_today := (p_now at time zone v_timezone)::date;

  perform set_config('aitask.server_notification', 'true', true);
  perform set_config('aitask.command_type', 'reminder.generate', true);

  for v_task in
    select task.entity_id as task_id, task.data
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
    -- Announce once, and only while it is recent enough to still be news.
    if v_due_date >= v_today or v_due_date < v_today - 14 then continue; end if;

    v_title := left(coalesce(v_task.data ->> 'title', 'Task'), 160);
    v_client := left(coalesce(nullif(btrim(v_task.data ->> 'clientName'), ''), 'the client'), 160);
    v_claimed := 0;
    -- Boss Koo sees overdue work on the dashboard, so is not messaged for each task.
    for v_recipient in
      select recipient.member_id from private.aitask_task_notification_recipients(p_workspace_id, v_task.data) recipient
      where not recipient.is_boss
    loop
      if v_claimed = 0 then
        insert into public.aitask_task_deadline_reminders(workspace_id, task_id, due_date, reminder_type)
        values (p_workspace_id, v_task.task_id, v_due_date, 'overdue')
        on conflict (workspace_id, task_id, due_date, reminder_type) do nothing;
        get diagnostics v_claimed = row_count;
        if v_claimed = 0 then exit; end if;
      end if;
      v_notification_id := 'N-overdue-' || v_task.task_id || '-' || to_char(v_due_date, 'YYYYMMDD') || '-' || v_recipient.member_id;
      insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
      values (p_workspace_id, 'notification', v_notification_id, v_task.task_id, jsonb_build_object(
        'id', v_notification_id,
        'targetUserId', v_recipient.member_id,
        'title', 'Task Overdue',
        'message', case when v_recipient.member_id = nullif(btrim(v_task.data ->> 'assignedTo'), '')
          then '"' || v_title || '" is overdue (was due ' || to_char(v_due_date, 'DD Mon YYYY') || ').'
          else '"' || v_title || '" for ' || v_client || ' is overdue (was due ' || to_char(v_due_date, 'DD Mon YYYY') || ').'
        end,
        'route', jsonb_build_object('page', 'tasks', 'entityId', v_task.task_id),
        'iconType', 'alert',
        'category', 'deadline',
        'importance', 'action',
        'isRead', false,
        'readByUserIds', '[]'::jsonb,
        'createdAt', v_created_at))
      on conflict (workspace_id, entity_type, entity_id) do nothing;
      v_generated := v_generated + 1;
    end loop;
  end loop;
  return v_generated;
end;
$$;
revoke all on function private.aitask_generate_overdue_task_notices(text, timestamptz) from public, anon, authenticated;
grant execute on function private.aitask_generate_overdue_task_notices(text, timestamptz) to service_role;

create or replace function private.aitask_generate_all_overdue_task_notices(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace record;
  v_total integer := 0;
begin
  for v_workspace in select id from public.aitask_workspaces loop
    v_total := v_total + private.aitask_generate_overdue_task_notices(v_workspace.id, p_now);
  end loop;
  return v_total;
end;
$$;
revoke all on function private.aitask_generate_all_overdue_task_notices(timestamptz) from public, anon, authenticated;
grant execute on function private.aitask_generate_all_overdue_task_notices(timestamptz) to service_role;

-- Once a day, early in the working morning (01:30 UTC is 09:30 in Kuala Lumpur).
select cron.schedule(
  'aitask-task-overdue-notices',
  '30 1 * * *',
  $$select private.aitask_generate_all_overdue_task_notices();$$
)
where not exists (select 1 from cron.job where jobname = 'aitask-task-overdue-notices');
