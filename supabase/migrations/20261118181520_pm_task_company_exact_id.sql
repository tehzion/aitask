-- Company names are display labels and are not unique. When a Project Manager
-- creates or moves a task onto a company by ID, authorize that exact company
-- (not any company that shares its name) with the same rule that scopes the
-- Companies list: created by the PM, reached through a project the PM manages,
-- or already holding the PM's own standalone task.
create or replace function private.aitask_pm_can_use_client_id(
  p_workspace_id text,
  p_client_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.aitask_entities client
    where client.workspace_id = p_workspace_id
      and client.entity_type = 'client'
      and client.entity_id = p_client_id
      and (
        client.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1 from public.aitask_entities project
          where project.workspace_id = p_workspace_id and project.entity_type = 'project'
            and (project.client_id = client.entity_id
              or (project.client_id is null and project.client_key = client.client_key))
            and private.aitask_can_view_project(project.workspace_id, project.entity_id)
        )
        or exists (
          select 1 from public.aitask_entities task
          where task.workspace_id = p_workspace_id and task.entity_type = 'task'
            and (task.client_id = client.entity_id
              or (task.client_id is null and task.client_key = client.client_key))
            and nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
            and task.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
  );
$$;

revoke all on function private.aitask_pm_can_use_client_id(text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.aitask_pm_can_use_client_id(text, text) to authenticated;

do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_guard_pm_task_company()'::regprocedure);
  anchor text := $sql$  if not private.aitask_can_view_client(new.workspace_id, v_client_key) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;$sql$;
  replacement text := $sql$  if not private.aitask_can_view_client(new.workspace_id, v_client_key) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;
  if v_client_id is not null and not private.aitask_pm_can_use_client_id(new.workspace_id, v_client_id) then
    raise check_violation using message = 'This company is outside your portfolio.';
  end if;$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one PM task company visibility check';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

-- A legacy task with no company ID must not turn a matching display name into
-- edit access for every company record that shares that name.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_can_edit_client_id(text,text)'::regprocedure);
  anchor text := 'and (task.client_id = p_client_id or (task.client_id is null and task.client_key = client.client_key))';
  replacement text := 'and task.client_id = p_client_id';
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one name-based client edit fallback';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
