-- An HOD who is the assignee of a task (doing the work themselves) could not
-- attach output files: outputAttachments is on the HOD restricted-field list,
-- which exists so an HOD cannot rewrite work routed to their Staff. Saving an
-- upload on their own task was rejected with "You do not have permission to
-- make this change." Let the assigned HOD change outputAttachments; the output
-- file guard still validates every file, and the other restricted fields are
-- unchanged.
--
-- The function is patched in place (the anchor must match exactly once) so
-- the rest of its definition, grants and settings stay byte-identical.

do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_hod_task_execution_patch_is_valid(text,jsonb,jsonb)'::regprocedure);
  v_anchor constant text := '  if not private.aitask_is_hod(p_workspace_id) then return true; end if;
';
  v_addition constant text := '  if not private.aitask_is_hod(p_workspace_id) then return true; end if;
  -- The assigned HOD does the work, so they may attach its output files.
  if p_old_data ->> ''assignedTo'' = private.aitask_member_id(p_workspace_id)
    and p_new_data ->> ''assignedTo'' = p_old_data ->> ''assignedTo'' then
    v_restricted_fields := array_remove(v_restricted_fields, ''outputAttachments'');
  end if;
';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'HOD patch anchor must occur exactly once';
  end if;
  execute replace(v_definition, v_anchor, v_addition);
end;
$migration$;
