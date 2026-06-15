create table if not exists public.aitask_app_state (
  id text primary key,
  state jsonb not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.aitask_app_state
  add column if not exists version bigint not null default 1;

alter table public.aitask_app_state enable row level security;

grant select, insert, update on public.aitask_app_state to anon, authenticated, service_role;

-- Demo snapshot policy:
-- The current AiTask frontend still uses mock login, so Supabase Auth is not active yet.
-- This policy lets the anon key read/write the shared demo snapshot.
-- Tighten this before production by moving to Supabase Auth + normalized tables.
drop policy if exists "allow demo snapshot read" on public.aitask_app_state;
create policy "allow demo snapshot read"
  on public.aitask_app_state
  for select
  using (id = 'default');

drop policy if exists "allow demo snapshot write" on public.aitask_app_state;
create policy "allow demo snapshot write"
  on public.aitask_app_state
  for insert
  with check (id = 'default');

drop policy if exists "allow demo snapshot update" on public.aitask_app_state;
create policy "allow demo snapshot update"
  on public.aitask_app_state
  for update
  using (id = 'default')
  with check (id = 'default');
