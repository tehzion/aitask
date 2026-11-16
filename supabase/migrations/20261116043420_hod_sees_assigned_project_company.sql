-- A Department Head can work on a project whose company profile they could not
-- see (the profile was only visible through tasks they can already view), so
-- the app showed a placeholder company and the save diff tried to create it.
-- Let a HOD see the company of every project they can view. Non-HOD Staff keep
-- the existing rule (tasks they can view, or companies they created).
do $migration$
declare
  definition text;
  anchor text := E'      )\n    else false\n  end;';
  replacement text := E'      )\n      or (\n        private.aitask_is_hod(p_workspace_id)\n        and exists (\n          select 1\n          from public.aitask_entities project\n          where project.workspace_id = p_workspace_id\n            and project.entity_type = ''project''\n            and project.client_key = p_client_key\n            and private.aitask_can_view_project(p_workspace_id, project.entity_id)\n        )\n      )\n    else false\n  end;';
begin
  definition := pg_get_functiondef('private.aitask_can_view_client(text,text)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one Staff branch terminator in aitask_can_view_client';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
