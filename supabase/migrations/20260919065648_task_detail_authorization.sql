-- Keep task-detail reads and mutations on one target-aware authorization
-- contract. PM portfolio visibility is intentionally read-only unless the
-- task is assigned to or created by the PM; HOD department scope remains
-- editable, while ordinary Staff remain assignment/creator scoped. Creator
-- access is a task relationship, not an optional permission: permissions only
-- control extra capabilities such as delegation.

create or replace function private.aitask_can_view_task(
  p_workspace_id text,
  p_task_id text
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
      when private.aitask_member_role(p_workspace_id) = 'Project Manager' then
        task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = task.client_key
            and client.created_by = private.aitask_member_id(p_workspace_id)
        )
        or exists (
          select 1
          from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = task.parent_id
            and project.created_by = private.aitask_member_id(p_workspace_id)
        )
      when private.aitask_member_role(p_workspace_id) = 'Staff' then
        (
          not private.aitask_is_hod(p_workspace_id)
          and private.aitask_has_permission(p_workspace_id, 'viewAllTasks')
        )
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
        or (
          private.aitask_role_is_department_scoped(p_workspace_id)
          and coalesce(task.data ->> 'department', '') = any(coalesce((
            select member.departments
            from public.aitask_members member
            where member.workspace_id = p_workspace_id
              and member.auth_user_id = (select auth.uid())
          ), array[]::text[]))
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

create or replace function private.aitask_can_edit_task(
  p_workspace_id text,
  p_task_id text
)
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
          or task.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
      or (
        private.aitask_role_is_department_scoped(p_workspace_id)
        and coalesce(task.data ->> 'department', '') = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.auth_user_id = (select auth.uid())
        ), array[]::text[]))
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

revoke all on function private.aitask_can_view_task(text, text) from public, anon, authenticated;
revoke all on function private.aitask_can_edit_task(text, text) from public, anon, authenticated;
grant execute on function private.aitask_can_view_task(text, text) to authenticated, service_role;
grant execute on function private.aitask_can_edit_task(text, text) to authenticated, service_role;

create or replace function private.aitask_can_comment_task(
  p_workspace_id text,
  p_task_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.aitask_can_edit_task(p_workspace_id, p_task_id)
    or (
      private.aitask_member_role(p_workspace_id) = 'Client'
      and private.aitask_can_view_task(p_workspace_id, p_task_id)
      and current_setting('aitask.command_type', true) = 'comment.add'
      and current_setting('aitask.client_command_allowed', true) = 'true'
    ),
    false
  );
$$;

revoke all on function private.aitask_can_comment_task(text, text) from public, anon, authenticated;
grant execute on function private.aitask_can_comment_task(text, text) to authenticated, service_role;

-- The generic secure command path is also used by legacy-compatible clients.
-- Internal comments and approvals must require task edit access; Client
-- feedback remains authorized only by the trusted Client command preflight.
do $$
declare
  definition text;
  original text;
begin
  select pg_get_functiondef(
    'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure
  ) into definition;
  original := definition;
  definition := replace(
    definition,
    E'v_creator = v_member_id and private.aitask_can_view_task(p_workspace_id, p_parent_id)\n        and (v_role <> ''Client'' or v_client_command_allowed)',
    E'v_creator = v_member_id\n        and (\n          (v_role <> ''Client'' and private.aitask_can_edit_task(p_workspace_id, p_parent_id))\n          or (v_role = ''Client'' and v_client_command_allowed)\n        )'
  );
  if definition = original then
    raise exception 'Task comment authorization predicate was not found.';
  end if;
  execute definition;
end;
$$;

-- Direct table DML is defense in depth. The secure command path remains the
-- normal write interface, but RLS must not offer a broader task/comment path.
drop policy if exists "members can insert authorized entities" on public.aitask_entities;
create policy "members can insert authorized entities" on public.aitask_entities
  for insert to authenticated
  with check (private.aitask_can_mutate_entity(
    workspace_id, 'insert', entity_type, entity_id, parent_id, '{}'::jsonb, data
  ));

drop policy if exists "members can update authorized entities" on public.aitask_entities;
create policy "members can update authorized entities" on public.aitask_entities
  for update to authenticated
  using (private.aitask_can_mutate_entity(
    workspace_id, 'update', entity_type, entity_id, parent_id, data, data
  ))
  with check (private.aitask_can_mutate_entity(
    workspace_id, 'update', entity_type, entity_id, parent_id, data, data
  ));

drop policy if exists "members can delete authorized entities" on public.aitask_entities;
create policy "members can delete authorized entities" on public.aitask_entities
  for delete to authenticated
  using (private.aitask_can_mutate_entity(
    workspace_id, 'delete', entity_type, entity_id, parent_id, data, '{}'::jsonb
  ));
