-- Member deletion recovery.
--
-- The Edge function removes the Auth identity before the member row. A lost
-- response after the row was deleted must therefore be idempotent, and the
-- task cleanup must clear every assignment/ownership reference that pointed at
-- the removed member, not only assignedTo.
create or replace function public.aitask_delete_member_account(
  p_actor_member_id text,
  p_member_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_target public.aitask_members%rowtype;
  v_command_id uuid := gen_random_uuid();
  v_workspace_version bigint;
  v_unassigned integer := 0;
begin
  select member.* into v_actor
  from public.aitask_members member
  where member.id = p_actor_member_id and member.is_super_admin = true
  for update;
  if not found then raise exception 'Super Admin permission required'; end if;

  select member.* into v_target
  from public.aitask_members member
  where member.workspace_id = v_actor.workspace_id and member.id = p_member_id
  for update;
  if not found then
    if exists (
      select 1
      from public.aitask_audit_events event
      where event.workspace_id = v_actor.workspace_id
        and event.action = 'account.delete'
        and event.entity_type = 'member'
        and event.entity_id = p_member_id
    ) then
      select version into v_workspace_version
      from public.aitask_workspaces
      where id = v_actor.workspace_id;
      return jsonb_build_object(
        'ok', true,
        'alreadyDeleted', true,
        'workspaceVersion', coalesce(v_workspace_version, 1),
        'unassignedTasks', 0
      );
    end if;
    raise exception 'Member not found';
  end if;
  if v_target.id = v_actor.id or v_target.is_super_admin then raise exception 'Protected member cannot be deleted'; end if;

  select count(*) into v_unassigned
  from public.aitask_entities task
  where task.workspace_id = v_actor.workspace_id
    and task.entity_type = 'task'
    and task.assigned_to = v_target.id;

  update public.aitask_entities
  set data = (
        data
          || case when data ->> 'assignedTo' = v_target.id
            then jsonb_build_object('assignedTo', '') else '{}'::jsonb end
          || case when data ->> 'assignedBy' = v_target.id
            then jsonb_build_object('assignedBy', '') else '{}'::jsonb end
          || case when data ->> 'assignedTo' = v_target.id
            then jsonb_build_object('assignedAt', '') else '{}'::jsonb end
          || case when data ->> 'responsibleHodId' = v_target.id
            then jsonb_build_object('responsibleHodId', '') else '{}'::jsonb end
          || case when data ->> 'accountableLeadId' = v_target.id
            then jsonb_build_object('accountableLeadId', '') else '{}'::jsonb end
      ) - case when data ->> 'assignedTo' = v_target.id
          or data ->> 'responsibleHodId' = v_target.id
          or data ->> 'accountableLeadId' = v_target.id
        then 'assignmentState' else '__aitask_keep_assignment_state__' end,
      updated_at = now()
  where workspace_id = v_actor.workspace_id
    and entity_type = 'task'
    and (
      assigned_to = v_target.id
      or data ->> 'assignedBy' = v_target.id
      or data ->> 'responsibleHodId' = v_target.id
      or data ->> 'accountableLeadId' = v_target.id
    );

  delete from public.aitask_members
  where workspace_id = v_actor.workspace_id and id = v_target.id;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
  ) values (v_actor.workspace_id, v_actor.id, v_command_id, 'account.delete', 'member', v_target.id, array['account']);

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = v_actor.workspace_id
  returning version into v_workspace_version;

  return jsonb_build_object('ok', true, 'workspaceVersion', v_workspace_version, 'unassignedTasks', v_unassigned);
end;
$$;

revoke all on function public.aitask_delete_member_account(text, text) from public, anon, authenticated;
grant execute on function public.aitask_delete_member_account(text, text) to service_role;
