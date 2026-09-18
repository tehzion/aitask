-- Close the gap where the generic task insert predicate checked identity and
-- department but did not check the Staff/HOD Create tasks capability.
create or replace function private.aitask_guard_task_creation_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.aitask_member_id(new.workspace_id);
  actor_role text := private.aitask_member_role(new.workspace_id);
begin
  if actor_role = 'Staff'
    and not private.aitask_is_super_admin(new.workspace_id)
    and not private.aitask_has_permission(new.workspace_id, 'createTasks') then
    raise check_violation using message = 'Create tasks permission required.';
  end if;
  if actor_role = 'Staff' and coalesce(new.created_by, '') <> coalesce(actor_id, '') then
    raise check_violation using message = 'Staff task ownership is immutable.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_task_creation_permission() from public, anon, authenticated;
drop trigger if exists aitask_00_guard_task_creation_permission on public.aitask_entities;
create trigger aitask_00_guard_task_creation_permission
  before insert on public.aitask_entities
  for each row
  when (new.entity_type = 'task')
  execute function private.aitask_guard_task_creation_permission();

-- Never let a client audience be attached to an internal task, regardless of
-- whether the actor is Staff, Admin or Boss Koo.
create or replace function private.aitask_guard_client_notification_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_visibility text;
  task_id text := nullif(btrim(new.data -> 'route' ->> 'entityId'), '');
begin
  if new.entity_type = 'notification' and nullif(btrim(new.data ->> 'targetClient'), '') is not null and task_id is not null then
    select coalesce(data ->> 'visibility', 'client-visible') into task_visibility
    from public.aitask_entities
    where workspace_id = new.workspace_id and entity_type = 'task' and entity_id = task_id;
    if task_visibility = 'internal' then
      raise check_violation using message = 'Internal tasks cannot notify clients.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_client_notification_visibility() from public, anon, authenticated;
drop trigger if exists aitask_00_guard_client_notification_visibility on public.aitask_entities;
create trigger aitask_00_guard_client_notification_visibility
  before insert or update on public.aitask_entities
  for each row
  when (new.entity_type = 'notification')
  execute function private.aitask_guard_client_notification_visibility();
