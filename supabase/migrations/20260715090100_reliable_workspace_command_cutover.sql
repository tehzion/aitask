-- Apply only after the v1.6.0 command frontend is live and verified.
-- The command RPC is SECURITY DEFINER and remains the only authenticated write path.

revoke insert, update, delete on public.aitask_members from authenticated;
revoke insert, update, delete on public.aitask_entities from authenticated;

revoke all on public.aitask_app_state from anon, authenticated;

drop policy if exists "allow internal app snapshot read" on public.aitask_app_state;
drop policy if exists "allow internal app snapshot update" on public.aitask_app_state;
drop policy if exists "allow internal app snapshot write" on public.aitask_app_state;
