-- Allow the 11 Nov 2026 product notice ("2026-11-start-wording") to be read
-- and acknowledged. It explains the Start / Running / month wording to the Boss,
-- project managers and clients. Earlier notices stay valid so saved
-- acknowledgements and older clients keep working. Only the notice ID check changes.

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
  if p_notice_id not in ('2026-08-service-operations', '2026-11-everyday-saves', '2026-11-start-wording') then
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
  if p_notice_id not in ('2026-08-service-operations', '2026-11-everyday-saves', '2026-11-start-wording') then
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

notify pgrst, 'reload schema';
