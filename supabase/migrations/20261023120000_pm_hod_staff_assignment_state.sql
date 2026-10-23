-- Durable PM -> HOD -> Staff assignment routing.
--
-- New tasks carry responsibleHodId and assignmentState in their JSON payload.
-- Legacy tasks are intentionally left untouched: omitted routing fields retain
-- the historical assignment rules until a user performs an explicit handoff.

create or replace function private.aitask_task_assignment_is_valid(
  p_workspace_id text,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb
)
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
    and coalesce(p_new_data ->> 'status', '') <> 'Waiting Approval' then
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
  if v_new_state = 'assigned_staff' and v_new_hod = '' then
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
    if v_old_hod <> v_actor_member_id and v_old_assignee <> v_actor_member_id then
      return false;
    end if;
  end if;
  if p_action = 'update' and v_actor_role = 'Staff'
    and (v_new_assignee <> v_old_assignee or v_new_hod <> v_old_hod or v_new_state <> v_old_state) then
    return false;
  end if;

  -- A PM may bypass the HOD stage only through an explicit, reasoned override.
  if v_new_assignee <> '' and v_new_assignee <> v_old_assignee
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
$$;

revoke all on function private.aitask_task_assignment_is_valid(text, text, jsonb, jsonb) from public, anon, authenticated;

-- The historical entity mutator predates Project Manager task creation and
-- only admits Admin/Staff inserts. Preserve that function for every existing
-- path, while adding the scoped PM insert path needed by the HOD-first flow.
alter function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb)
  rename to aitask_can_mutate_entity_legacy;

create or replace function private.aitask_can_mutate_entity(
  p_workspace_id text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_parent_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_project_id text := nullif(btrim(coalesce(p_new_data ->> 'projectId', p_parent_id, '')), '');
  v_client_key text := lower(btrim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
begin
  if p_action = 'insert' and p_entity_type = 'task' and v_role = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id) then
    if coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', '') <> v_member_id then
      return false;
    end if;
    if not private.aitask_task_project_link_is_valid(
      p_workspace_id,
      v_project_id,
      nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), ''),
      v_client_key
    ) or not private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data) then
      return false;
    end if;
    if v_project_id is not null then
      return private.aitask_project_manager_id_is_assigned(p_workspace_id, v_project_id, v_member_id);
    end if;
    return exists (
      select 1 from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.client_key = v_client_key
        and client.created_by = v_member_id
    );
  end if;
  return private.aitask_can_mutate_entity_legacy(
    p_workspace_id, p_action, p_entity_type, p_entity_id, p_parent_id, p_old_data, p_new_data
  );
end;
$$;

revoke all on function private.aitask_can_mutate_entity(text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- Keep the explicit routing decision in the task's server-stamped history as
-- well as in the durable task payload. This trigger runs after the existing
-- workflow-history trigger (the name sorts later) and never trusts a client
-- supplied actor or timestamp.
create or replace function private.aitask_record_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_now text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_fields jsonb := '[]'::jsonb;
  v_history jsonb := case when jsonb_typeof(new.data->'workHistory') = 'array' then new.data->'workHistory' else '[]'::jsonb end;
begin
  if tg_op <> 'UPDATE' or new.entity_type <> 'task' or v_actor is null then return new; end if;
  if old.data->>'responsibleHodId' is distinct from new.data->>'responsibleHodId' then v_fields := v_fields || '"responsibleHodId"'::jsonb; end if;
  if old.data->>'assignmentState' is distinct from new.data->>'assignmentState' then v_fields := v_fields || '"assignmentState"'::jsonb; end if;
  if old.data->'assignmentOverride' is distinct from new.data->'assignmentOverride' then v_fields := v_fields || '"assignmentOverride"'::jsonb; end if;
  if jsonb_array_length(v_fields) > 0 then
    v_history := v_history || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'userId', v_actor,
      'createdAt', v_now,
      'fields', v_fields
    ));
    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
      into v_history
      from jsonb_array_elements(v_history) with ordinality entries(item, ordinal)
      where ordinal > jsonb_array_length(v_history) - 50;
    new.data := new.data || jsonb_build_object('workHistory', v_history);
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_record_assignment_history() from public, anon, authenticated;
drop trigger if exists zzzz_aitask_record_assignment_history on public.aitask_entities;
create trigger zzzz_aitask_record_assignment_history before update of data on public.aitask_entities
for each row execute function private.aitask_record_assignment_history();
