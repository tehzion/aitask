-- Pending applicant records contain personal contact details and are visible
-- only to the protected Super Admin identity.
alter policy "members can read scoped entities" on public.aitask_entities
  using (
    (entity_type = 'task' and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client' and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project' and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type in ('task_status', 'custom_role') and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'registration' and private.aitask_is_super_admin(workspace_id))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client' and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
  );
