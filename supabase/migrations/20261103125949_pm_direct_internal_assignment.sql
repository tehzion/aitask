-- A responsible PM may assign any active internal member directly.
-- Explicit assignment grants access to that task, not the rest of its project.
do $migration$
declare definition text; anchor text; replacement text;
begin
  definition := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  anchor := '  -- A newly-created PM task must have a valid HOD handoff.';
  replacement := $body$
  if v_actor_role = 'Project Manager' then
    if v_project_id is not null and not private.aitask_is_super_admin(p_workspace_id)
      and not private.aitask_project_manager_id_is_assigned(p_workspace_id,v_project_id,v_actor_member_id) then
      return false;
    end if;
    -- The caller's outer mutation guard enforces project/company ownership.
    -- Preserve route consistency without requiring a department HOD.
    if v_new_state not in ('', 'needs_hod', 'pending_hod', 'assigned_staff') then return false; end if;
    if v_new_state = 'needs_hod' and (v_new_assignee <> '' or v_new_hod <> '') then return false; end if;
    if v_new_state = 'pending_hod' and (v_new_hod = '' or v_new_assignee <> v_new_hod) then return false; end if;
    if v_override_reason <> '' and v_override_actor <> v_actor_member_id then return false; end if;
    if v_new_hod <> '' and not exists (
      select 1 from public.aitask_members hod
      join auth.users account on account.id=hod.auth_user_id
      where hod.workspace_id=p_workspace_id and hod.id=v_new_hod
        and (hod.role='HOD' or hod.custom_role_id='builtin-hod')
        and (account.banned_until is null or account.banned_until <= now())
    ) then return false; end if;
    if v_new_assignee = '' then return true; end if;
    return exists (
      select 1 from public.aitask_members member
      join auth.users account on account.id=member.auth_user_id
      where member.workspace_id=p_workspace_id and member.id=v_new_assignee
        and member.role <> 'Client'
        and (account.banned_until is null or account.banned_until <= now())
    );
  end if;
$body$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one PM assignment boundary';
  end if;
  execute replace(definition,anchor,replacement || E'\n' || anchor);

  definition := pg_get_functiondef('private.aitask_can_view_task(text,text)'::regprocedure);
  anchor := '      when private.aitask_is_super_admin(p_workspace_id) then true';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task visibility boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n      when private.aitask_member_role(p_workspace_id) in (''Project Manager'',''Staff'')\n        and task.assigned_to = private.aitask_member_id(p_workspace_id) then true');

  definition := pg_get_functiondef('private.aitask_can_edit_task(text,text)'::regprocedure);
  anchor := '    select private.aitask_is_super_admin(p_workspace_id)';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task edit boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n      or (private.aitask_member_role(p_workspace_id) in (''Project Manager'',''Staff'')\n        and task.assigned_to = private.aitask_member_id(p_workspace_id))');

  -- A task-only assignment must not expand a PM's company portfolio.
  definition := pg_get_functiondef('private.aitask_can_view_client(text,text)'::regprocedure);
  anchor := '          and private.aitask_can_view_task(p_workspace_id, task.entity_id)';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 2 then
    raise exception 'Expected PM and Staff client visibility boundaries';
  end if;
  -- Only the first occurrence is the PM branch; Staff retains its existing scope.
  definition := overlay(definition placing (anchor || E'\n          and (nullif(task.data ->> ''projectId'', '''') is null\n            or private.aitask_project_manager_id_is_assigned(p_workspace_id, task.data ->> ''projectId'', private.aitask_member_id(p_workspace_id)))')
    from strpos(definition,anchor) for length(anchor));
  execute definition;

  -- Keeping an existing link needs task access, not visibility of its project.
  definition := pg_get_functiondef('private.aitask_can_mutate_entity_legacy(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  anchor := '      or not private.aitask_task_project_link_is_valid(
        p_workspace_id, v_task_project_id, v_task_client_id, v_client_key
      )';
  replacement := $link$
      or (not (p_action = 'update'
          and coalesce(p_old_data ->> 'projectId', '') = coalesce(p_new_data ->> 'projectId', '')
          and coalesce(p_old_data ->> 'clientId', '') = coalesce(p_new_data ->> 'clientId', '')
          and lower(btrim(coalesce(p_old_data ->> 'clientName', ''))) = v_client_key)
        and not private.aitask_task_project_link_is_valid(
          p_workspace_id, v_task_project_id, v_task_client_id, v_client_key
        ))$link$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task project link mutation boundary';
  end if;
  execute replace(definition,anchor,replacement);

  definition := pg_get_functiondef('private.aitask_can_mutate_entity_legacy(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  anchor := '  if p_entity_type = ''task'' and p_action in (''insert'', ''update'') then';
  replacement := $scope$
  if p_entity_type = 'task' and p_action = 'update'
    and v_role = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id)
    and nullif(p_old_data ->> 'projectId', '') is not null
    and not private.aitask_project_manager_id_is_assigned(p_workspace_id, p_old_data ->> 'projectId', v_member_id)
    and exists (
      select 1 from unnest(array['projectId','projectName','clientId','clientName','serviceType','department',
        'createdBy','assignedTo','assignedBy','responsibleHodId','assignmentState','assignmentOverride']) field
      where p_old_data -> field is distinct from p_new_data -> field
    ) then return false;
  end if;
$scope$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task mutation scope boundary';
  end if;
  execute replace(definition,anchor,replacement || E'\n' || anchor);
end;
$migration$;
