-- Production applied 20261023120000_pm_hod_staff_assignment_state (recorded
-- as 20261023040256) before the repository file gained the HOD route-handoff
-- branch, so live private.aitask_can_mutate_entity rejects an HOD delegating
-- a task they own. Reinstate the repository definition as a forward change.
--
-- Production also carries stricter table and RPC grants than a clean replay
-- produces. Record them here so local replays match the live boundary.

CREATE OR REPLACE FUNCTION private.aitask_can_mutate_entity(p_workspace_id text, p_action text, p_entity_type text, p_entity_id text, p_parent_id text, p_old_data jsonb, p_new_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_project_id text := nullif(btrim(coalesce(p_new_data ->> 'projectId', p_parent_id, '')), '');
  v_client_key text := lower(btrim(coalesce(p_new_data ->> 'clientName', p_old_data ->> 'clientName', '')));
begin
  if p_action = 'insert' and p_entity_type = 'task' and v_role = 'Project Manager'
    and not private.aitask_is_super_admin(p_workspace_id) then
    if coalesce(p_new_data ->> 'createdBy', p_new_data ->> 'userId', '') <> v_member_id then
      return false;
    end if;
    if not private.aitask_task_project_link_is_valid(
      p_workspace_id,
      v_project_id,
      nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), ''),
      v_client_key
    ) or not private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data) then
      return false;
    end if;
    if v_project_id is not null then
      return private.aitask_project_manager_id_is_assigned(p_workspace_id, v_project_id, v_member_id);
    end if;
    return exists (
      select 1 from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.client_key = v_client_key
        and client.created_by = v_member_id
    );
  end if;
  -- HODs are represented as Staff by the historical member-role projection.
  -- Handle an explicit route handoff before the legacy edit gate so an HOD
  -- who currently owns the task can delegate it without gaining broad Staff
  -- mutation authority.
  if p_action = 'update' and p_entity_type = 'task'
    and private.aitask_is_hod(p_workspace_id)
    and (p_old_data ->> 'assignedTo' = v_member_id or p_old_data ->> 'responsibleHodId' = v_member_id)
    and (
      p_old_data ->> 'assignedTo' is distinct from p_new_data ->> 'assignedTo'
      or p_old_data ->> 'responsibleHodId' is distinct from p_new_data ->> 'responsibleHodId'
      or p_old_data ->> 'assignmentState' is distinct from p_new_data ->> 'assignmentState'
    ) then
    return private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);
  end if;
  if p_action = 'update' and p_entity_type = 'task'
    and private.aitask_is_hod(p_workspace_id) then
    if not private.aitask_hod_task_execution_patch_is_valid(p_workspace_id, p_old_data, p_new_data) then
      return false;
    end if;
    if (
      p_old_data ->> 'assignedTo' is distinct from p_new_data ->> 'assignedTo'
      or p_old_data ->> 'responsibleHodId' is distinct from p_new_data ->> 'responsibleHodId'
      or p_old_data ->> 'assignmentState' is distinct from p_new_data ->> 'assignmentState'
    ) then
      return private.aitask_task_assignment_is_valid(p_workspace_id, p_action, p_old_data, p_new_data);
    end if;
  end if;
  return private.aitask_can_mutate_entity_legacy(
    p_workspace_id, p_action, p_entity_type, p_entity_id, p_parent_id, p_old_data, p_new_data
  );
end;
$function$;

revoke select, insert, update, delete on public.aitask_entities from service_role;
revoke update, delete on public.aitask_feedback_submissions from service_role;
revoke delete on public.aitask_tutorial_feedback from authenticated;
revoke select, insert, update, delete on public.aitask_tutorial_feedback from service_role;
revoke insert, update, delete on public.aitask_workspaces from authenticated;
revoke select, insert, update, delete on public.aitask_workspaces from service_role;
revoke execute on function public.aitask_complete_password_setup(text, uuid) from service_role;
revoke execute on function public.aitask_execute_payment_command(text, uuid, text, jsonb, bigint) from service_role;
revoke execute on function public.aitask_reconcile_service_upload(text, uuid, text, boolean) from service_role;
