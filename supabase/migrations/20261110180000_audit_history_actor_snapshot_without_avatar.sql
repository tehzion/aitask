-- Stop copying the acting member's avatar into every audit history row.
--
-- aitask_entity_history.actor_snapshot is built with to_jsonb(member), which
-- includes the avatar, a base64 image of about 33 kB. On 10 Nov 2026 production
-- held 2,722 history rows; 2,276 carried an avatar, 73 MB of the table's 83 MB
-- (about 70% of the whole database). Before and after values together are about
-- 2 MB.
--
-- This changes only what future rows record about the actor: every other field
-- of the snapshot is unchanged, and the avatar is still available from
-- public.aitask_members. Existing rows are append-only and are not touched here;
-- shrinking them is a separate retention decision (see
-- docs/2026-11-10-handoff-supabase-performance.md).
--
-- Both capture triggers are redefined with the same body as before, apart from
-- "- 'avatar'" on the actor snapshot. CREATE OR REPLACE keeps owner and grants.

create or replace function private.aitask_capture_entity_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace text := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  entity text := case when tg_op = 'DELETE' then old.entity_type else new.entity_type end;
  identity text := case when tg_op = 'DELETE' then old.entity_id else new.entity_id end;
  actor text := private.aitask_member_id(workspace);
  actor_value jsonb;
  previous jsonb := case when tg_op = 'INSERT' then null else old.data end;
  next_value jsonb := case when tg_op = 'DELETE' then null else new.data end;
begin
  select to_jsonb(member) - 'avatar' into actor_value
  from public.aitask_members member
  where member.workspace_id = workspace and member.id = actor;
  insert into public.aitask_entity_history(
    workspace_id, entity_type, entity_id, action, actor_member_id,
    actor_snapshot, command_id, command_type, before_data, after_data, changed_fields
  ) values (
    workspace,
    entity,
    identity,
    lower(tg_op),
    actor,
    actor_value,
    private.aitask_history_command_id(),
    nullif(current_setting('aitask.command_type', true), ''),
    previous,
    next_value,
    private.aitask_json_changed_fields(previous, next_value)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.aitask_capture_member_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace text := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  identity text := case when tg_op = 'DELETE' then old.id else new.id end;
  actor text := private.aitask_member_id(workspace);
  actor_value jsonb;
  previous jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  next_value jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
begin
  select to_jsonb(member) - 'avatar' into actor_value
  from public.aitask_members member
  where member.workspace_id = workspace and member.id = actor;
  insert into public.aitask_entity_history(
    workspace_id, entity_type, entity_id, action, actor_member_id,
    actor_snapshot, command_id, command_type, before_data, after_data, changed_fields
  ) values (
    workspace,
    'member',
    identity,
    lower(tg_op),
    actor,
    actor_value,
    private.aitask_history_command_id(),
    nullif(current_setting('aitask.command_type', true), ''),
    previous,
    next_value,
    private.aitask_json_changed_fields(previous, next_value)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
