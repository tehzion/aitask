-- Client notifications are allowed only for explicitly client-visible tasks.
-- This guard applies to every actor; the existing Staff guard remains the
-- stricter canonicalization layer for Staff-authored notifications.
create or replace function private.aitask_guard_notification_audience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id text := nullif(btrim(new.data -> 'route' ->> 'entityId'), '');
  v_task jsonb;
  v_target_user text := nullif(btrim(new.data ->> 'targetUserId'), '');
  v_target_role text := nullif(btrim(new.data ->> 'targetRole'), '');
  v_target_client text := lower(btrim(coalesce(new.data ->> 'targetClient', '')));
  v_task_client text;
begin
  if new.entity_type <> 'notification' or v_target_client = '' then
    return new;
  end if;

  if ((v_target_user is not null)::integer
      + (v_target_role is not null)::integer
      + (v_target_client <> '')::integer) <> 1 then
    raise check_violation using message = 'Notifications require one approved audience.';
  end if;

  if v_task_id is null or (new.data -> 'route' ->> 'page') is distinct from 'tasks' then
    raise check_violation using message = 'Client notifications must reference a task.';
  end if;

  select task.data into v_task
  from public.aitask_entities task
  where task.workspace_id = new.workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;

  if v_task is null then
    raise check_violation using message = 'Client notifications require an existing task.';
  end if;

  if coalesce(v_task ->> 'visibility', 'internal') <> 'client-visible' then
    raise check_violation using message = 'Client notifications require a client-visible task.';
  end if;

  v_task_client := lower(btrim(coalesce(v_task ->> 'clientName', '')));
  if v_task_client = '' or v_target_client <> v_task_client then
    raise check_violation using message = 'Client notification audience must match the task client.';
  end if;

  return new;
end;
$$;

revoke all on function private.aitask_guard_notification_audience() from public, anon, authenticated;

drop trigger if exists aitask_0_guard_notification_audience on public.aitask_entities;
create trigger aitask_0_guard_notification_audience
before insert on public.aitask_entities
for each row
when (new.entity_type = 'notification')
execute function private.aitask_guard_notification_audience();
