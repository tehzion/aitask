-- Project Manager company scope and ownership hardening.
--
-- 1. `aitask_execute_service_command` accepted a `client` operation under the
--    generic `manageClientPlans` capability without binding the target company
--    to the caller's portfolio. Because the RPC is SECURITY DEFINER and
--    `aitask_entities` has no FORCE ROW LEVEL SECURITY, RLS did not apply, and
--    the PM service guard trigger deliberately excluded `client` (so atomic
--    new-company creation keeps working). An authenticated PM could therefore
--    rename, edit, re-own, or delete ANY company. Add an explicit scope check
--    for update/delete (and a create check for insert) inside both overloads.
-- 2. Company ownership is transferable only by Boss Koo. Nothing guarded
--    `data->>'createdBy'` on a client update, so a task-derived PM could seize
--    a foreign portfolio. A BEFORE UPDATE/DELETE trigger now freezes the
--    owner and blocks foreign PM update/delete. Inserts are intentionally not
--    guarded so atomic company+plan creation continues to work.
-- 3. `createClients` / `deleteClients` overrides are now authoritative for a
--    Project Manager instead of being short-circuited by `aitask_is_admin`.
-- 4. The service-client helper prefers the canonical `client_id` / project
--    parent id so a duplicate company name cannot smuggle a foreign task or
--    project into scope.

-- 1. Service command: bind `client` operations to the caller's portfolio. -----
do $$
declare
  signature text;
  definition text;
  original text;
  anchor text := $anchor$v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');$anchor$;
  addition text := $addition$v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');
    if v_type = 'client' and not private.aitask_is_super_admin(p_workspace_id) then
      if v_action = 'insert' and not private.aitask_can_create_client(p_workspace_id) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Client creation is not permitted.');
      elsif v_action = 'update'
        and not private.aitask_can_edit_client(p_workspace_id, lower(btrim(coalesce(v_old ->> 'clientName','')))) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This company is outside your portfolio.');
      elsif v_action = 'delete' and (
        not private.aitask_can_delete_client(p_workspace_id)
        or not private.aitask_can_edit_client(p_workspace_id, lower(btrim(coalesce(v_old ->> 'clientName',''))))
      ) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This company is outside your portfolio.');
      end if;
    end if;
    if v_type = 'client' and v_action = 'update' and not private.aitask_is_super_admin(p_workspace_id)
      and coalesce(v_new ->> 'createdBy', v_old ->> 'createdBy','') is distinct from coalesce(v_old ->> 'createdBy','') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Company ownership cannot be changed.');
    end if;$addition$;
begin
  foreach signature in array array[
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)',
    'public.aitask_execute_service_command(text,uuid,text,jsonb)'
  ]
  loop
    if to_regprocedure(signature) is null then continue; end if;
    definition := pg_get_functiondef(signature::regprocedure);
    original := definition;
    definition := replace(definition, anchor, addition);
    if definition = original then
      raise exception 'Service command client anchor was not found in %.', signature;
    end if;
    execute definition;
  end loop;
end;
$$;

-- 2. Freeze company ownership at the table for every mutation path. -----------
create or replace function private.aitask_guard_client_ownership_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace text := coalesce(new.workspace_id, old.workspace_id);
  v_actor text := private.aitask_member_id(coalesce(new.workspace_id, old.workspace_id));
  v_role text := private.aitask_member_role(coalesce(new.workspace_id, old.workspace_id));
  v_old_creator text := coalesce(old.data ->> 'createdBy', old.data ->> 'userId');
  v_new_creator text := coalesce(new.data ->> 'createdBy', new.data ->> 'userId');
begin
  if (select auth.uid()) is null or private.aitask_is_super_admin(v_workspace) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and coalesce(v_new_creator, '') is distinct from coalesce(v_old_creator, '') then
    raise check_violation using message = 'Company ownership cannot be changed';
  end if;

  if v_role = 'Project Manager' then
    if tg_op = 'UPDATE'
      and not private.aitask_can_edit_client(v_workspace, lower(btrim(coalesce(old.data ->> 'clientName', '')))) then
      raise check_violation using message = 'This company is outside your portfolio';
    elsif tg_op = 'DELETE' and coalesce(v_old_creator, '') <> v_actor then
      raise check_violation using message = 'This company is outside your portfolio';
    end if;
  elsif tg_op = 'DELETE'
    and not private.aitask_can_edit_client(v_workspace, lower(btrim(coalesce(old.data ->> 'clientName', '')))) then
    -- Department-scoped Staff/HOD may only delete a company they can edit,
    -- matching the frontend, rather than any company they can merely view.
    raise check_violation using message = 'This company is outside your portfolio';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_client_ownership_scope() from public, anon, authenticated;

drop trigger if exists aitask_guard_client_ownership on public.aitask_entities;
create trigger aitask_guard_client_ownership
  before update or delete on public.aitask_entities
  for each row when (old.entity_type = 'client')
  execute function private.aitask_guard_client_ownership_scope();

-- 3. createClients / deleteClients become authoritative for Project Managers. -
create or replace function private.aitask_can_create_client(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_is_super_admin(p_workspace_id)
    or private.aitask_has_permission(p_workspace_id, 'createClients');
$$;

create or replace function private.aitask_can_delete_client(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_is_super_admin(p_workspace_id)
    or private.aitask_has_permission(p_workspace_id, 'deleteClients');
$$;

revoke all on function private.aitask_can_create_client(text) from public, anon, authenticated;
revoke all on function private.aitask_can_delete_client(text) from public, anon, authenticated;

-- 4. Service-client access prefers canonical ids over duplicate names. ---------
create or replace function private.aitask_can_access_service_client(p_workspace_id text, p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.aitask_is_super_admin(p_workspace_id) then true
    when private.aitask_member_role(p_workspace_id) = 'Project Manager' then
      exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.entity_id = p_client_id
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
      or exists (
        select 1
        from public.aitask_entities task
        join public.aitask_entities client
          on client.workspace_id = task.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where task.workspace_id = p_workspace_id
          and task.entity_type = 'task'
          and (
            task.client_id = p_client_id
            or (task.client_id is null and task.client_key = client.client_key)
          )
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
      or exists (
        select 1
        from public.aitask_entities project
        join public.aitask_entities client
          on client.workspace_id = project.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where project.workspace_id = p_workspace_id
          and project.entity_type = 'project'
          and project.created_by = private.aitask_member_id(p_workspace_id)
          and (
            project.parent_id = p_client_id
            or (project.parent_id is null and project.client_key = client.client_key)
          )
      )
    else
      coalesce(
        private.aitask_has_permission(p_workspace_id, 'viewAllServiceClients')
        or private.aitask_has_permission(p_workspace_id, 'manageClientPlans')
        or private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')
        or exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.entity_id = p_client_id
            and client.client_key = private.aitask_member_client_key(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Client'
        )
        or exists (
          select 1 from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.client_id = p_client_id
            and task.assigned_to = private.aitask_member_id(p_workspace_id)
            and private.aitask_member_role(p_workspace_id) = 'Staff'
            and private.aitask_has_permission(p_workspace_id, 'viewAssignedServiceClients')
        ), false
      )
  end;
$$;
revoke all on function private.aitask_can_access_service_client(text, text) from public, anon;
grant execute on function private.aitask_can_access_service_client(text, text) to authenticated, service_role;
