begin;

-- Company names are display labels and are not unique. When a task carries a
-- clientId, authorize that exact company before the new task relationship can
-- make it visible to the Project Manager.
create or replace function private.aitask_pm_can_access_exact_client(
  p_workspace_id text,
  p_client_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_created_by text;
  v_has_project boolean;
  v_assigned_project boolean;
begin
  if private.aitask_is_super_admin(p_workspace_id) then return true; end if;
  if private.aitask_member_role(p_workspace_id) is distinct from 'Project Manager' then return false; end if;

  select client.created_by into v_created_by
  from public.aitask_entities client
  where client.workspace_id = p_workspace_id
    and client.entity_type = 'client'
    and client.entity_id = p_client_id;
  if not found then return false; end if;

  select count(*) > 0, coalesce(bool_or(case
    when project.data ? 'projectManagerIds' then
      jsonb_typeof(project.data -> 'projectManagerIds') = 'array'
      and project.data -> 'projectManagerIds' ? v_member_id
    else project.created_by = v_member_id
  end), false)
  into v_has_project, v_assigned_project
  from public.aitask_entities project
  where project.workspace_id = p_workspace_id
    and project.entity_type = 'project'
    and (project.parent_id = p_client_id or project.data ->> 'clientId' = p_client_id);

  if v_has_project then return v_assigned_project; end if;
  if v_created_by = v_member_id then return true; end if;
  return exists (
    select 1 from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.client_id = p_client_id
      and private.aitask_can_view_task(p_workspace_id, task.entity_id)
  );
end;
$$;

revoke all on function private.aitask_pm_can_access_exact_client(text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.aitask_pm_can_access_exact_client(text, text) to authenticated;

drop policy if exists "PM client reads require exact company scope" on public.aitask_entities;
create policy "PM client reads require exact company scope"
  on public.aitask_entities
  as restrictive
  for select
  to authenticated
  using (
    entity_type <> 'client'
    or private.aitask_member_role(workspace_id) <> 'Project Manager'
    or private.aitask_pm_can_access_exact_client(workspace_id, entity_id)
  );

-- The client mutation guard already receives the entity ID. Do not let a
-- legacy task with no clientId turn a matching display name into edit access
-- for every company record that shares that name.
create or replace function private.aitask_can_edit_client_id(
  p_workspace_id text,
  p_client_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.aitask_is_super_admin(p_workspace_id), false)
    or exists (
      select 1
      from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.entity_id = p_client_id
        and (
          (
            private.aitask_member_role(p_workspace_id) = 'Project Manager'
            and (
              client.created_by = private.aitask_member_id(p_workspace_id)
              or exists (
                select 1
                from public.aitask_entities task
                where task.workspace_id = p_workspace_id
                  and task.entity_type = 'task'
                  and task.client_id = p_client_id
                  and (
                    task.created_by = private.aitask_member_id(p_workspace_id)
                    or task.assigned_to = private.aitask_member_id(p_workspace_id)
                  )
              )
            )
          )
          or (
            private.aitask_is_hod(p_workspace_id)
            and client.created_by = private.aitask_member_id(p_workspace_id)
          )
          or (
            private.aitask_member_role(p_workspace_id) = 'Staff'
            and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')
            and exists (
              select 1
              from public.aitask_entities task
              where task.workspace_id = p_workspace_id
                and task.entity_type = 'task'
                and task.client_id = p_client_id
                and task.assigned_to = private.aitask_member_id(p_workspace_id)
            )
          )
        )
    );
$$;

revoke all on function private.aitask_can_edit_client_id(text, text)
  from public, anon, authenticated, service_role;

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

  if v_client_id is not null then
    if not exists (
      select 1 from public.aitask_entities client
      where client.workspace_id = new.workspace_id
        and client.entity_type = 'client'
        and client.entity_id = v_client_id
        and client.client_key = v_client_key
    ) then
      raise check_violation using message = 'Choose a company from the Companies database.';
    end if;
    if not private.aitask_pm_can_access_exact_client(new.workspace_id, v_client_id) then
      raise check_violation using message = 'This company is outside your portfolio.';
    end if;
  elsif not private.aitask_can_view_client(new.workspace_id, v_client_key) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_pm_task_company() from public, anon, authenticated, service_role;

commit;
