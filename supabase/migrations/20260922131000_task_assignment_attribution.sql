-- Task assignment attribution.
--
-- Tasks only stored `createdBy` (creator) and `assignedTo` (current assignee),
-- so the UI could not show who actually assigned a task, and a later
-- reassignment by a different member was invisible. This records
-- `assignedBy`/`assignedAt` on the task whenever it is created or its assignee
-- changes, stamped server-side from the authenticated actor so it cannot be
-- spoofed. Existing tasks are backfilled from the audit trail (the last actor
-- that changed `assignedTo`), falling back to the creator.

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

-- Backfill: last audit actor that changed assignedTo, else the task creator.
update public.aitask_entities t
set data = jsonb_set(
  jsonb_set(
    t.data,
    '{assignedBy}',
    to_jsonb(coalesce(
      (
        select e.actor_member_id
        from public.aitask_audit_events e
        where e.workspace_id = t.workspace_id
          and e.entity_type = 'task'
          and e.entity_id = t.entity_id
          and 'assignedTo' = any(e.changed_fields)
        order by e.occurred_at desc
        limit 1
      ),
      t.data ->> 'createdBy'
    )),
    true
  ),
  '{assignedAt}',
  to_jsonb(coalesce(
    (
      select e.occurred_at
      from public.aitask_audit_events e
      where e.workspace_id = t.workspace_id
        and e.entity_type = 'task'
        and e.entity_id = t.entity_id
        and 'assignedTo' = any(e.changed_fields)
      order by e.occurred_at desc
      limit 1
    ),
    t.updated_at
  )),
  true
)
where t.entity_type = 'task'
  and coalesce(t.data ->> 'assignedBy', '') = ''
  and coalesce(t.data ->> 'createdBy', t.data ->> 'assignedTo', '') <> '';
