-- A manual renewal is represented by the existing draft client_plan revision.
-- Keep exactly one pending revision per source plan so concurrent authorised
-- operators cannot create competing next-month plans. The existing scheduled
-- cycle generator continues to activate that revision at its billing boundary.

create unique index if not exists aitask_pending_plan_revision_source_uidx
  on public.aitask_entities (workspace_id, (data ->> 'supersedesPlanId'))
  where entity_type = 'client_plan'
    and data ->> 'status' = 'Draft'
    and coalesce(data ->> 'supersedesPlanId', '') <> '';

-- The unique index is the database-level backstop. Serialize the same logical
-- source-plan check as a friendly command conflict before the generic command
-- writer attempts its insert. This preserves the retained command for a safe
-- refresh/review instead of presenting a non-actionable database exception.
create or replace function private.aitask_guard_pending_plan_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id text := nullif(new.data ->> 'supersedesPlanId', '');
begin
  if new.entity_type <> 'client_plan'
    or new.data ->> 'status' <> 'Draft'
    or v_source_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id || ':next-plan:' || v_source_id, 0));
  if exists (
    select 1
    from public.aitask_entities existing
    where existing.workspace_id = new.workspace_id
      and existing.entity_type = 'client_plan'
      and existing.entity_id <> new.entity_id
      and existing.data ->> 'status' = 'Draft'
      and existing.data ->> 'supersedesPlanId' = v_source_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'A next-month plan already exists for this service plan.';
  end if;
  return new;
end;
$$;

drop trigger if exists aitask_guard_pending_plan_revision on public.aitask_entities;
create trigger aitask_guard_pending_plan_revision
  before insert or update of data on public.aitask_entities
  for each row execute function private.aitask_guard_pending_plan_revision();

revoke all on function private.aitask_guard_pending_plan_revision() from public, anon, authenticated;
