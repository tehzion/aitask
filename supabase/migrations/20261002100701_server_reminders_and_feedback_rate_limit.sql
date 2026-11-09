-- Server-owned deadline reminders and durable public-feedback throttling.
--
-- Browser reminder generation remains available for local/demo mode, but the
-- secure backend uses these database-owned jobs so reminders do not depend on
-- a tab being open or visible.

alter table public.aitask_workspaces
  add column if not exists reminder_timezone text not null default 'Asia/Kuala_Lumpur';

create table if not exists public.aitask_task_deadline_reminders (
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  task_id text not null,
  due_date date not null,
  reminder_type text not null default 'deadline_window'
    check (reminder_type = 'deadline_window'),
  generated_at timestamptz not null default now(),
  primary key (workspace_id, task_id, due_date, reminder_type)
);

create index if not exists aitask_task_deadline_reminders_generated_idx
  on public.aitask_task_deadline_reminders(generated_at desc);

alter table public.aitask_task_deadline_reminders enable row level security;
revoke all on table public.aitask_task_deadline_reminders from public, anon, authenticated;
grant select, insert, update, delete on table public.aitask_task_deadline_reminders to service_role;

create table if not exists public.aitask_feedback_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

create index if not exists aitask_feedback_rate_limits_updated_idx
  on public.aitask_feedback_rate_limits(updated_at);

alter table public.aitask_feedback_rate_limits enable row level security;
revoke all on table public.aitask_feedback_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.aitask_feedback_rate_limits to service_role;

create or replace function public.aitask_consume_feedback_rate_limit(
  p_key_hash text,
  p_limit integer default 8,
  p_window_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_attempt_count integer;
  v_retry_after integer;
  v_remaining integer;
begin
  if coalesce(p_key_hash, '') !~ '^[0-9a-f]{64}$'
    or p_limit < 1
    or p_limit > 100
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    return jsonb_build_object(
      'ok', false,
      'code', 'VALIDATION',
      'error', 'Invalid feedback rate-limit parameters.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('feedback-rate:' || p_key_hash, 0));

  select window_started_at, attempt_count
    into v_window_start, v_attempt_count
  from public.aitask_feedback_rate_limits
  where key_hash = p_key_hash
  for update;

  if v_window_start is null
    or v_now >= v_window_start + make_interval(secs => p_window_seconds) then
    insert into public.aitask_feedback_rate_limits(key_hash, window_started_at, attempt_count, updated_at)
    values (p_key_hash, v_now, 1, v_now)
    on conflict (key_hash) do update
      set window_started_at = excluded.window_started_at,
          attempt_count = excluded.attempt_count,
          updated_at = excluded.updated_at;
    if random() < 0.02 then
      delete from public.aitask_feedback_rate_limits
      where updated_at < v_now - interval '1 day';
    end if;
    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'remaining', greatest(p_limit - 1, 0),
      'retryAfterSeconds', 0
    );
  end if;

  if v_attempt_count >= p_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from (
      v_window_start + make_interval(secs => p_window_seconds) - v_now
    )))::integer);
    return jsonb_build_object(
      'ok', true,
      'allowed', false,
      'remaining', 0,
      'retryAfterSeconds', v_retry_after
    );
  end if;

  update public.aitask_feedback_rate_limits
  set attempt_count = attempt_count + 1,
      updated_at = v_now
  where key_hash = p_key_hash;

  v_remaining := greatest(p_limit - v_attempt_count - 1, 0);
  return jsonb_build_object(
    'ok', true,
    'allowed', true,
    'remaining', v_remaining,
    'retryAfterSeconds', 0
  );
end;
$$;

revoke all on function public.aitask_consume_feedback_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.aitask_consume_feedback_rate_limit(text, integer, integer) to service_role;

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

create or replace function private.aitask_generate_all_due_task_reminders(
  p_now timestamptz default now()
)
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
    v_total := v_total + private.aitask_generate_due_task_reminders(v_workspace.id, p_now);
  end loop;
  return v_total;
end;
$$;

revoke all on function private.aitask_generate_all_due_task_reminders(timestamptz) from public, anon, authenticated;
grant execute on function private.aitask_generate_all_due_task_reminders(timestamptz) to service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'aitask-task-deadline-reminders',
  '*/15 * * * *',
  $$select private.aitask_generate_all_due_task_reminders();$$
)
where not exists (
  select 1 from cron.job where jobname = 'aitask-task-deadline-reminders'
);

select cron.schedule(
  'aitask-task-deadline-reminder-cleanup',
  '17 3 * * *',
  $$delete from public.aitask_task_deadline_reminders where generated_at < now() - interval '180 days';$$
)
where not exists (
  select 1 from cron.job where jobname = 'aitask-task-deadline-reminder-cleanup'
);

select cron.schedule(
  'aitask-feedback-rate-limit-cleanup',
  '23 3 * * *',
  $$delete from public.aitask_feedback_rate_limits where updated_at < now() - interval '1 day';$$
)
where not exists (
  select 1 from cron.job where jobname = 'aitask-feedback-rate-limit-cleanup'
);
