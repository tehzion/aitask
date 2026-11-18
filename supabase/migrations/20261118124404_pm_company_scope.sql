-- Keep Project Manager company access and standalone task creation scoped by
-- canonical company ID. Name matching remains only for legacy rows without IDs.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  anchor text := $sql$        and client.client_key = v_client_key
        and client.created_by = v_member_id$sql$;
  replacement text := $sql$        and (
          (nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), '') is not null
            and client.entity_id = p_new_data ->> 'clientId')
          or (nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), '') is null
            and client.client_key = v_client_key)
        )
        and client.created_by = v_member_id$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one PM standalone company ownership branch';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_rls_visible_entities()'::regprocedure);
  anchor text := '    and private.aitask_can_view_client(client.workspace_id, client.client_key)';
  replacement text := $sql$    and private.aitask_can_view_client(client.workspace_id, client.client_key)
    and (
      private.aitask_member_role(client.workspace_id) <> 'Project Manager'
      or private.aitask_is_super_admin(client.workspace_id)
      or client.created_by = private.aitask_member_id(client.workspace_id)
      or exists (
        select 1 from public.aitask_entities project
        where project.workspace_id = client.workspace_id and project.entity_type = 'project'
          and (project.client_id = client.entity_id or (project.client_id is null and project.client_key = client.client_key))
          and private.aitask_can_view_project(project.workspace_id, project.entity_id)
      )
      or exists (
        select 1 from public.aitask_entities task
        where task.workspace_id = client.workspace_id and task.entity_type = 'task'
          and (task.client_id = client.entity_id or (task.client_id is null and task.client_key = client.client_key))
          and nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
          and task.created_by = private.aitask_member_id(client.workspace_id)
      )
    )$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one company visibility predicate';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
