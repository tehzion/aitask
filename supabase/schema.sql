create table if not exists public.aitask_app_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.aitask_app_state enable row level security;

-- Demo snapshot policy:
-- The current AiTask frontend still uses mock login, so Supabase Auth is not active yet.
-- This policy lets the anon key read/write the shared demo snapshot.
-- Tighten this before production by moving to Supabase Auth + normalized tables.
drop policy if exists "allow demo snapshot read" on public.aitask_app_state;
create policy "allow demo snapshot read"
  on public.aitask_app_state
  for select
  using (true);

drop policy if exists "allow demo snapshot write" on public.aitask_app_state;
create policy "allow demo snapshot write"
  on public.aitask_app_state
  for insert
  with check (true);

drop policy if exists "allow demo snapshot update" on public.aitask_app_state;
create policy "allow demo snapshot update"
  on public.aitask_app_state
  for update
  using (true)
  with check (true);
