-- Enforce explicit project membership for every task assignee, including the
-- legacy-compatible direct Staff route used when no HOD is eligible.
do $$
declare
  definition text;
  updated text;
  old_membership_fields text := $old$select coalesce(project.data ? 'hodMemberIds', false), coalesce(project.data ? 'staffMemberIds', false)
      into v_project_hod_membership_defined, v_project_staff_membership_defined$old$;
  new_membership_fields text := $new$select coalesce(project.data ? 'hodMemberIds', false), coalesce(project.data ? 'staffMemberIds', false), coalesce(project.data ? 'projectManagerIds', false)
      into v_project_hod_membership_defined, v_project_staff_membership_defined, v_project_manager_membership_defined$new$;
  old_staff_scope text := $old$      and (
        member.role <> 'Staff'
        or not v_project_staff_membership_defined
        or v_new_state <> 'assigned_staff'
        or exists (
          select 1 from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = v_project_id
            and project.data -> 'staffMemberIds' ? v_new_assignee
        )
      )$old$;
  new_assignee_scope text := $new$      and (
        (
          member.role <> 'Staff'
          or not v_project_staff_membership_defined
          or exists (
            select 1 from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and project.entity_id = v_project_id
              and project.data -> 'staffMemberIds' ? v_new_assignee
          )
        )
        and (
          member.role <> 'Project Manager'
          or v_project_id is null
          or not v_project_manager_membership_defined
          or exists (
            select 1 from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and project.entity_id = v_project_id
              and project.data -> 'projectManagerIds' ? v_new_assignee
          )
        )
      )$new$;
begin
  definition := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  updated := replace(definition, '  v_project_staff_membership_defined boolean := false;', '  v_project_staff_membership_defined boolean := false;' || E'\n' || '  v_project_manager_membership_defined boolean := false;');
  if updated = definition then
    raise exception 'Task assignment membership declaration was not found.';
  end if;

  definition := updated;
  updated := replace(definition, old_membership_fields, new_membership_fields);
  if updated = definition then
    raise exception 'Project membership field lookup was not found; inspect the current task assignment validator.';
  end if;

  definition := updated;
  updated := replace(definition, old_staff_scope, new_assignee_scope);
  if updated = definition then
    raise exception 'Assignee membership predicate was not found; inspect the current task assignment validator.';
  end if;

  execute updated;
end;
$$;
