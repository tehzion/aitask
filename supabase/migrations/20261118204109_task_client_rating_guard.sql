-- Two fields belong to the people who manage the client, not the people doing
-- the work:
--   * clientRating: the client's satisfaction. Only a Project Manager (recording
--     it for the client) or the client themselves may set or change it; Staff and
--     HOD may not rate their own delivery.
--   * brief: what the client asked for. Only a Project Manager may write it.
create or replace function private.aitask_guard_task_client_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data -> 'clientRating' else null end;
  v_new jsonb := new.data -> 'clientRating';
  v_stars numeric;
  v_brief_changed boolean := (new.data -> 'brief') is distinct from (case when tg_op = 'UPDATE' then old.data -> 'brief' else null end);
begin
  if v_brief_changed
    and (select auth.uid()) is not null
    and not private.aitask_is_super_admin(new.workspace_id)
    and private.aitask_member_role(new.workspace_id) is distinct from 'Project Manager' then
    raise check_violation using message = 'Only a Project Manager can write the client brief.';
  end if;

  if v_new is not distinct from v_old then
    return new;
  end if;

  -- Service-role maintenance and the Boss account are not restricted here.
  if (select auth.uid()) is null or private.aitask_is_super_admin(new.workspace_id) then
    null;
  elsif private.aitask_member_role(new.workspace_id) not in ('Project Manager', 'Client') then
    raise check_violation using message = 'Only a Project Manager or the client can rate a delivery.';
  end if;

  if v_new is not null and jsonb_typeof(v_new) <> 'null' then
    if jsonb_typeof(v_new) <> 'object' or jsonb_typeof(v_new -> 'stars') <> 'number' then
      raise check_violation using message = 'A rating needs a number of stars from 1 to 5.';
    end if;
    v_stars := (v_new ->> 'stars')::numeric;
    if v_stars < 1 or v_stars > 5 or v_stars <> trunc(v_stars) then
      raise check_violation using message = 'A rating needs a number of stars from 1 to 5.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_task_client_rating() from public, anon, authenticated, service_role;

drop trigger if exists aitask_02_guard_task_client_rating on public.aitask_entities;
create trigger aitask_02_guard_task_client_rating
  before insert or update of data on public.aitask_entities
  for each row when (new.entity_type = 'task')
  execute function private.aitask_guard_task_client_rating();
