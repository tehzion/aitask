-- Account-level acknowledgements for versioned product updates. Browser roles
-- never receive direct table access; the RPCs below resolve the current member
-- from auth.uid() and are the only supported access path.

create table if not exists public.aitask_release_notice_acknowledgements (
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  member_id text not null references public.aitask_members(id) on delete cascade,
  notice_id text not null check (char_length(notice_id) between 1 and 80),
  acknowledged_at timestamptz not null default now(),
  primary key (workspace_id, member_id, notice_id)
);

create index if not exists aitask_release_notice_acknowledgements_member_idx
  on public.aitask_release_notice_acknowledgements(member_id);

alter table public.aitask_release_notice_acknowledgements enable row level security;

revoke all on table public.aitask_release_notice_acknowledgements from public, anon, authenticated;
grant select, insert, update, delete on table public.aitask_release_notice_acknowledgements to service_role;

create or replace function public.aitask_get_release_notice_acknowledgement(
  p_workspace_id text,
  p_notice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id text;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication is required.');
  end if;
  if p_notice_id <> '2026-08-service-operations' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Unknown release notice.');
  end if;

  v_member_id := private.aitask_member_id(p_workspace_id);
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership is required.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'noticeId', p_notice_id,
    'acknowledged', exists (
      select 1
      from public.aitask_release_notice_acknowledgements acknowledgement
      where acknowledgement.workspace_id = p_workspace_id
        and acknowledgement.member_id = v_member_id
        and acknowledgement.notice_id = p_notice_id
    )
  );
end;
$$;

create or replace function public.aitask_acknowledge_release_notice(
  p_workspace_id text,
  p_notice_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id text;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication is required.');
  end if;
  if p_notice_id <> '2026-08-service-operations' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Unknown release notice.');
  end if;

  v_member_id := private.aitask_member_id(p_workspace_id);
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership is required.');
  end if;

  insert into public.aitask_release_notice_acknowledgements(workspace_id, member_id, notice_id)
  values (p_workspace_id, v_member_id, p_notice_id)
  on conflict (workspace_id, member_id, notice_id) do nothing;

  return jsonb_build_object('ok', true, 'noticeId', p_notice_id, 'acknowledged', true);
end;
$$;

revoke all on function public.aitask_get_release_notice_acknowledgement(text, text) from public, anon;
revoke all on function public.aitask_acknowledge_release_notice(text, text) from public, anon;
grant execute on function public.aitask_get_release_notice_acknowledgement(text, text) to authenticated, service_role;
grant execute on function public.aitask_acknowledge_release_notice(text, text) to authenticated, service_role;

-- Positive compatibility handshake used by the web client before enabling any
-- workspace mutations. A missing or older function leaves the app read-only.
create or replace function public.aitask_get_backend_capabilities(
  p_workspace_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text;
  v_workspace_optimistic_lock boolean;
  v_service_operations boolean;
  v_release_notice_acknowledgements boolean;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication is required.');
  end if;

  v_member_id := private.aitask_member_id(p_workspace_id);
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership is required.');
  end if;

  v_workspace_optimistic_lock :=
    pg_catalog.to_regprocedure('public.aitask_execute_command(text,uuid,text,jsonb)') is not null
    and pg_catalog.to_regprocedure('public.aitask_execute_command(text,uuid,text,jsonb,bigint)') is not null;
  v_service_operations :=
    pg_catalog.to_regprocedure('public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)') is not null
    and pg_catalog.to_regprocedure('public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)') is not null;
  v_release_notice_acknowledgements :=
    pg_catalog.to_regclass('public.aitask_release_notice_acknowledgements') is not null;

  return jsonb_build_object(
    'ok', v_workspace_optimistic_lock and v_service_operations and v_release_notice_acknowledgements,
    'schemaVersion', 2,
    'workspaceOptimisticLock', v_workspace_optimistic_lock,
    'serviceOperations', v_service_operations,
    'releaseNoticeAcknowledgements', v_release_notice_acknowledgements
  );
end;
$$;

revoke all on function public.aitask_get_backend_capabilities(text) from public, anon;
grant execute on function public.aitask_get_backend_capabilities(text) to authenticated, service_role;

notify pgrst, 'reload schema';
