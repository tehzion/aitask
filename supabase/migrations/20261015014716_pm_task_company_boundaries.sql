-- A task relationship grants PM access to its company. Validate the destination
-- BEFORE saving the relationship, including commands that run as their owner.
-- Otherwise moving an owned standalone task can unlock an unrelated portfolio.
create or replace function private.aitask_guard_pm_task_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_key text := lower(btrim(coalesce(new.data ->> 'clientName', '')));
  v_client_id text := nullif(btrim(new.data ->> 'clientId'), '');
begin
  if (select auth.uid()) is null
    or private.aitask_is_super_admin(new.workspace_id)
    or private.aitask_member_role(new.workspace_id) is distinct from 'Project Manager' then
    return new;
  end if;

  if tg_op = 'INSERT' and not private.aitask_has_permission(new.workspace_id, 'createTasks') then
    raise check_violation using message = 'Create tasks permission required.';
  end if;

  -- Preserve routine editing of legacy records with missing historical IDs.
  if tg_op = 'UPDATE'
    and v_client_key = lower(btrim(coalesce(old.data ->> 'clientName', '')))
    and v_client_id is not distinct from nullif(btrim(old.data ->> 'clientId'), '') then
    return new;
  end if;

  if not private.aitask_can_view_client(new.workspace_id, v_client_key) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;
  if v_client_id is not null and not exists (
    select 1 from public.aitask_entities client
    where client.workspace_id = new.workspace_id
      and client.entity_type = 'client'
      and client.entity_id = v_client_id
      and client.client_key = v_client_key
  ) then
    raise check_violation using message = 'Choose a company from the Companies database.';
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_pm_task_company() from public, anon, authenticated, service_role;
create trigger aitask_00_guard_pm_task_company
  before insert or update on public.aitask_entities
  for each row when (new.entity_type = 'task')
  execute function private.aitask_guard_pm_task_company();
