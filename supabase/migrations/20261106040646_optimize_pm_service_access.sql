-- Abort the migration if any existing member/client access decision changes.
create temporary table aitask_service_access_before (
  auth_user_id uuid, workspace_id text, client_id text, allowed boolean
) on commit drop;
do $verify$
declare
  actor record;
  original_sub text := current_setting('request.jwt.claim.sub', true);
begin
  for actor in select auth_user_id, workspace_id from public.aitask_members
    where auth_user_id is not null
  loop
    perform set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
    insert into aitask_service_access_before
      select actor.auth_user_id, c.workspace_id, c.entity_id,
        private.aitask_can_access_service_client(c.workspace_id, c.entity_id)
      from public.aitask_entities c
      where c.workspace_id = actor.workspace_id and c.entity_type = 'client';
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
end;
$verify$;

-- Avoid repeated identity lookups and project rescans during service-record RLS.
-- Preserve explicit membership, legacy creator fallback and orphan-client rules.
create or replace function private.aitask_can_access_service_client(p_workspace_id text, p_client_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text;
  v_client_key text;
  v_created_by text;
  v_has_project boolean;
  v_assigned boolean;
begin
  if private.aitask_is_super_admin(p_workspace_id) then return true; end if;
  if private.aitask_member_role(p_workspace_id) = 'Project Manager' then
    v_member_id := private.aitask_member_id(p_workspace_id);
    select client.client_key, client.created_by into v_client_key, v_created_by
    from public.aitask_entities client
    where client.workspace_id = p_workspace_id
      and client.entity_type = 'client' and client.entity_id = p_client_id;
    if not found then return false; end if;

    select count(*) > 0, coalesce(bool_or(case
      when project.data ? 'projectManagerIds' then
        jsonb_typeof(project.data -> 'projectManagerIds') = 'array'
        and project.data -> 'projectManagerIds' ? v_member_id
      else project.created_by = v_member_id
    end), false)
    into v_has_project, v_assigned
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id and project.entity_type = 'project'
      and (project.parent_id = p_client_id
        or (project.parent_id is null and project.client_key = v_client_key));

    -- A linked project makes its membership authoritative, even for the creator.
    if v_has_project then return v_assigned; end if;
    if v_created_by = v_member_id then return true; end if;
    return exists (
      select 1 from public.aitask_entities task
      where task.workspace_id = p_workspace_id and task.entity_type = 'task'
        and (task.client_id = p_client_id
          or (task.client_id is null and task.client_key = v_client_key))
        and private.aitask_can_view_task(p_workspace_id, task.entity_id)
    );
  end if;
  return coalesce(
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
      );
end;
$$;

do $verify$
declare
  actor record;
  original_sub text := current_setting('request.jwt.claim.sub', true);
begin
  for actor in select distinct auth_user_id from aitask_service_access_before loop
    perform set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
    if exists (
      select 1 from aitask_service_access_before b
      where b.auth_user_id = actor.auth_user_id
        and b.allowed is distinct from private.aitask_can_access_service_client(b.workspace_id, b.client_id)
    ) then
      raise exception 'Service access optimization changed an existing access decision';
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
end;
$verify$;
