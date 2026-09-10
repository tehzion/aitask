-- Browser authorization is always enforced by guarded RPCs and RLS. These two
-- publications only reduce the UI cache window after an allowed member's own
-- permissions, department, or assigned custom-role definition changes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aitask_members'
  ) then
    alter publication supabase_realtime add table public.aitask_members;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aitask_entities'
  ) then
    alter publication supabase_realtime add table public.aitask_entities;
  end if;
end;
$$;
