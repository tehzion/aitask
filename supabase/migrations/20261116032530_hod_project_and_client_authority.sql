-- HOD project execution authority and id-first company edit authority.
--
-- 1. An HOD explicitly assigned to a project may update its execution details
--    (including milestones and the project name) and staff membership. Project
--    Manager/HOD membership, the company link, and creator attribution remain
--    protected by the command authorization branch added in
--    20261113090000_hod_project_management.sql. This migration aligns the
--    project membership trigger with that branch.
-- 2. A company created by a department lead can be maintained by that lead
--    without a separate manageAssignedClients grant.
-- 3. Client updates prefer the canonical client id over a duplicate name.
begin;

-- 1. Assigned HOD project updates -------------------------------------------
do $migration$
declare
  definition text;
  anchor text := $anchor$      or (v_role in('HOD','Staff') and old.created_by=v_actor)) then$anchor$;
  replacement text := $replacement$      or (private.aitask_is_hod(v_workspace) and private.aitask_hod_is_assigned(v_workspace, old.entity_id))
      or (v_role in('HOD','Staff') and old.created_by=v_actor)) then$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_guard_project_membership_scope()'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one project membership authority branch';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

-- 2. Department-lead-created companies are editable by their creator --------
do $migration$
declare
  definition text;
  anchor text := $anchor$    or (
      private.aitask_member_role(p_workspace_id) = 'Staff'
      and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')$anchor$;
  replacement text := $replacement$    or (
      private.aitask_is_hod(p_workspace_id)
      and exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.client_key = p_client_key
          and client.created_by = private.aitask_member_id(p_workspace_id)
      )
    )
    or (
      private.aitask_member_role(p_workspace_id) = 'Staff'
      and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_can_edit_client(text,text)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one department client edit branch';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

-- 3. Id-first company edit authority ---------------------------------------
create or replace function private.aitask_can_edit_client_id(
  p_workspace_id text,
  p_client_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.aitask_is_super_admin(p_workspace_id), false)
    or exists (
      select 1
      from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.entity_id = p_client_id
        and (
          (
            private.aitask_member_role(p_workspace_id) = 'Project Manager'
            and (
              client.created_by = private.aitask_member_id(p_workspace_id)
              or exists (
                select 1
                from public.aitask_entities task
                where task.workspace_id = p_workspace_id
                  and task.entity_type = 'task'
                  and (task.client_id = p_client_id or (task.client_id is null and task.client_key = client.client_key))
                  and (
                    task.created_by = private.aitask_member_id(p_workspace_id)
                    or task.assigned_to = private.aitask_member_id(p_workspace_id)
                  )
              )
            )
          )
          or (
            private.aitask_is_hod(p_workspace_id)
            and client.created_by = private.aitask_member_id(p_workspace_id)
          )
          or (
            private.aitask_member_role(p_workspace_id) = 'Staff'
            and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')
            and exists (
              select 1
              from public.aitask_entities task
              where task.workspace_id = p_workspace_id
                and task.entity_type = 'task'
                and task.client_id = p_client_id
                and task.assigned_to = private.aitask_member_id(p_workspace_id)
            )
          )
        )
    );
$$;
revoke all on function private.aitask_can_edit_client_id(text,text) from public, anon, authenticated, service_role;

-- The historical mutator authorizes a company update by the old client key.
-- Keep that check, but require the exact record for a Project Manager so a
-- duplicate display name cannot widen authority onto another owner's company.
do $migration$
declare
  definition text;
  anchor text := $anchor$    when p_entity_type = 'client' then private.aitask_can_edit_client(p_workspace_id, v_old_client_key)$anchor$;
  replacement text := $replacement$    when p_entity_type = 'client' then
      private.aitask_can_edit_client(p_workspace_id, v_old_client_key)
      and (v_role <> 'Project Manager' or private.aitask_can_edit_client_id(p_workspace_id, p_entity_id))$replacement$;
begin
  definition := pg_get_functiondef('private.aitask_can_mutate_entity_legacy(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one legacy client mutation branch';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;

commit;
