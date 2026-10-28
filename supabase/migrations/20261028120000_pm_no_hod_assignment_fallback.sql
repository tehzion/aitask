-- Project Managers may assign Staff directly when the task department has no
-- active HOD. Departments with an HOD keep the HOD-first route: PM-created
-- work is handed to the HOD, and a PM may only bypass the HOD with an explicit,
-- reasoned override. Moving a Staff-assigned task into an HOD department is
-- treated as the same bypass.
--
-- The full validator is restated here rather than patched by text so the
-- migration replays deterministically.

create or replace function private.aitask_task_assignment_is_valid(p_workspace_id text, p_action text, p_old_data jsonb, p_new_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assignee text := coalesce(p_old_data ->> 'assignedTo', '');
  v_new_assignee text := coalesce(p_new_data ->> 'assignedTo', '');
  v_old_department text := private.aitask_task_department(p_old_data ->> 'department');
  v_new_department text := private.aitask_task_department(p_new_data ->> 'department');
  v_old_creator text := coalesce(p_old_data ->> 'createdBy', p_old_data ->> 'userId', '');
  v_new_creator text := coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', '');
  v_old_hod text := coalesce(p_old_data ->> 'responsibleHodId', '');
  v_new_hod text := coalesce(p_new_data ->> 'responsibleHodId', '');
  v_old_state text := coalesce(p_old_data ->> 'assignmentState', '');
  v_new_state text := coalesce(p_new_data ->> 'assignmentState', '');
  v_project_id text := nullif(btrim(coalesce(p_new_data ->> 'projectId', p_old_data ->> 'projectId', '')), '');
  v_actor_member_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
  v_actor_is_hod boolean := exists (
    select 1 from public.aitask_members actor
    where actor.workspace_id = p_workspace_id
      and actor.id = v_actor_member_id
      and (actor.role = 'HOD' or actor.custom_role_id = 'builtin-hod')
  );
  v_override_reason text := btrim(coalesce(p_new_data -> 'assignmentOverride' ->> 'reason', ''));
  v_override_actor text := coalesce(p_new_data -> 'assignmentOverride' ->> 'actorId', '');
  v_project_hod_membership_defined boolean := false;
  v_project_staff_membership_defined boolean := false;
  v_department_has_hod boolean := false;
begin
  -- Client approval commands use a privacy projection and never mutate the
  -- assignment route. Their existing validator remains authoritative.
  if p_action = 'update' and v_actor_role = 'Client'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true' then
    return true;
  end if;

  if p_action = 'update' and v_old_creator is distinct from v_new_creator then
    return false;
  end if;
  if v_new_department is null then return false; end if;

  if v_project_id is not null then
    select coalesce(project.data ? 'hodMemberIds', false), coalesce(project.data ? 'staffMemberIds', false)
      into v_project_hod_membership_defined, v_project_staff_membership_defined
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = v_project_id;
  end if;

  -- HOD-first routing applies only where the task department has an active
  -- HOD. Departments without one keep the Project Manager fallback: the PM
  -- assigns Staff directly and no responsible HOD is recorded.
  v_department_has_hod := exists (
    select 1
    from public.aitask_members hod
    join auth.users auth_user on auth_user.id = hod.auth_user_id
    where hod.workspace_id = p_workspace_id
      and (hod.role = 'HOD' or hod.custom_role_id = 'builtin-hod')
      and v_new_department = any(coalesce(hod.departments, array[]::text[]))
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
  );

  -- A complete non-assignment edit must preserve all route fields. This keeps
  -- the fast path while preventing clients from changing state invisibly.
  if p_action = 'update'
    and v_old_assignee = v_new_assignee
    and v_old_department is not distinct from v_new_department
    and v_old_hod = v_new_hod
    and v_old_state = v_new_state
    and p_old_data -> 'assignmentOverride' is not distinct from p_new_data -> 'assignmentOverride' then
    return true;
  end if;

  -- A newly-created PM task must have a valid HOD handoff. The existing
  -- Waiting Approval insertion path remains available for explicit review
  -- tasks, which are not normal production assignments.
  if p_action = 'insert'
    and v_actor_role = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id)
    and coalesce(p_new_data ->> 'status', '') <> 'Waiting Approval'
    and v_department_has_hod then
    if v_new_state <> 'pending_hod' or v_new_hod = '' or v_new_assignee <> v_new_hod then
      return false;
    end if;
  end if;

  -- Route-state consistency is enforced for new records and any record that
  -- opts into the explicit state fields. Omitted fields remain legacy-safe.
  if v_new_state <> '' and v_new_state not in ('needs_hod', 'pending_hod', 'assigned_staff') then
    return false;
  end if;
  if v_new_state = 'needs_hod' and (v_new_assignee <> '' or v_new_hod <> '') then
    return false;
  end if;
  if v_new_state = 'pending_hod' and (v_new_hod = '' or v_new_assignee <> v_new_hod) then
    return false;
  end if;
  if v_new_state = 'assigned_staff' and v_new_hod = '' and v_department_has_hod then
    return false;
  end if;

  -- Any supplied responsible HOD must be an active HOD in the task
  -- department and, where configured, an explicit member of the project.
  if v_new_hod <> '' and not exists (
    select 1
    from public.aitask_members hod
    join auth.users auth_user on auth_user.id = hod.auth_user_id
    where hod.workspace_id = p_workspace_id
      and hod.id = v_new_hod
      and (hod.role = 'HOD' or hod.custom_role_id = 'builtin-hod')
      and v_new_department = any(coalesce(hod.departments, array[]::text[]))
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and (
        v_project_id is null
        or not v_project_hod_membership_defined
        or exists (
          select 1 from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = v_project_id
            and project.data -> 'hodMemberIds' ? v_new_hod
        )
      )
  ) then
    return false;
  end if;

  -- Preserve the existing mutation boundary. Boss Koo keeps workspace-wide
  -- authority; PMs and department leads must operate inside their scope.
  if p_action = 'update'
    and not private.aitask_is_super_admin(p_workspace_id)
    and not (
      v_old_creator = v_actor_member_id
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
    )
    and not (
      v_actor_is_hod
      and private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
      and (v_old_assignee = v_actor_member_id or v_old_hod = v_actor_member_id)
    )
    and not (
      v_actor_role = 'Project Manager'
      and (
        (v_project_id is not null and private.aitask_project_manager_id_is_assigned(p_workspace_id, v_project_id, v_actor_member_id))
        or v_old_assignee = v_actor_member_id
        or v_old_creator = v_actor_member_id
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = lower(btrim(coalesce(p_old_data ->> 'clientName', p_new_data ->> 'clientName', '')))
            and client.created_by = v_actor_member_id
        )
      )
    ) then
    return false;
  end if;

  -- HODs may hand pending work to project-authorized Staff only. Staff cannot
  -- self-assign or mutate a route state, even when they share a project.
  if p_action = 'update' and v_actor_is_hod and v_new_assignee <> v_old_assignee then
    if v_old_hod <> v_actor_member_id
      and v_old_assignee <> v_actor_member_id
      and not (
        v_actor_is_hod
        and v_old_department = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.id = v_actor_member_id
        ), array[]::text[]))
        and (v_project_id is null or private.aitask_hod_is_assigned(p_workspace_id, v_project_id))
      ) then
      return false;
    end if;
  end if;
  if p_action = 'update' and v_actor_role = 'Staff' and not v_actor_is_hod
    and (v_new_assignee <> v_old_assignee or v_new_hod <> v_old_hod or v_new_state <> v_old_state) then
    return false;
  end if;

  -- Where the department has an HOD, a PM may bypass the HOD stage only
  -- through an explicit, reasoned override. Moving a Staff-assigned task into
  -- such a department counts as a bypass too. A task created directly in
  -- review is the PM handing finished work to its reviewer, as on insert above.
  if v_new_assignee <> ''
    and (v_new_assignee <> v_old_assignee or v_new_department is distinct from v_old_department)
    and v_department_has_hod
    and not (p_action = 'insert' and coalesce(p_new_data ->> 'status', '') = 'Waiting Approval')
    and v_actor_role = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id)
    and exists (
      select 1 from public.aitask_members target
      where target.workspace_id = p_workspace_id
        and target.id = v_new_assignee
        and target.role = 'Staff'
        and coalesce(target.custom_role_id, '') <> 'builtin-hod'
    )
    and v_override_reason = '' then
    return false;
  end if;
  if v_override_reason <> '' and (v_actor_role <> 'Project Manager' or v_override_actor <> v_actor_member_id) then
    return false;
  end if;

  if v_new_assignee <> '' and not exists (
    select 1
    from public.aitask_members member
    join auth.users auth_user on auth_user.id = member.auth_user_id
    where member.workspace_id = p_workspace_id
      and member.id = v_new_assignee
      and member.role <> 'Client'
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and (member.role = 'Project Manager' or v_new_department = any(coalesce(member.departments, array[]::text[])))
      and (
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
      )
  ) then
    return false;
  end if;

  return true;
