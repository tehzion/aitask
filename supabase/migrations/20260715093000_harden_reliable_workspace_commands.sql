-- Tighten the additive v1.6 command foundation before frontend cutover.

drop policy if exists "mfa admins can read audit events" on public.aitask_audit_events;
create policy "mfa admins can read audit events" on public.aitask_audit_events
  for select to authenticated
  using (
    private.aitask_is_admin(workspace_id)
    and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
  );

create or replace function private.aitask_guard_member_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  v_actor_member_id := private.aitask_member_id(old.workspace_id);
  if private.aitask_is_admin(old.workspace_id) then
    return new;
  end if;

  if v_actor_member_id is null or v_actor_member_id <> old.id then
    raise check_violation using message = 'Only administrators can manage another member.';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.auth_user_id is distinct from old.auth_user_id
    or new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.client_name is distinct from old.client_name
    or new.is_super_admin is distinct from old.is_super_admin
    or new.custom_role_id is distinct from old.custom_role_id
    or new.custom_role_name is distinct from old.custom_role_name
    or new.permissions is distinct from old.permissions
    or (new.must_reset_password and not old.must_reset_password) then
    raise check_violation using message = 'Member security fields require administrator access.';
  end if;

  return new;
end;
$$;

drop trigger if exists aitask_guard_member_security on public.aitask_members;
create trigger aitask_guard_member_security
  before update on public.aitask_members
  for each row execute function private.aitask_guard_member_security();

revoke all on function private.aitask_guard_member_security() from public;
