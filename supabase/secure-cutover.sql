-- Apply only after the Supabase Auth frontend has been deployed and verified.
-- Retain the snapshot as a service-role-only rollback source for seven days.

drop policy if exists "allow internal app snapshot read" on public.aitask_app_state;
drop policy if exists "allow internal app snapshot write" on public.aitask_app_state;
drop policy if exists "allow internal app snapshot update" on public.aitask_app_state;
drop policy if exists "allow demo snapshot read" on public.aitask_app_state;
drop policy if exists "allow demo snapshot write" on public.aitask_app_state;
drop policy if exists "allow demo snapshot update" on public.aitask_app_state;

revoke all on public.aitask_app_state from anon, authenticated;
revoke execute on function public.aitask_is_internal_app_origin() from anon, authenticated;
revoke execute on function public.aitask_app_state_health() from anon, authenticated;
revoke usage on schema private from anon;
revoke execute on function private.aitask_app_state_health() from anon, authenticated;

grant select, insert, update, delete, truncate, references, trigger
  on public.aitask_app_state to service_role;
