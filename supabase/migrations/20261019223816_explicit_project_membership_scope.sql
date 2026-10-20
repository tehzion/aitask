-- Explicit project membership replaces the Project Manager's implicit
-- company-owner/creator portfolio. Boss Koo remains workspace-wide. Legacy
-- ownership and assignment relationships are backfilled once so existing work
-- stays reachable without leaving future access implicit.

-- This migration changes authorization helpers, persistent project JSON, and a
-- trigger. Check the exact central-command shape before any of those changes
-- occur, then run the entire migration in one transaction so a later failure
-- cannot leave a partial permission rollout behind.
begin;

do $preflight$
declare
  signature regprocedure := 'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  anchor text := 'coalesce(p_old_data ->> ''createdBy'', '''') = v_member_id';
  occurrences integer;
begin
  occurrences := (length(definition) - length(replace(definition, anchor, ''))) / length(anchor);
  if occurrences < 2 then
    raise exception 'Expected project create-owner checks were not found in aitask_can_mutate_entity.';
  end if;
end;
$preflight$;

create or replace function private.aitask_project_manager_id_is_assigned(
  p_workspace_id text,
  p_project_id text,
  p_member_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when project.data ? 'projectManagerIds'
        then jsonb_typeof(project.data -> 'projectManagerIds') = 'array'
          and project.data -> 'projectManagerIds' ? p_member_id
      else project.created_by = p_member_id
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
  ), false);
$$;

create or replace function private.aitask_project_manager_is_assigned(
  p_workspace_id text,
  p_project_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_project_manager_id_is_assigned(
    p_workspace_id, p_project_id, private.aitask_member_id(p_workspace_id)
  );
$$;

create or replace function private.aitask_hod_id_is_assigned(
  p_workspace_id text,
  p_project_id text,
  p_member_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when project.data ? 'hodMemberIds'
        then jsonb_typeof(project.data -> 'hodMemberIds') = 'array'
          and project.data -> 'hodMemberIds' ? p_member_id
      else project.created_by = p_member_id
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
  ), false);
$$;

create or replace function private.aitask_hod_is_assigned(
  p_workspace_id text,
  p_project_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_hod_id_is_assigned(
    p_workspace_id, p_project_id, private.aitask_member_id(p_workspace_id)
  );
$$;

revoke all on function private.aitask_project_manager_is_assigned(text,text) from public, anon, authenticated, service_role;
revoke all on function private.aitask_hod_is_assigned(text,text) from public, anon, authenticated, service_role;
revoke all on function private.aitask_project_manager_id_is_assigned(text,text,text) from public, anon, authenticated, service_role;
revoke all on function private.aitask_hod_id_is_assigned(text,text,text) from public, anon, authenticated, service_role;

create or replace function private.aitask_can_manage_project(
  p_workspace_id text,
  p_project_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when private.aitask_is_super_admin(p_workspace_id) then true
      when private.aitask_member_role(p_workspace_id) = 'Project Manager'
        then private.aitask_project_manager_is_assigned(p_workspace_id, project.entity_id)
      else project.created_by = private.aitask_member_id(p_workspace_id)
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
  ), false);
$$;

revoke all on function private.aitask_can_manage_project(text,text) from public, anon, authenticated, service_role;

-- Preserve current access as explicit assignments for every PM who had a
-- recorded project relationship: creator, owning company, or task author /
-- assignee. Assigning a project directly after rollout is Boss Koo-only.
with legacy_pm_assignments as (
  select project.workspace_id, project.entity_id as project_id, member.id as member_id
  from public.aitask_entities project
  join public.aitask_members member
    on member.workspace_id = project.workspace_id
   and member.role = 'Project Manager'
   and not member.is_super_admin
  where project.entity_type = 'project'
    and not (project.data ? 'projectManagerIds')
    and (
      project.created_by = member.id
      or exists (
        select 1 from public.aitask_entities client
        where client.workspace_id = project.workspace_id
          and client.entity_type = 'client'
          and client.client_key = project.client_key
          and client.created_by = member.id
      )
      or exists (
        select 1 from public.aitask_entities task
        where task.workspace_id = project.workspace_id
          and task.entity_type = 'task'
          and task.parent_id = project.entity_id
          and (task.created_by = member.id or task.assigned_to = member.id)
      )
    )
), folded_pm_assignments as (
  select workspace_id, project_id, jsonb_agg(to_jsonb(member_id) order by member_id) as ids
  from (select distinct workspace_id, project_id, member_id from legacy_pm_assignments) unique_ids
  group by workspace_id, project_id
)
update public.aitask_entities project
set data = jsonb_set(
      coalesce(project.data, '{}'::jsonb),
      '{projectManagerIds}',
      (
        select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
        from (
          select distinct value
          from jsonb_array_elements(
            (case when jsonb_typeof(project.data -> 'projectManagerIds') = 'array'
              then project.data -> 'projectManagerIds' else '[]'::jsonb end) || assignment.ids
          ) as membership(value)
          where jsonb_typeof(value) = 'string'
        ) normalized
      ),
      true
    ),
    updated_at = now(),
    version = project.version + 1
from folded_pm_assignments assignment
where project.workspace_id = assignment.workspace_id
  and project.entity_type = 'project'
  and project.entity_id = assignment.project_id;

-- Existing department-scoped HOD access is likewise captured as project
-- membership, allowing project-level visibility to become a reliable guard.
with legacy_hod_assignments as (
  select project.workspace_id, project.entity_id as project_id, member.id as member_id
  from public.aitask_entities project
  join public.aitask_members member
    on member.workspace_id = project.workspace_id
   and (member.role = 'HOD' or member.custom_role_id = 'builtin-hod')
  join public.aitask_entities task
    on task.workspace_id = project.workspace_id
   and task.entity_type = 'task'
   and task.parent_id = project.entity_id
  where project.entity_type = 'project'
    and not (project.data ? 'hodMemberIds')
    and (
      task.created_by = member.id
      or task.assigned_to = member.id
      or private.aitask_task_department(task.data ->> 'department') = any(coalesce(member.departments, array[]::text[]))
    )
), folded_hod_assignments as (
  select workspace_id, project_id, jsonb_agg(to_jsonb(member_id) order by member_id) as ids
  from (select distinct workspace_id, project_id, member_id from legacy_hod_assignments) unique_ids
  group by workspace_id, project_id
)
update public.aitask_entities project
set data = jsonb_set(
      coalesce(project.data, '{}'::jsonb),
      '{hodMemberIds}',
      (
        select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
        from (
          select distinct value
          from jsonb_array_elements(
            (case when jsonb_typeof(project.data -> 'hodMemberIds') = 'array'
              then project.data -> 'hodMemberIds' else '[]'::jsonb end) || assignment.ids
          ) as membership(value)
          where jsonb_typeof(value) = 'string'
        ) normalized
      ),
      true
    ),
    updated_at = now(),
    version = project.version + 1
from folded_hod_assignments assignment
where project.workspace_id = assignment.workspace_id
  and project.entity_type = 'project'
  and project.entity_id = assignment.project_id;

create index if not exists aitask_project_manager_membership_idx
  on public.aitask_entities using gin ((data -> 'projectManagerIds'))
  where entity_type = 'project';
create index if not exists aitask_hod_membership_idx
  on public.aitask_entities using gin ((data -> 'hodMemberIds'))
  where entity_type = 'project';

create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Project Manager' then
        private.aitask_is_super_admin(p_workspace_id)
        or private.aitask_project_manager_is_assigned(p_workspace_id, project.entity_id)
      when 'Client' then project.client_key = private.aitask_member_client_key(p_workspace_id)
      when 'Staff' then
        (
          private.aitask_is_hod(p_workspace_id)
          and private.aitask_hod_is_assigned(p_workspace_id, project.entity_id)
        )
        or (
          project.created_by = private.aitask_member_id(p_workspace_id)
          and (not private.aitask_is_hod(p_workspace_id) or not (project.data ? 'hodMemberIds')
            or private.aitask_hod_is_assigned(p_workspace_id, project.entity_id))
        )
        or exists (
          select 1
          from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and coalesce(nullif(btrim(task.data ->> 'projectId'), ''), task.parent_id) = p_project_id
            and private.aitask_can_view_task(p_workspace_id, task.entity_id)
        )
        or (
          not private.aitask_is_hod(p_workspace_id)
          and private.aitask_has_permission(p_workspace_id, 'createTasks')
          and (project.created_by is null or exists (
            select 1 from public.aitask_members creator
            where creator.workspace_id = p_workspace_id
              and creator.id = project.created_by
              and creator.is_super_admin
          ))
        )
      else false
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_view_task(p_workspace_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when private.aitask_is_super_admin(p_workspace_id) then true
      when private.aitask_member_role(p_workspace_id) = 'Project Manager' then
        case
          when nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is not null
            then private.aitask_can_view_project(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
          else task.assigned_to = private.aitask_member_id(p_workspace_id)
            or (nullif(btrim(task.assigned_to), '') is null and task.data ->> 'assignedBy' = private.aitask_member_id(p_workspace_id))
            or task.created_by = private.aitask_member_id(p_workspace_id)
            or exists (
              select 1 from public.aitask_entities client
              where client.workspace_id = p_workspace_id
                and client.entity_type = 'client'
                and client.client_key = task.client_key
                and client.created_by = private.aitask_member_id(p_workspace_id)
            )
        end
      when private.aitask_member_role(p_workspace_id) = 'Staff' then
        (
          (
            (not private.aitask_is_hod(p_workspace_id)
              and private.aitask_has_permission(p_workspace_id, 'viewAllTasks'))
            or task.assigned_to = private.aitask_member_id(p_workspace_id)
            or task.created_by = private.aitask_member_id(p_workspace_id)
            or (
              private.aitask_role_is_department_scoped(p_workspace_id)
              and private.aitask_task_department(task.data ->> 'department') = any(coalesce((
                select member.departments
                from public.aitask_members member
                where member.workspace_id = p_workspace_id
                  and member.auth_user_id = (select auth.uid())
              ), array[]::text[]))
            )
          )
          and (
            not private.aitask_is_hod(p_workspace_id)
            or nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
            or private.aitask_hod_is_assigned(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
          )
        )
      when private.aitask_member_role(p_workspace_id) = 'Client' then
        task.client_key = private.aitask_member_client_key(p_workspace_id)
      else false
    end
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_edit_task(p_workspace_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.aitask_is_super_admin(p_workspace_id)
      or (
        private.aitask_member_role(p_workspace_id) in ('Project Manager', 'Staff')
        and (
          task.assigned_to = private.aitask_member_id(p_workspace_id)
          or (nullif(btrim(task.assigned_to), '') is null and task.data ->> 'assignedBy' = private.aitask_member_id(p_workspace_id))
          or task.created_by = private.aitask_member_id(p_workspace_id)
        )
        and (
          private.aitask_member_role(p_workspace_id) <> 'Project Manager'
          or nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
          or private.aitask_can_view_project(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
        )
        and (
          not private.aitask_is_hod(p_workspace_id)
          or nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
          or private.aitask_hod_is_assigned(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
        )
      )
      or (
        private.aitask_member_role(p_workspace_id) = 'Project Manager'
        and nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
        and exists (
          select 1 from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = task.client_key
            and client.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
      or (
        private.aitask_member_role(p_workspace_id) = 'Project Manager'
        and nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is not null
        and private.aitask_can_view_project(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
      )
      or (
        private.aitask_role_is_department_scoped(p_workspace_id)
        and private.aitask_task_department(task.data ->> 'department') = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.auth_user_id = (select auth.uid())
        ), array[]::text[]))
        and (
          not private.aitask_is_hod(p_workspace_id)
          or nullif(btrim(coalesce(task.data ->> 'projectId', task.parent_id, '')), '') is null
          or private.aitask_hod_is_assigned(p_workspace_id, coalesce(task.data ->> 'projectId', task.parent_id))
        )
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

revoke all on function private.aitask_can_view_project(text,text) from public, anon, authenticated;
revoke all on function private.aitask_can_view_task(text,text) from public, anon, authenticated;
revoke all on function private.aitask_can_edit_task(text,text) from public, anon, authenticated;
grant execute on function private.aitask_can_view_project(text,text) to authenticated, service_role;
grant execute on function private.aitask_can_view_task(text,text) to authenticated, service_role;
grant execute on function private.aitask_can_edit_task(text,text) to authenticated, service_role;

-- Service records are attached to a company rather than an individual project.
-- PM access therefore requires an assigned project for that company, except
-- for a PM-owned company that has not yet received any project.
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
        from public.aitask_entities project
        join public.aitask_entities client
          on client.workspace_id = project.workspace_id
         and client.entity_type = 'client'
         and client.entity_id = p_client_id
        where project.workspace_id = p_workspace_id
          and project.entity_type = 'project'
          and (project.parent_id = p_client_id
            or (project.parent_id is null and project.client_key = client.client_key))
          and private.aitask_project_manager_is_assigned(p_workspace_id, project.entity_id)
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
          and (task.client_id = p_client_id
            or (task.client_id is null and task.client_key = client.client_key))
          and not exists (
            select 1
            from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and (project.parent_id = p_client_id
                or (project.parent_id is null and project.client_key = client.client_key))
          )
          and private.aitask_can_view_task(p_workspace_id, task.entity_id)
      )
      or exists (
        select 1
        from public.aitask_entities client
        where client.workspace_id = p_workspace_id
          and client.entity_type = 'client'
          and client.entity_id = p_client_id
          and client.created_by = private.aitask_member_id(p_workspace_id)
          and not exists (
            select 1
            from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and (project.parent_id = p_client_id
                or (project.parent_id is null and project.client_key = client.client_key))
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
revoke all on function private.aitask_can_access_service_client(text,text) from public, anon, authenticated;
grant execute on function private.aitask_can_access_service_client(text,text) to authenticated, service_role;

-- The review lane uses the same explicit project assignment boundary as task
-- reads. A creator/assignee relationship alone cannot grant cross-portfolio
-- PM approval or revision authority for a linked task.
create or replace function private.aitask_review_member_can_lead(p_workspace text,p_task jsonb,p_member text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.aitask_members member
    join auth.users auth_user on auth_user.id = member.auth_user_id
    where member.workspace_id = p_workspace
      and member.id = p_member
      and (auth_user.banned_until is null or auth_user.banned_until <= now())
      and (
        ((member.role = 'HOD' or (member.role = 'Staff' and member.custom_role_id = 'builtin-hod'))
          and private.aitask_task_department(p_task ->> 'department') = any(coalesce(member.departments, array[]::text[]))
          and (nullif(btrim(p_task ->> 'projectId'), '') is null
            or private.aitask_hod_id_is_assigned(p_workspace, p_task ->> 'projectId', member.id)))
        or (
          member.role = 'Project Manager'
          and (
            member.is_super_admin
            or (
              nullif(btrim(p_task ->> 'projectId'), '') is not null
              and private.aitask_project_manager_id_is_assigned(p_workspace, p_task ->> 'projectId', member.id)
            )
            or (
              nullif(btrim(p_task ->> 'projectId'), '') is null
              and (
                member.id in (p_task ->> 'createdBy', p_task ->> 'assignedTo')
                or (nullif(btrim(p_task ->> 'assignedTo'), '') is null and member.id = p_task ->> 'assignedBy')
                or exists (
                  select 1 from public.aitask_entities client
                  where client.workspace_id = p_workspace
                    and client.entity_type = 'client'
                    and client.created_by = member.id
                    and client.client_key = lower(btrim(p_task ->> 'clientName'))
                )
              )
            )
          )
        )
      )
  );
$$;
revoke all on function private.aitask_review_member_can_lead(text,jsonb,text) from public, anon, authenticated, service_role;

-- Project assignments are protected independently of the JSON command path.
-- A PM may manage HOD membership inside an assigned project, but only Boss Koo
-- may assign/remove PMs. Existing entity-history triggers record every change.
create or replace function private.aitask_guard_project_membership_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace text := coalesce(new.workspace_id, old.workspace_id);
  v_actor_id text := private.aitask_member_id(coalesce(new.workspace_id, old.workspace_id));
  v_actor_role text := private.aitask_member_role(coalesce(new.workspace_id, old.workspace_id));
  v_project_id text := coalesce(new.entity_id, old.entity_id);
  v_pm_ids jsonb;
  v_hod_ids jsonb;
  v_invalid boolean;
begin
  if (tg_op = 'INSERT' and new.entity_type <> 'project')
    or (tg_op = 'DELETE' and old.entity_type <> 'project')
    or (tg_op = 'UPDATE' and old.entity_type <> 'project' and new.entity_type <> 'project') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if (select auth.uid()) is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not private.aitask_is_super_admin(v_workspace)
      and not private.aitask_can_manage_project(v_workspace, v_project_id) then
      raise check_violation using message = 'This project is outside your assigned scope.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not private.aitask_is_super_admin(v_workspace)
      and (v_actor_role <> 'Project Manager' or coalesce(new.data ->> 'createdBy', '') <> v_actor_id) then
      raise check_violation using message = 'Only Boss Koo or a Project Manager creating their own project can add a project.';
    end if;
    v_pm_ids := coalesce(new.data -> 'projectManagerIds', '[]'::jsonb);
    if jsonb_typeof(v_pm_ids) <> 'array' then
      raise check_violation using message = 'Project Manager assignments must be a list.';
    end if;
    if not private.aitask_is_super_admin(v_workspace)
      and exists (select 1 from jsonb_array_elements_text(v_pm_ids) as assignment(member_id) where member_id <> v_actor_id) then
      raise check_violation using message = 'A Project Manager cannot assign a project to another Project Manager.';
    end if;
    if not private.aitask_is_super_admin(v_workspace) then
      new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{projectManagerIds}', jsonb_build_array(v_actor_id), true);
    end if;
    v_pm_ids := coalesce(new.data -> 'projectManagerIds', '[]'::jsonb);
    v_hod_ids := coalesce(new.data -> 'hodMemberIds', '[]'::jsonb);
  else
    if not private.aitask_is_super_admin(v_workspace)
      and not private.aitask_can_manage_project(v_workspace, v_project_id) then
      raise check_violation using message = 'This project is outside your assigned scope.';
    end if;
    if tg_op = 'UPDATE' then
      if not private.aitask_is_super_admin(v_workspace)
        and new.data -> 'projectManagerIds' is distinct from old.data -> 'projectManagerIds' then
        raise check_violation using message = 'Only Boss Koo can change Project Manager assignments.';
      end if;
      if new.data -> 'hodMemberIds' is distinct from old.data -> 'hodMemberIds'
        and not private.aitask_is_super_admin(v_workspace)
        and v_actor_role <> 'Project Manager' then
        raise check_violation using message = 'Only Boss Koo or an assigned Project Manager can change HOD project membership.';
      end if;
      v_pm_ids := coalesce(new.data -> 'projectManagerIds', '[]'::jsonb);
      v_hod_ids := coalesce(new.data -> 'hodMemberIds', '[]'::jsonb);
    end if;
  end if;

  if jsonb_typeof(v_pm_ids) <> 'array' or jsonb_typeof(v_hod_ids) <> 'array' then
    raise check_violation using message = 'Project membership assignments must be lists.';
  end if;
  select exists (
    select 1
    from jsonb_array_elements_text(v_pm_ids) assignment(member_id)
    left join public.aitask_members member
      on member.workspace_id = v_workspace and member.id = assignment.member_id
    left join auth.users auth_user on auth_user.id = member.auth_user_id
    where member.id is null or member.role <> 'Project Manager' or member.is_super_admin
      or auth_user.id is null or auth_user.banned_until > now()
  ) into v_invalid;
  if v_invalid then raise check_violation using message = 'Project Managers must be active non-Super-Admin Project Manager accounts.'; end if;

  select exists (
    select 1
    from jsonb_array_elements_text(v_hod_ids) assignment(member_id)
    left join public.aitask_members member
      on member.workspace_id = v_workspace and member.id = assignment.member_id
    left join auth.users auth_user on auth_user.id = member.auth_user_id
    where member.id is null or (member.role <> 'HOD' and member.custom_role_id <> 'builtin-hod')
      or auth_user.id is null or auth_user.banned_until > now()
  ) into v_invalid;
  if v_invalid then raise check_violation using message = 'Project department leads must be HOD accounts.'; end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.aitask_guard_project_membership_scope() from public, anon, authenticated, service_role;
drop trigger if exists aitask_guard_project_membership_scope on public.aitask_entities;
create trigger aitask_guard_project_membership_scope
  before insert or update or delete on public.aitask_entities
  execute function private.aitask_guard_project_membership_scope();

-- Use assignment-aware project access in the central command authorization as
-- well as the RLS read helpers. The equivalent preflight ran before any data or
-- permission change, while the current definition still has its known shape.
do $$
declare
  signature regprocedure := 'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  anchor text := 'coalesce(p_old_data ->> ''createdBy'', '''') = v_member_id';
  replacement text := 'private.aitask_can_manage_project(p_workspace_id, p_entity_id)';
begin
  definition := replace(definition, anchor, replacement);
  execute definition;
end;
$$;

-- Do not let a PM assign, remove, or reassign another PM by forging a secure
-- command payload. Reads and project mutations now share the same predicate.

commit;
