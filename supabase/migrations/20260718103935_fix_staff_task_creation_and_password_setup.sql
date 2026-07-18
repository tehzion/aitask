-- Keep Staff company selection intentionally Admin-curated and finalize
-- first-login passwords without routing the identity change through bulk sync.

create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
      when 'Client' then project.client_key = private.aitask_member_client_key(p_workspace_id)
      when 'Staff' then
        project.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.parent_id = p_project_id
            and private.aitask_can_view_task(p_workspace_id, task.entity_id)
        )
        or (
          private.aitask_has_permission(p_workspace_id, 'createTasks')
          and (
            project.created_by is null
            or exists (
              select 1
              from public.aitask_members creator
              where creator.workspace_id = p_workspace_id
                and creator.id = project.created_by
                and (creator.role = 'Admin' or creator.is_super_admin)
            )
          )
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

revoke all on function private.aitask_can_view_project(text, text) from public, anon;
grant execute on function private.aitask_can_view_project(text, text) to authenticated;

create or replace function public.aitask_complete_password_setup(
  p_workspace_id text,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_requires_setup boolean;
  v_workspace_version bigint;
begin
  if (select auth.uid()) is null or p_command_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication is required.');
  end if;

  select member.id, member.must_reset_password
  into v_actor_id, v_requires_setup
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.auth_user_id = (select auth.uid())
  for update;

  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership was not found.');
  end if;

  if not v_requires_setup then
    select workspace.version into v_workspace_version
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id;

    return jsonb_build_object(
      'ok', true,
      'commandId', p_command_id,
      'workspaceVersion', coalesce(v_workspace_version, 1),
      'changed', false
    );
  end if;

  update public.aitask_members
  set must_reset_password = false
  where workspace_id = p_workspace_id
    and id = v_actor_id;

  update public.aitask_workspaces
  set version = version + 1,
      updated_at = now()
  where id = p_workspace_id
  returning version into v_workspace_version;

  insert into public.aitask_audit_events(
    workspace_id,
    actor_member_id,
    command_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    metadata
  ) values (
    p_workspace_id,
    v_actor_id,
    p_command_id,
    'password_setup_complete',
    'member',
    v_actor_id,
    array['must_reset_password'],
    '{}'::jsonb
  );

  return jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'changed', true
  );
end;
$$;

revoke all on function public.aitask_complete_password_setup(text, uuid) from public, anon;
grant execute on function public.aitask_complete_password_setup(text, uuid) to authenticated;
