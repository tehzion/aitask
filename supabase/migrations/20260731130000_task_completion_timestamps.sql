-- AiTask v1.6.13: server-controlled task completion timestamps.
-- This migration is DDL-only and deliberately does not backfill historical tasks.

create or replace function private.aitask_enforce_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_completed boolean := false;
  v_new_completed boolean := false;
begin
  if new.entity_type <> 'task' then
    return new;
  end if;

  v_new_completed := lower(coalesce(new.data ->> 'status', '')) = 'completed'
    or lower(coalesce(new.data ->> 'isCompleted', 'false')) = 'true';

  if tg_op = 'UPDATE' and old.entity_type = 'task' then
    v_old_completed := lower(coalesce(old.data ->> 'status', '')) = 'completed'
      or lower(coalesce(old.data ->> 'isCompleted', 'false')) = 'true';
  end if;

  if not v_new_completed then
    new.data := new.data - 'completedAt';
  elsif tg_op = 'INSERT' or not v_old_completed then
    new.data := jsonb_set(new.data, '{completedAt}', to_jsonb(clock_timestamp()), true);
  elsif old.data ? 'completedAt' then
    new.data := jsonb_set(new.data, '{completedAt}', old.data -> 'completedAt', true);
  else
    -- Historical completed tasks remain undated until they are reopened and completed again.
    new.data := new.data - 'completedAt';
  end if;

  return new;
end;
$$;

revoke all on function private.aitask_enforce_task_completed_at()
  from public, anon, authenticated;

drop trigger if exists aitask_enforce_task_completed_at on public.aitask_entities;
create trigger aitask_enforce_task_completed_at
  before insert or update of data on public.aitask_entities
  for each row execute function private.aitask_enforce_task_completed_at();
