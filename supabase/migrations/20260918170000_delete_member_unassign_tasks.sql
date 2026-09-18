-- Fix: deleting a member unassigns their tasks instead of failing.
-- The confirmation dialog already promises "their assigned tasks will become
-- unassigned", and the local/demo store does the same. Clear the JSON
-- assignedTo field so the aitask_guard_entity trigger mirrors it onto the
-- assigned_to column.

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
  if not found then raise exception 'Member not found'; end if;
  if v_target.id = v_actor.id or v_target.is_super_admin then raise exception 'Protected member cannot be deleted'; end if;

  update public.aitask_entities
  set data = jsonb_set(data, '{assignedTo}', '""'::jsonb, true),
      updated_at = now()
  where workspace_id = v_actor.workspace_id
    and entity_type = 'task'
    and assigned_to = v_target.id;
  get diagnostics v_unassigned = row_count;

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
