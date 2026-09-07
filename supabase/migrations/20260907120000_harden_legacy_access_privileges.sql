-- v2.1.5: remove retired anonymous helpers and privilege residue after the
-- secure workspace cutover. Application writes continue through protected RPCs
-- and Edge Functions; authenticated clients retain only the table privileges
-- required for read projections and existing RPC-backed workflows.

revoke all on function public.aitask_is_internal_app_origin() from public, anon, authenticated;
revoke all on function public.aitask_app_state_health() from public, anon, authenticated;
revoke all on function private.aitask_app_state_health() from public, anon, authenticated;
revoke usage on schema private from anon;

-- No authenticated browser path requires these table-level capabilities. The
-- application command API and service functions run through explicit grants.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- These tables are already RPC/service-role managed. Repeat the revocation in
-- the forward migration so production converges even if an older grant was
-- restored manually after the original cutover.
revoke insert, update, delete, truncate, trigger, references
  on public.aitask_members, public.aitask_entities
  from authenticated;
revoke all on public.aitask_app_state from anon, authenticated;
revoke all on public.aitask_command_receipts, public.aitask_release_notice_acknowledgements
  from authenticated;

-- Keep the intended read surface explicit for the authenticated client.
grant select on public.aitask_workspaces, public.aitask_members, public.aitask_entities
  to authenticated;
grant select on public.aitask_audit_events to authenticated;

-- Do not allow direct member/custom-role payloads to reintroduce permissions
-- that are intentionally absent from the custom-role editor. The command and
-- invitation paths still enforce Boss Koo-only administration independently.
create or replace function private.aitask_guard_custom_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_key text;
  permissions jsonb := coalesce(new.data -> 'permissions', '{}'::jsonb);
begin
  foreach protected_key in array array[
    'editTasks', 'manageUsers', 'approveRegistrations',
    'deleteUsers', 'viewProductionReports'
  ] loop
    if permissions ->> protected_key = 'true' then
      raise check_violation using message = 'Protected custom-role permissions are reserved for Boss Koo.';
    end if;
  end loop;
  if new.entity_id = 'system-hod' and (
    coalesce(new.data ->> 'baseRole', '') <> 'Staff'
    or coalesce(new.data ->> 'name', '') <> 'HOD'
    or coalesce((new.data ->> 'isProtected')::boolean, false) is not true
    or coalesce(permissions ->> 'manageCreatedTasks', 'false') <> 'true'
  ) then
    raise check_violation using message = 'The protected HOD role cannot be changed.';
  end if;
  return new;
end;
$$;

create or replace function private.aitask_guard_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_key text;
begin
  foreach protected_key in array array[
    'editTasks', 'manageUsers', 'approveRegistrations',
    'deleteUsers', 'viewProductionReports'
  ] loop
    if new.permissions ->> protected_key = 'true' then
      raise check_violation using message = 'Protected member permissions are reserved for Boss Koo.';
    end if;
  end loop;
  if new.custom_role_id is null then return new; end if;
  if not exists (
    select 1
    from public.aitask_entities entity
    where entity.workspace_id = new.workspace_id
      and entity.entity_type = 'custom_role'
      and entity.entity_id = new.custom_role_id
      and entity.data ->> 'baseRole' = new.role
  ) then
    raise check_violation using message = 'Custom role base role must match the member role.';
  end if;
  return new;
end;
$$;
