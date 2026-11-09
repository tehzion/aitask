-- Staff cannot withdraw reviewed work by deleting the task. Preserve existing
-- scoped manager deletion authority and generated-workflow protections.
do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_can_delete_task(text,text)'::regprocedure);
  v_anchor text := 'select private.aitask_can_edit_task(p_workspace_id, p_task_id)';
begin
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor) <> 1 then
    raise exception 'Expected exactly one task deletion access predicate';
  end if;
  execute replace(v_definition,v_anchor,v_anchor || '
      and (private.aitask_is_super_admin(p_workspace_id)
        or private.aitask_member_role(p_workspace_id) <> ''Staff''
        or private.aitask_is_hod(p_workspace_id)
        or (coalesce(task.data->>''status'','''') not in (''Waiting Approval'',''Approved'',''Completed'')
          and coalesce(task.data->>''isCompleted'',''false'') <> ''true''))');
end;
$migration$;
