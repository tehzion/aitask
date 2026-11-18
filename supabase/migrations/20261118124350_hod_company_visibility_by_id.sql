-- Scope HOD company rows by their canonical ID when related records have one.
-- Name matching remains available for legacy records without company IDs.
do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_rls_visible_entities()'::regprocedure);
  anchor text := '    and private.aitask_can_view_client(client.workspace_id, client.client_key);';
  replacement text := $sql$    and private.aitask_can_view_client(client.workspace_id, client.client_key)
    and (
      not private.aitask_is_hod(client.workspace_id)
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
          and private.aitask_can_view_task(task.workspace_id, task.entity_id)
      )
    );$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one client visibility predicate';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
