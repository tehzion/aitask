-- Close two gaps surfaced by the staff/assignment pgTAP invariants.
--
-- 1. Task assignment attribution. The client sends the whole task payload on
--    every update, so a non-assignment edit no longer carries `assignedBy` and
--    `assignedAt`. The guard now preserves the previous attribution whenever
--    the assignee is unchanged, instead of dropping it.
-- 2. Staff deliverable completion. `20260922132000` allowed `deliveredAt` in the
--    service command's Staff field allow-list but not in the row guard trigger,
--    so the trigger still rejected the write with "Staff may update deliverable
--    execution fields only." The guard now permits `deliveredAt` too.

create or replace function private.aitask_guard_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  forbidden_key text;
  v_actor_member_id text;
begin
  select key into forbidden_key
  from jsonb_object_keys(new.data) key
  where key ~* '(password|secret|token|api[_-]?key|service[_-]?role)'
  limit 1;
  if forbidden_key is not null then
    raise exception 'AiTask entities cannot contain secret-like fields';
  end if;

  if tg_op = 'UPDATE'
    and old.entity_type = 'client'
    and lower(trim(coalesce(old.data ->> 'clientName', '')))
      is distinct from lower(trim(coalesce(new.data ->> 'clientName', '')))
    and not private.aitask_is_admin(old.workspace_id) then
    raise exception 'Only Project Managers can rename clients';
  end if;

  -- Record who assigned a task, from the authenticated actor. Reassignment
  -- (assignedTo changed) and creation both update the attribution; any other
  -- task edit leaves the previous assigner in place.
  if new.entity_type = 'task'
    and (
      tg_op = 'INSERT'
      or (tg_op = 'UPDATE'
        and coalesce(old.data ->> 'assignedTo', '') is distinct from coalesce(new.data ->> 'assignedTo', ''))
    ) then
    v_actor_member_id := private.aitask_member_id(new.workspace_id);
    if v_actor_member_id is not null then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{assignedBy}', to_jsonb(v_actor_member_id), true);
      new.data := jsonb_set(
        new.data,
        '{assignedAt}',
        to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        true
      );
    end if;
  end if;

  -- A task edit that does not change the assignee keeps the stored attribution
  -- even though the client sent a full replacement payload without it.
  if new.entity_type = 'task'
    and tg_op = 'UPDATE'
    and coalesce(old.data ->> 'assignedTo', '') = coalesce(new.data ->> 'assignedTo', '') then
    if coalesce(new.data ->> 'assignedBy', '') = '' and coalesce(old.data ->> 'assignedBy', '') <> '' then
      new.data := jsonb_set(new.data, '{assignedBy}', old.data -> 'assignedBy', true);
    end if;
    if coalesce(new.data ->> 'assignedAt', '') = '' and coalesce(old.data ->> 'assignedAt', '') <> '' then
      new.data := jsonb_set(new.data, '{assignedAt}', old.data -> 'assignedAt', true);
    end if;
  end if;

  new.client_key := lower(trim(coalesce(new.data ->> 'clientName', new.data ->> 'targetClient', '')));
  new.assigned_to := nullif(trim(new.data ->> 'assignedTo'), '');
  new.created_by := nullif(trim(coalesce(new.data ->> 'createdBy', new.data ->> 'userId')), '');
  new.target_user_id := nullif(trim(new.data ->> 'targetUserId'), '');
  new.target_role := nullif(trim(new.data ->> 'targetRole'), '');
  new.target_client_key := lower(trim(coalesce(new.data ->> 'targetClient', '')));
  new.parent_id := case
    when new.entity_type = 'task' then nullif(trim(new.data ->> 'projectId'), '')
    when new.entity_type in ('comment', 'approval') then nullif(trim(new.data ->> 'taskId'), '')
    else new.parent_id
  end;
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function private.aitask_guard_entity() from public, anon, authenticated;

create or replace function private.aitask_guard_scoped_staff_service_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
  v_actor_id text := private.aitask_member_id(v_workspace_id);
  v_expected_cycle_status text;
  v_cycle_id text;
  v_client_id text;
begin
  if v_entity_type not in ('service_cycle', 'deliverable', 'cycle_comment') then
    return coalesce(new, old);
  end if;
  if private.aitask_member_role(v_workspace_id) is distinct from 'Staff'
    or private.aitask_has_permission(v_workspace_id, 'manageServiceCycles') then
    return coalesce(new, old);
  end if;

  if v_entity_type = 'service_cycle' then
    if tg_op <> 'UPDATE'
      or (old.data - array['status', 'publishedAt', 'updatedAt']::text[])
        is distinct from (new.data - array['status', 'publishedAt', 'updatedAt']::text[]) then
      raise check_violation using message = 'Staff cannot administer service cycles.';
    end if;

    select case
      when count(*) > 0 and bool_and(deliverable.data ->> 'status' = 'Delivered') then 'Completed'
      when old.data ->> 'status' = 'Completed' then 'Published'
      else null
    end into v_expected_cycle_status
    from public.aitask_entities deliverable
    where deliverable.workspace_id = v_workspace_id
      and deliverable.entity_type = 'deliverable'
      and deliverable.cycle_id = old.entity_id;
    if v_expected_cycle_status is null or new.data ->> 'status' <> v_expected_cycle_status then
      raise check_violation using message = 'Staff cannot publish or manually change service cycles.';
    end if;
    return new;
  end if;

  if v_entity_type = 'deliverable' then
    if tg_op <> 'UPDATE'
      or (
        not private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'deliveredAt', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'deliveredAt', 'updatedAt']::text[])
      )
      or (
        private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'taskIds', 'deliveredAt', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'taskIds', 'deliveredAt', 'updatedAt']::text[])
      )
      or new.data ->> 'status' not in ('Planned', 'In Progress', 'Ready', 'Delivered') then
      raise check_violation using message = 'Staff may update deliverable execution fields only.';
    end if;
    return new;
  end if;

  if v_entity_type = 'cycle_comment' then
    v_cycle_id := coalesce(new.data ->> 'cycleId', old.data ->> 'cycleId');
    v_client_id := coalesce(new.data ->> 'clientId', old.data ->> 'clientId');
    if not exists (
      select 1
      from public.aitask_entities cycle
      where cycle.workspace_id = v_workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.entity_id = v_cycle_id
        and cycle.client_id = v_client_id
    ) then
      raise check_violation using message = 'Cycle comment scope is invalid.';
    end if;

    if tg_op = 'INSERT' then
      if new.data ->> 'userId' <> v_actor_id
        or btrim(coalesce(new.data ->> 'text', '')) = ''
        or length(new.data ->> 'text') > 10000
        or new.data ->> 'visibility' not in ('internal', 'client-visible') then
        raise check_violation using message = 'Staff comments must be valid and owned by the signed-in member.';
      end if;
      return new;
    elsif tg_op = 'UPDATE' then
      if old.data ->> 'userId' <> v_actor_id
        or new.data ->> 'userId' <> v_actor_id
        or (old.data - array['attachments', 'updatedAt']::text[])
          is distinct from (new.data - array['attachments', 'updatedAt']::text[])
        or jsonb_typeof(coalesce(new.data -> 'attachments', '[]'::jsonb)) <> 'array' then
        raise check_violation using message = 'Staff may update attachments on their own cycle comments only.';
      end if;
      return new;
    end if;
  end if;

  raise check_violation using message = 'Staff cannot create or delete service-management records.';
end;
$$;

revoke all on function private.aitask_guard_scoped_staff_service_write()
  from public, anon, authenticated, service_role;
