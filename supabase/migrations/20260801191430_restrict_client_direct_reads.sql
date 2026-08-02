-- AiTask v1.6.15: require Clients to use the allowlisted portal projection.
-- Staff and Admin RLS behavior remains unchanged.

alter policy "members can read scoped entities" on public.aitask_entities
  using (
    (entity_type = 'task'
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client'
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project'
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type = 'task_status' and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'custom_role' and (
      private.aitask_member_role(workspace_id) <> 'Client'
      or exists (
        select 1
        from public.aitask_members member
        where member.workspace_id = aitask_entities.workspace_id
          and member.auth_user_id = (select auth.uid())
          and member.custom_role_id = aitask_entities.entity_id
      )
    ))
    or (entity_type = 'registration' and private.aitask_is_super_admin(workspace_id))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client'
        and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
  );

alter policy "workspace members can read directory" on public.aitask_members
  using (
    auth_user_id = (select auth.uid())
    or (
      private.aitask_member_id(workspace_id) is not null
      and private.aitask_member_role(workspace_id) <> 'Client'
    )
  );
