-- Insert-only operational events; no user-authored text or payloads. Applied to production 2026-11-10 (approved by Y.L).
create table public.aitask_client_events (
  event_id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  member_id text not null,
  role text not null check (role in ('Project Manager', 'HOD', 'Staff', 'Client')),
  event_type text not null check (event_type in ('banner_shown', 'save_failure', 'recovery_duration', 'chunk_load_failure')),
  detail text,
  duration_ms integer,
  constraint aitask_client_events_fields check ((
    (event_type = 'banner_shown' and detail in ('conflict','retry','offline','auth','upgrade','connection','remote_update') and duration_ms is null)
    or (event_type = 'save_failure' and detail in ('OFFLINE','CONFLICT','FORBIDDEN','VALIDATION','NOT_FOUND','RETRY_REQUIRED','AUTH_REQUIRED') and duration_ms is null)
    or (event_type = 'recovery_duration' and detail is null and duration_ms between 0 and 86400000)
    or (event_type = 'chunk_load_failure' and detail is null and duration_ms is null)
  ) is true)
);
alter table public.aitask_client_events enable row level security;
revoke all on public.aitask_client_events from public, anon, authenticated;
grant insert (member_id, role, event_type, detail, duration_ms) on public.aitask_client_events to authenticated;
create policy "members insert their own client events" on public.aitask_client_events
  for insert to authenticated
  with check (exists (
    select 1 from public.aitask_members m
    where m.id = aitask_client_events.member_id and m.auth_user_id = (select auth.uid()) and m.role = aitask_client_events.role
  ));
grant select, insert, update, delete on public.aitask_client_events to service_role;
