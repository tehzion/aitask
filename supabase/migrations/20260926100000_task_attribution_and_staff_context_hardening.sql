-- Harden task assignment attribution and the Staff task-context seed.
--
-- 1. Attribution. `20260923130000` preserved `assignedBy`/`assignedAt` on a
--    non-assignment edit only when the incoming value was empty, so a crafted
--    client could send any `assignedBy` and the value was trusted (and then used
--    by the Staff notification guard). Restore the stored attribution whenever
--    `assignedTo` is unchanged, regardless of what the payload contains.
-- 2. Staff context. `20260925110000` seeded the authorized task from
--    comment/approval `data->>'taskId'` OR `parentId`, but `aitask_guard_entity`
--    stores `parent_id` from `data->>'taskId'`. A mismatched `parentId` could
--    inject an unrelated task into the authorized set, so seed from
--    `data->>'taskId'` only.

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
  -- task edit keeps the previous assigner untouched.
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
  -- exactly, even if the payload tried to supply a different one.
  if new.entity_type = 'task'
    and tg_op = 'UPDATE'
    and coalesce(old.data ->> 'assignedTo', '') = coalesce(new.data ->> 'assignedTo', '') then
    new.data := new.data - 'assignedBy' - 'assignedAt';
    if old.data ? 'assignedBy' then
      new.data := jsonb_set(new.data, '{assignedBy}', old.data -> 'assignedBy', true);
    end if;
    if old.data ? 'assignedAt' then
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

create or replace function private.aitask_seed_staff_task_context(
  p_workspace_id text,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb := '[]'::jsonb;
begin
  if private.aitask_member_role(p_workspace_id) = 'Staff'
    and jsonb_typeof(p_operations) = 'array' then
    select coalesce(jsonb_agg(distinct task_id), '[]'::jsonb)
      into v_context
    from (
      select nullif(btrim(operation ->> 'entityId'), '') as task_id
      from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity'
        and operation ->> 'entityType' = 'task'
        and operation ->> 'action' in ('insert', 'update', 'delete')
      union
      select nullif(btrim(operation -> 'data' ->> 'taskId'), '') as task_id
      from jsonb_array_elements(p_operations) operation
      where operation ->> 'kind' = 'entity'
        and operation ->> 'entityType' in ('comment', 'approval')
    ) task_refs
    where task_id is not null;
  end if;

  perform set_config('aitask.staff_task_context', v_context::text, true);
  perform set_config('aitask.staff_delete_notice_context', '[]', true);
end;
$$;

revoke all on function private.aitask_seed_staff_task_context(text, jsonb)
  from public, anon, authenticated, service_role;
