-- Workspace revisions are a low-volume, non-business-data invalidation signal.
-- Clients subscribe to this row and then reload their own RLS-filtered
-- snapshot. Do not publish aitask_entities for cross-role data delivery: the
-- entity table contains role-scoped business data and is not a safe broadcast
-- transport for the whole workspace.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aitask_workspaces'
  ) then
    alter publication supabase_realtime add table public.aitask_workspaces;
  end if;
end;
$$;
