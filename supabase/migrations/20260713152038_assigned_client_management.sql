-- Separate client visibility from assigned-client profile management.

create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select member.is_super_admin
      or member.role = 'Admin'
      or coalesce((
        case
          when member.permissions <> '{}'::jsonb
            then member.permissions ->> p_permission
          else custom_role.data -> 'permissions' ->> p_permission
        end
      ) = 'true', false)
    from public.aitask_members member
    left join lateral (
      select entity.data
      from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_edit_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_is_admin(p_workspace_id) or (
    private.aitask_member_role(p_workspace_id) = 'Staff'
    and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')
    and exists (
      select 1
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_key = p_client_key
        and task.assigned_to = private.aitask_member_id(p_workspace_id)
    )
  );
$$;

create or replace function private.aitask_guard_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  forbidden_key text;
begin
  select key into forbidden_key
  from jsonb_object_keys(new.data) key
  where key ~* '(password|secret|token|api[_-]?key|service[_-]?role)'
  limit 1;
  if forbidden_key is not null then
    raise exception 'AiTask entities cannot contain secret-like fields';
  end if;

  if tg_op = 'UPDATE'
    and old.entity_type = 'client'
    and lower(trim(coalesce(old.data ->> 'clientName', '')))
      is distinct from lower(trim(coalesce(new.data ->> 'clientName', '')))
    and not private.aitask_is_admin(old.workspace_id) then
    raise exception 'Only admins can rename clients';
  end if;

  new.client_key := lower(trim(coalesce(new.data ->> 'clientName', new.data ->> 'targetClient', '')));
  new.assigned_to := nullif(trim(new.data ->> 'assignedTo'), '');
  new.created_by := nullif(trim(coalesce(new.data ->> 'createdBy', new.data ->> 'userId')), '');
  new.target_user_id := nullif(trim(new.data ->> 'targetUserId'), '');
  new.target_role := nullif(trim(new.data ->> 'targetRole'), '');
  new.target_client_key := lower(trim(coalesce(new.data ->> 'targetClient', '')));
  new.parent_id := case
    when new.entity_type = 'task' then nullif(trim(new.data ->> 'projectId'), '')
    when new.entity_type in ('comment', 'approval') then nullif(trim(new.data ->> 'taskId'), '')
    else new.parent_id
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop policy if exists "members can insert authorized entities" on public.aitask_entities;
create policy "members can insert authorized entities" on public.aitask_entities
  for insert to authenticated
  with check (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task'
      and private.aitask_member_role(workspace_id) = 'Staff'
      and created_by = private.aitask_member_id(workspace_id))
    or (entity_type = 'client'
      and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'comment'
      and created_by = private.aitask_member_id(workspace_id)
      and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'approval'
      and created_by = private.aitask_member_id(workspace_id)
      and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'notification'
      and private.aitask_member_role(workspace_id) in ('Admin', 'Staff'))
  );

revoke all on function private.aitask_has_permission(text, text) from public;
revoke all on function private.aitask_can_edit_client(text, text) from public;
revoke all on function private.aitask_guard_entity() from public;
grant execute on function private.aitask_has_permission(text, text) to authenticated;
grant execute on function private.aitask_can_edit_client(text, text) to authenticated;