end;
$$
;

revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb)
  from public, anon, authenticated;

-- 20261023120000 renamed the original mutator to
-- aitask_can_mutate_entity_legacy and recreated aitask_can_mutate_entity as a
-- wrapper. Policies reference functions by OID, so the entity write policies
-- kept calling the legacy function and skipped the wrapper's PM and HOD
-- rules. Point them back at the current mutator.
drop policy if exists "members can insert authorized entities" on public.aitask_entities;
create policy "members can insert authorized entities" on public.aitask_entities
  for insert to authenticated
  with check (private.aitask_can_mutate_entity(
    workspace_id, 'insert', entity_type, entity_id, parent_id, '{}'::jsonb, data
  ));

drop policy if exists "members can update authorized entities" on public.aitask_entities;
create policy "members can update authorized entities" on public.aitask_entities
  for update to authenticated
  using (private.aitask_can_mutate_entity(
    workspace_id, 'update', entity_type, entity_id, parent_id, data, data
  ))
  with check (private.aitask_can_mutate_entity(
    workspace_id, 'update', entity_type, entity_id, parent_id, data, data
  ));

drop policy if exists "members can delete authorized entities" on public.aitask_entities;
create policy "members can delete authorized entities" on public.aitask_entities
  for delete to authenticated
  using (private.aitask_can_mutate_entity(
    workspace_id, 'delete', entity_type, entity_id, parent_id, data, '{}'::jsonb
  ));
