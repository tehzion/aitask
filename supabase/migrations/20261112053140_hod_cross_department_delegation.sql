-- Allow an HOD to hand their own open task to active internal Staff in any
-- department. Keep all non-HOD assignment rules in the existing validator.
create or replace function private.aitask_hod_staff_is_eligible(p_workspace_id text, p_member_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.aitask_members member
    join auth.users account on account.id = member.auth_user_id
    where member.workspace_id = p_workspace_id and member.id = p_member_id
      and member.role = 'Staff' and coalesce(member.custom_role_id, '') <> 'builtin-hod'
      and not exists (select 1 from public.aitask_entities role
        where role.workspace_id = member.workspace_id and role.entity_type = 'custom_role'
          and role.entity_id = member.custom_role_id and role.data ->> 'baseRole' = 'HOD')
      and account.deleted_at is null
      and (account.banned_until is null or account.banned_until <= now())
  );
$$;
revoke all on function private.aitask_hod_staff_is_eligible(text,text) from public, anon, authenticated, service_role;

-- Only HODs may request the eligible ids; no auth account details are exposed.
create or replace function private.aitask_hod_eligible_staff(p_workspace_id text)
returns table (id text) language sql stable security definer set search_path = '' as $$
  select member.id from public.aitask_members member
  where (select auth.uid()) is not null and private.aitask_is_hod(p_workspace_id)
    and member.workspace_id = p_workspace_id
    and private.aitask_hod_staff_is_eligible(p_workspace_id, member.id);
$$;
revoke all on function private.aitask_hod_eligible_staff(text) from public, anon, authenticated, service_role;

create or replace function public.aitask_hod_eligible_staff(p_workspace_id text)
returns table (id text) language sql stable security definer set search_path = '' as $$
  select * from private.aitask_hod_eligible_staff(p_workspace_id);
$$;
revoke all on function public.aitask_hod_eligible_staff(text) from public, anon, authenticated, service_role;
grant execute on function public.aitask_hod_eligible_staff(text) to authenticated;

do $migration$
declare
  definition text;
  anchor text;
  replacement text;
begin
  definition := pg_get_functiondef('private.aitask_task_assignment_is_valid(text,text,jsonb,jsonb)'::regprocedure);
  anchor := '  -- A newly-created PM task must have a valid HOD handoff.';
  replacement := $body$
  if p_action = 'update' and v_actor_is_hod and v_actor_role = 'Staff'
    and (v_old_assignee <> v_new_assignee or v_old_hod <> v_new_hod
      or v_old_state <> v_new_state or v_old_department is distinct from v_new_department) then
    if (v_old_assignee <> v_actor_member_id and v_old_hod <> v_actor_member_id)
      or not private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
      or v_old_assignee = v_new_assignee
      or v_new_hod not in (v_old_hod, v_actor_member_id)
      or v_new_state not in (v_old_state, 'assigned_staff')
      or v_old_department is distinct from v_new_department
      or coalesce(p_old_data ->> 'status', '') in ('Waiting Approval', 'Approved', 'Completed', 'Cancelled')
      or coalesce(p_old_data ->> 'isCompleted', 'false') = 'true'
      or coalesce(p_new_data ->> 'isCompleted', 'false') <> coalesce(p_old_data ->> 'isCompleted', 'false')
      or coalesce(p_new_data ->> 'status', '') not in (coalesce(p_old_data ->> 'status', ''), 'Pending') then
      return false;
    end if;
    return private.aitask_hod_staff_is_eligible(p_workspace_id, v_new_assignee);
  end if;
$body$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one HOD assignment insertion point';
  end if;
  execute replace(definition,anchor,replacement || E'\n' || anchor);

  -- The existing early HOD handoff bypassed the restricted-field validator.
  -- Check that validator as well, so assignment cannot be used to move a task.
  definition := pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  anchor := '    return private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);';
  replacement := $body$
    return private.aitask_hod_task_execution_patch_is_valid(p_workspace_id, p_old_data,
      (p_new_data - 'assignedAt') || jsonb_build_object('assignedBy', v_member_id)
        || case when p_old_data ? 'assignedAt' then jsonb_build_object('assignedAt', p_old_data -> 'assignedAt') else '{}'::jsonb end)
      and private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);
$body$;
  -- The function contains two identical returns; change only the first, which
  -- is the owner handoff. The second already runs the patch check above it.
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 2 then
    raise exception 'Expected two HOD assignment returns';
  end if;
  execute overlay(definition placing replacement from strpos(definition,anchor) for length(anchor));

  -- Older clients omit route fields. Stamp the authoritative HOD and state
  -- after the command validator has approved the actual assignment change.
  definition := pg_get_functiondef('private.aitask_guard_entity()'::regprocedure);
  anchor := '  -- A task edit that does not change the assignee keeps the stored attribution';
  replacement := $body$
  if tg_op = 'UPDATE' and new.entity_type = 'task'
    and private.aitask_member_role(new.workspace_id) = 'Staff'
    and private.aitask_is_hod(new.workspace_id)
    and coalesce(old.data ->> 'assignedTo', '') <> coalesce(new.data ->> 'assignedTo', '')
    and private.aitask_task_assignment_is_valid(new.workspace_id, 'update', old.data, new.data) then
    new.data := jsonb_set(new.data, '{responsibleHodId}', to_jsonb(private.aitask_member_id(new.workspace_id)), true);
    new.data := jsonb_set(new.data, '{assignmentState}', '"assigned_staff"'::jsonb, true);
  end if;
$body$;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task attribution boundary';
  end if;
  execute replace(definition,anchor,replacement || E'\n' || anchor);

  -- Responsible HODs retain visibility and edit access even when the task was
  -- originally assigned outside their project or department.
  definition := pg_get_functiondef('private.aitask_can_view_task(text,text)'::regprocedure);
  anchor := '      when private.aitask_is_super_admin(p_workspace_id) then true';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task visibility boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n      when private.aitask_is_hod(p_workspace_id)\n        and task.data ->> ''responsibleHodId'' = private.aitask_member_id(p_workspace_id) then true');

  definition := pg_get_functiondef('private.aitask_can_edit_task(text,text)'::regprocedure);
  anchor := '    select private.aitask_is_super_admin(p_workspace_id)';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
    raise exception 'Expected one task edit boundary';
  end if;
  execute replace(definition,anchor,anchor || E'\n      or (private.aitask_is_hod(p_workspace_id)\n        and task.data ->> ''responsibleHodId'' = private.aitask_member_id(p_workspace_id))');
end;
$migration$;
