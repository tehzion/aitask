-- Older tasks carry no responsibleHodId (they predate HOD routing). The
-- assignment check let an HOD reassign only work assigned to them or naming
-- them as responsible HOD, so the department HOD could not hand these tasks
-- to Staff: the app offered the action and the server answered "You do not
-- have permission to make this change." Found by replaying each HOD and PM
-- action as the real people on production data (6 open tasks affected).
--
-- Treat the department HOD who is on the task's project as the lead of a
-- task with no recorded HOD, as the later HOD handoff rule in the same
-- function already does. Tasks outside the HOD's departments stay refused.
--
-- Patched in place (the anchor must match exactly once).

do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  v_anchor constant text := '      and (v_old_assignee = v_actor_member_id or v_old_hod = v_actor_member_id)
    )';
  v_replacement constant text := '      and (v_old_assignee = v_actor_member_id or v_old_hod = v_actor_member_id
        -- Older tasks record no responsible HOD; the department HOD on the
        -- task''s project leads them.
        or (v_old_hod = ''''
          and v_old_department = any(coalesce((
            select member.departments from public.aitask_members member
            where member.workspace_id = p_workspace_id and member.id = v_actor_member_id
          ), array[]::text[]))
          and (v_project_id is null or private.aitask_hod_is_assigned(p_workspace_id, v_project_id))))
    )';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'Assignment boundary anchor must occur exactly once';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;
