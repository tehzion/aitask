-- Project Manager scope parity.
--
-- 1. Projectless task visibility and editing resolve a company by canonical id
--    first, then fall back to the normalized name for legacy rows.
-- 2. A Project Manager may delete a task only through creator, assigned-project,
--    or owned-company authority; a transient assignment alone is not enough.
-- 3. The assignment validator keeps the frontend's unassigned + assignedBy
--    fallback and also resolves company ownership by id first.
begin;

-- 1. Id-first projectless client ownership ---------------------------------
do $migration$
declare
  definition text;
  anchor text := 'and client.client_key = task.client_key';
  replacement text := 'and ((task.client_id is not null and client.entity_id = task.client_id) or (task.client_id is null and client.client_key = task.client_key))';
begin
  definition := pg_get_functiondef('private.aitask_can_view_task(text,text)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one projectless client branch in aitask_can_view_task';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

do $migration$
declare
  definition text;
  anchor text := 'and client.client_key = task.client_key';
  replacement text := 'and ((task.client_id is not null and client.entity_id = task.client_id) or (task.client_id is null and client.client_key = task.client_key))';
begin
  definition := pg_get_functiondef('private.aitask_can_edit_task(text,text)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one projectless client branch in aitask_can_edit_task';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

-- 2. Destructive Project Manager authority ---------------------------------
do $migration$
begin
  if to_regprocedure('private.aitask_can_delete_task_legacy_role(text,text)') is null then
    alter function private.aitask_can_delete_task(text,text) rename to aitask_can_delete_task_legacy_role;
  end if;
end;
$migration$;

create or replace function private.aitask_can_delete_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_can_delete_task_legacy_role(p_workspace_id, p_task_id)
    and (
      private.aitask_is_super_admin(p_workspace_id)
      or private.aitask_member_role(p_workspace_id) <> 'Project Manager'
      or exists (
        select 1
        from public.aitask_entities task
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and task.entity_id = p_task_id
          and (
            task.created_by = private.aitask_member_id(p_workspace_id)
            or (
              nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is not null
              and private.aitask_project_manager_id_is_assigned(
                p_workspace_id,
                coalesce(task.data ->> 'projectId', task.parent_id),
                private.aitask_member_id(p_workspace_id)
              )
            )
            or (
              nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
              and exists (
                select 1
                from public.aitask_entities client
                where client.workspace_id = p_workspace_id
                  and client.entity_type = 'client'
                  and (
                    (task.client_id is not null and client.entity_id = task.client_id)
                    or (task.client_id is null and client.client_key = task.client_key)
                  )
                  and client.created_by = private.aitask_member_id(p_workspace_id)
              )
            )
          )
      )
    );
$$;
revoke all on function private.aitask_can_delete_task(text,text) from public, anon, authenticated, service_role;
revoke all on function private.aitask_can_delete_task_legacy_role(text,text) from public, anon, authenticated, service_role;

-- 3. Assignment route parity ------------------------------------------------
do $migration$
declare
  definition text;
  anchor text := $anchor$        or v_old_creator = v_actor_member_id
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')))
            and client.created_by = v_actor_member_id
        )$anchor$;
  replacement text := $replacement$        or v_old_creator = v_actor_member_id
        or (
          nullif(btrim(v_old_assignee), '') is null
          and coalesce(p_old_data ->> 'assignedBy', '') = v_actor_member_id
        )
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and (
              (
                nullif(btrim(coalesce(p_old_data ->> 'clientId', p_new_data ->> 'clientId', '')), '') is not null
                and client.entity_id = coalesce(p_old_data ->> 'clientId', p_new_data ->> 'clientId')
              )
              or (
                nullif(btrim(coalesce(p_old_data ->> 'clientId', p_new_data ->> 'clientId', '')), '') is null
                and client.client_key = lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')))
              )
            )
            and client.created_by = v_actor_member_id
        )$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one Project Manager assignment authority branch';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

commit;
