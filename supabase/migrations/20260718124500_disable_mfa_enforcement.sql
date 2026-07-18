-- Temporarily remove MFA enforcement while preserving identity-based Admin authorization.

create or replace function private.aitask_is_admin(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select role = 'Admin' or is_super_admin
    from public.aitask_members
    where workspace_id = p_workspace_id
      and auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

drop policy if exists "mfa admins can read audit events" on public.aitask_audit_events;
drop policy if exists "admins can read audit events" on public.aitask_audit_events;
create policy "admins can read audit events" on public.aitask_audit_events
  for select to authenticated
  using (private.aitask_is_admin(workspace_id));
