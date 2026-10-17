-- Preserve audit evidence across member and workspace removal until an
-- owner-approved archive/retention policy exists.
--
-- The initial history migration used ON DELETE SET NULL for actor_member_id
-- and ON DELETE CASCADE for workspace_id. The first mutates an append-only
-- row during member deletion; the second deletes immutable evidence. Actor
-- snapshots already retain the display identity, so the actor reference is
-- intentionally historical rather than relational.

do $migration$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.aitask_entity_history'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.aitask_members'::regclass
  loop
    execute format('alter table public.aitask_entity_history drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.aitask_entity_history'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.aitask_workspaces'::regclass
  loop
    execute format('alter table public.aitask_entity_history drop constraint %I', constraint_name);
  end loop;

  -- Keep workspace ownership explicit, but make cleanup fail loudly instead
  -- of deleting immutable evidence with the workspace.
  if not exists (
    select 1
    from pg_constraint con
    where con.conrelid = 'public.aitask_entity_history'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.aitask_workspaces'::regclass
  ) then
    alter table public.aitask_entity_history
      add constraint aitask_entity_history_workspace_id_fkey
      foreign key (workspace_id)
      references public.aitask_workspaces(id)
      on delete restrict;
  end if;
end;
$migration$;

comment on column public.aitask_entity_history.actor_member_id is
  'Historical actor id; deliberately not an FK so member removal cannot mutate immutable evidence.';

comment on column public.aitask_entity_history.workspace_id is
  'Historical workspace id; the foreign key uses ON DELETE RESTRICT so workspace removal cannot delete immutable evidence.';
