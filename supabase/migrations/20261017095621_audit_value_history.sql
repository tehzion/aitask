-- Preserve immutable before/after values for every business-row mutation.
--
-- aitask_audit_events intentionally remains a compact event index.  It is not
-- sufficient for historical reconstruction because it stores changed field
-- names, but not the values that were replaced or deleted.  These history
-- rows are written by SECURITY DEFINER triggers in the same transaction as the
-- source mutation, so a committed business change always has its provenance
-- and a rolled-back change leaves no history behind.

create table if not exists public.aitask_entity_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_member_id text references public.aitask_members(id) on delete set null,
  actor_snapshot jsonb,
  command_id uuid,
  command_type text,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  check (before_data is not null or after_data is not null)
);

create index if not exists aitask_entity_history_entity_idx
  on public.aitask_entity_history(workspace_id, entity_type, entity_id, occurred_at desc);
create index if not exists aitask_entity_history_workspace_time_idx
  on public.aitask_entity_history(workspace_id, occurred_at desc);
create index if not exists aitask_entity_history_actor_idx
  on public.aitask_entity_history(actor_member_id, occurred_at desc);

alter table public.aitask_entity_history enable row level security;
revoke all on public.aitask_entity_history from public, anon, authenticated;
grant select on public.aitask_entity_history to authenticated;

drop policy if exists "mfa super admins can read entity history" on public.aitask_entity_history;
create policy "mfa super admins can read entity history" on public.aitask_entity_history
  for select to authenticated
  using (
    private.aitask_is_super_admin(workspace_id)
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
  );

create or replace function private.aitask_history_command_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  value text := nullif(current_setting('aitask.command_id', true), '');
begin
  if value is null then return null; end if;
  begin
    return value::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

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
  select to_jsonb(member) into actor_value
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
  select to_jsonb(member) into actor_value
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

revoke all on function private.aitask_history_command_id() from public, anon, authenticated, service_role;
revoke all on function private.aitask_capture_entity_history() from public, anon, authenticated, service_role;
revoke all on function private.aitask_capture_member_history() from public, anon, authenticated, service_role;

drop trigger if exists aitask_capture_entity_history on public.aitask_entities;
create trigger aitask_capture_entity_history
  after insert or update or delete on public.aitask_entities
  for each row execute function private.aitask_capture_entity_history();

drop trigger if exists aitask_capture_member_history on public.aitask_members;
create trigger aitask_capture_member_history
  after insert or update or delete on public.aitask_members
  for each row execute function private.aitask_capture_member_history();

-- History is append-only.  The trigger is deliberately independent of table
-- grants so an accidentally broad service-role grant cannot rewrite evidence.
create or replace function private.aitask_guard_entity_history_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Entity history is append-only';
end;
$$;

revoke all on function private.aitask_guard_entity_history_immutable() from public, anon, authenticated, service_role;
drop trigger if exists aitask_guard_entity_history_immutable on public.aitask_entity_history;
create trigger aitask_guard_entity_history_immutable
  before update or delete on public.aitask_entity_history
  for each row execute function private.aitask_guard_entity_history_immutable();

-- Correlate the primary command paths with their history rows.  Older helper
-- RPCs and scheduled jobs may leave command_id null, but still retain actor,
-- command type, timestamp, and before/after state.
do $migration$
declare
  definition text;
begin
  foreach definition in array array[
    'public.aitask_execute_command(text,uuid,text,jsonb,bigint)',
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'
  ] loop
    definition := pg_get_functiondef(definition::regprocedure);
    if position('aitask.command_id' in definition) = 0 then
      definition := regexp_replace(
        definition,
        E'(?i)\\mbegin\\M',
        E'begin\n  perform set_config(''aitask.command_id'', p_command_id::text, true);',
        1,
        1
      );
      if position('aitask.command_id' in definition) = 0 then
        raise exception 'Unable to install command correlation for %', definition;
      end if;
      execute definition;
    end if;
  end loop;
end;
$migration$;
