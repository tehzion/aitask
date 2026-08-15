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
grant delete, truncate, references, trigger on public.aitask_app_state to service_role;

create schema if not exists private;

create or replace function private.aitask_app_state_guard()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
declare
  pending jsonb[];
  pending_index integer := 1;
  current_value jsonb;
  item_key text;
  item_value jsonb;
begin
  pending := array[new.state];

  while pending_index <= coalesce(cardinality(pending), 0) loop
    current_value := pending[pending_index];
    pending_index := pending_index + 1;

    if current_value is null then
      continue;
    end if;

    if jsonb_typeof(current_value) = 'object' then
      for item_key, item_value in
        select key, value from jsonb_each(current_value)
      loop
        if item_key ~* '(password|secret|token|api[_-]?key|service[_-]?role)' then
          raise exception 'aitask_app_state cannot store password, token, secret, api key, or service-role fields';
        end if;

        pending := pending || item_value;
      end loop;
    elsif jsonb_typeof(current_value) = 'array' then
      for item_value in
        select value from jsonb_array_elements(current_value)
      loop
        pending := pending || item_value;
      end loop;
    end if;
  end loop;

  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.aitask_app_state_guard() from public;

drop trigger if exists aitask_app_state_guard_before_write on public.aitask_app_state;
create trigger aitask_app_state_guard_before_write
  before insert or update on public.aitask_app_state
  for each row execute function private.aitask_app_state_guard();

create or replace function public.aitask_is_internal_app_origin()
returns boolean
language sql
stable
set search_path to 'pg_catalog'
as $$
  with request_origin as (
    select coalesce(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb) ->> 'origin',
      ''
    ) as origin
  )
  select
    origin in (
      'https://aitask-virid.vercel.app',
      'https://aitask-tehzions-projects.vercel.app',
      'https://aitask-git-master-tehzions-projects.vercel.app'
    )
    or origin ~ '^https://aitask-[a-z0-9]+-tehzions-projects[.]vercel[.]app$'
    or origin ~ '^http://(localhost|127[.]0[.]0[.]1):(5173|5174|5175|5176|5177|5178|5179)$'
  from request_origin;
$$;

grant execute on function public.aitask_is_internal_app_origin() to anon, authenticated, service_role;

-- Interim snapshot policies:
-- AiTask still uses mock login in v1, so this allows only the known app origins
-- to read/write the shared JSON snapshot with the frontend publishable key.
-- Replace this with Supabase Auth + normalized tables before full production hardening.
drop policy if exists "allow demo snapshot read" on public.aitask_app_state;
drop policy if exists "allow demo snapshot write" on public.aitask_app_state;
drop policy if exists "allow demo snapshot update" on public.aitask_app_state;

drop policy if exists "allow internal app snapshot read" on public.aitask_app_state;
create policy "allow internal app snapshot read"
  on public.aitask_app_state
  for select
  to anon, authenticated
  using (
    id = 'default'
    and ((select auth.uid()) is not null or (select public.aitask_is_internal_app_origin()))
  );

drop policy if exists "allow internal app snapshot write" on public.aitask_app_state;
create policy "allow internal app snapshot write"
  on public.aitask_app_state
  for insert
  to anon, authenticated
  with check (
    id = 'default'
    and ((select auth.uid()) is not null or (select public.aitask_is_internal_app_origin()))
  );

drop policy if exists "allow internal app snapshot update" on public.aitask_app_state;
create policy "allow internal app snapshot update"
  on public.aitask_app_state
  for update
  to anon, authenticated
  using (
    id = 'default'
    and ((select auth.uid()) is not null or (select public.aitask_is_internal_app_origin()))
  )
  with check (
    id = 'default'
    and ((select auth.uid()) is not null or (select public.aitask_is_internal_app_origin()))
  );

create or replace function private.aitask_app_state_health()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $$
  with recursive walk(value) as (
    select state
    from public.aitask_app_state
    where id = 'default'

    union all

    select child.value
    from walk
    cross join lateral (
      select value
      from jsonb_each(
        case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
      )
      union all
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(walk.value) = 'array' then walk.value else '[]'::jsonb end
      )
    ) child
  ),
  forbidden_keys as (
    select distinct key
    from walk
    cross join lateral jsonb_each(
      case when jsonb_typeof(walk.value) = 'object' then walk.value else '{}'::jsonb end
    )
    where key ~* '(password|secret|token|api[_-]?key|service[_-]?role)'
  ),
  policy_rows as (
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'aitask_app_state'
  ),
  trigger_rows as (
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'aitask_app_state'
      and trigger_name = 'aitask_app_state_guard_before_write'
  )
  select jsonb_build_object(
    'policies', coalesce((select jsonb_agg(policyname order by policyname) from policy_rows), '[]'::jsonb),
    'demo_policies', coalesce((select jsonb_agg(policyname order by policyname) from policy_rows where policyname like 'allow demo snapshot%'), '[]'::jsonb),
    'has_guard_trigger', exists(select 1 from trigger_rows),
    'forbidden_keys', coalesce((select jsonb_agg(key order by key) from forbidden_keys), '[]'::jsonb),
    'contains_forbidden_keys', exists(select 1 from forbidden_keys)
  );
$$;

revoke all on function private.aitask_app_state_health() from public;
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.aitask_app_state_health() to anon, authenticated, service_role;

create or replace function public.aitask_app_state_health()
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'private'
as $$
  select private.aitask_app_state_health();
$$;

grant execute on function public.aitask_app_state_health() to anon, authenticated, service_role;
