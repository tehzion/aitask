-- A Project Manager may hand a company they own to another Project Manager
-- (owner decision, 29 Oct 2026: Boss-owned companies went to Ting Ting, who
-- passes some on to Jing Yi). Boss Koo can still assign any owner.
--
-- Ownership changes were rejected for everyone but Boss Koo in two places:
-- the service command and the company ownership guard trigger. Both now also
-- accept a handover by the current owner to another non-admin Project Manager.
-- The functions are patched in place (each anchor must match exactly once) so
-- the rest of their definitions, grants and settings stay byte-identical.

create or replace function private.aitask_can_hand_over_client(
  p_workspace_id text,
  p_old_owner text,
  p_new_owner text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_member_role(p_workspace_id) = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id)
    and nullif(btrim(coalesce(p_old_owner, '')), '') = private.aitask_member_id(p_workspace_id)
    and nullif(btrim(coalesce(p_new_owner, '')), '') is not null
    and p_new_owner <> p_old_owner
    and exists (
      select 1
      from public.aitask_members member
      where member.workspace_id = p_workspace_id
        and member.id = p_new_owner
        and member.role = 'Project Manager'
        and not coalesce(member.is_super_admin, false)
    );
$$;

revoke all on function private.aitask_can_hand_over_client(text, text, text) from public, anon, authenticated;

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_command_old constant text := 'and coalesce(v_new ->> ''createdBy'', v_old ->> ''createdBy'','''') is distinct from coalesce(v_old ->> ''createdBy'','''') then';
  v_command_new constant text := 'and coalesce(v_new ->> ''createdBy'', v_old ->> ''createdBy'','''') is distinct from coalesce(v_old ->> ''createdBy'','''')
      and not private.aitask_can_hand_over_client(p_workspace_id, v_old ->> ''createdBy'', v_new ->> ''createdBy'') then';
  v_guard_old constant text := 'and coalesce(v_new_creator, '''') is distinct from coalesce(v_old_creator, '''') then';
  v_guard_new constant text := 'and coalesce(v_new_creator, '''') is distinct from coalesce(v_old_creator, '''')
    and not private.aitask_can_hand_over_client(v_workspace, v_old_creator, v_new_creator) then';
begin
  foreach v_signature in array array[
    'public.aitask_execute_service_command(text,uuid,text,jsonb)'::regprocedure,
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if (length(v_definition) - length(replace(v_definition, v_command_old, ''))) / length(v_command_old) <> 1 then
      raise exception 'Company ownership anchor must occur exactly once in %', v_signature;
    end if;
    execute replace(v_definition, v_command_old, v_command_new);
  end loop;

  v_definition := pg_get_functiondef('private.aitask_guard_client_ownership_scope()'::regprocedure);
  if (length(v_definition) - length(replace(v_definition, v_guard_old, ''))) / length(v_guard_old) <> 1 then
    raise exception 'Company ownership guard anchor must occur exactly once';
  end if;
  execute replace(v_definition, v_guard_old, v_guard_new);
end;
$migration$;
