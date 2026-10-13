-- Customer approval records acceptance; PM final confirmation closes the task.
-- Accept legacy client payloads but normalize their former 100% completion to 80%.
create or replace function private.aitask_client_command_allowed(
  p_workspace_id text,
  p_command_type text,
  p_operations jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_client_key text := private.aitask_member_client_key(p_workspace_id);
  v_task_operation jsonb;
  v_child_operation jsonb;
  v_task_id text;
  v_old_task jsonb;
  v_new_task jsonb;
  v_child_data jsonb;
  v_review_status text;
  v_old_revision integer;
  v_old_completion integer;
begin
  if private.aitask_member_role(p_workspace_id) <> 'Client'
    or v_member_id is null
    or v_client_key = '' then
    return false;
  end if;

  if p_command_type = 'comment.add' then
    if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) <> 1 then
      return false;
    end if;
    v_child_operation := p_operations -> 0;
    if v_child_operation ->> 'kind' <> 'entity'
      or v_child_operation ->> 'action' <> 'insert'
      or v_child_operation ->> 'entityType' <> 'comment' then
      return false;
    end if;
    v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);
    v_task_id := coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId');
    select task.data into v_old_task
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = v_task_id;

    return v_old_task is not null
      and lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) = v_client_key
      and v_child_data ->> 'id' = v_child_operation ->> 'entityId'
      and v_child_data ->> 'taskId' = v_task_id
      and v_child_data ->> 'userId' = v_member_id
      and length(btrim(coalesce(v_child_data ->> 'text', ''))) between 1 and 2000;
  end if;

  if p_command_type <> 'approval.review'
    or jsonb_typeof(p_operations) <> 'array'
    or jsonb_array_length(p_operations) <> 2 then
    return false;
  end if;

  select value into v_task_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'update'
    and value ->> 'entityType' = 'task'
  limit 1;

  select value into v_child_operation
  from jsonb_array_elements(p_operations) item(value)
  where value ->> 'kind' = 'entity'
    and value ->> 'action' = 'insert'
    and value ->> 'entityType' = 'approval'
  limit 1;

  if v_task_operation is null or v_child_operation is null then return false; end if;
  v_task_id := v_task_operation ->> 'entityId';
  v_new_task := coalesce(v_task_operation -> 'data', '{}'::jsonb);
  v_child_data := coalesce(v_child_operation -> 'data', '{}'::jsonb);

  select task.data into v_old_task
  from public.aitask_entities task
  where task.workspace_id = p_workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;

  if v_old_task is null
    or jsonb_typeof(v_new_task) <> 'object'
    or lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) <> v_client_key
    or not (coalesce((v_old_task ->> 'isCompleted')::boolean, false) or v_old_task ->> 'status' = 'Approved')
    or coalesce(v_old_task ->> 'clientApprovalStatus', 'Pending') = 'Approved'
    or v_child_data ->> 'id' <> v_child_operation ->> 'entityId'
    or v_child_data ->> 'taskId' <> v_task_id
    or coalesce(nullif(v_child_operation ->> 'parentId', ''), v_child_data ->> 'taskId') <> v_task_id
    or v_child_data ->> 'userId' <> v_member_id
    or length(coalesce(v_child_data ->> 'note', '')) > 2000
    or coalesce(v_old_task ->> 'revisionCount', '0') !~ '^[0-9]+$'
    or coalesce(v_old_task ->> 'completionPercentage', '0') !~ '^[0-9]+$' then
    return false;
  end if;

  -- Public immutable fields may be omitted by a projected client, but any
  -- supplied value must match the canonical task.
  if exists (
    select 1
    from unnest(array[
      'id', 'clientName', 'projectId', 'projectName', 'serviceType', 'title',
      'description', 'assignedTo', 'startDate', 'dueDate', 'attachmentLink',
      'attachmentName', 'website', 'facebookPage'
    ]::text[]) key
    where v_new_task ? key and v_new_task -> key is distinct from v_old_task -> key
  ) then
    return false;
  end if;

  -- Legacy clients may still send hidden fields during the rollout. They are
  -- accepted only when unchanged; new or modified protected keys are rejected.
  if exists (
    select 1
    from jsonb_object_keys(v_new_task) key
    where key <> all(array[
      'id', 'clientName', 'projectId', 'projectName', 'serviceType', 'title',
      'description', 'assignedTo', 'startDate', 'dueDate', 'attachmentLink',
      'attachmentName', 'website', 'facebookPage', 'clientApprovalStatus',
      'status', 'isCompleted', 'completionPercentage', 'revisionCount', 'completedAt'
    ]::text[])
      and v_new_task -> key is distinct from v_old_task -> key
  ) then
    return false;
  end if;

  v_review_status := v_child_data ->> 'status';
  v_old_revision := coalesce((v_old_task ->> 'revisionCount')::integer, 0);
  v_old_completion := coalesce((v_old_task ->> 'completionPercentage')::integer, 0);

  if v_new_task ->> 'clientApprovalStatus' <> v_review_status then return false; end if;
  if v_review_status = 'Approved' then
    return ((v_new_task ->> 'status' = 'Approved'
        and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
        and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = 80)
        or (v_new_task ->> 'status' = 'Completed'
        and coalesce((v_new_task ->> 'isCompleted')::boolean, false)
        and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = 100))
      and coalesce((v_new_task ->> 'revisionCount')::integer, v_old_revision) = v_old_revision;
  end if;
  if v_review_status = 'Rejected' then
    return v_new_task ->> 'status' = 'In Progress'
      and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) in (50, least(v_old_completion, 90))
      and coalesce((v_new_task ->> 'revisionCount')::integer, v_old_revision + 1) = v_old_revision + 1;
  end if;
  return false;
exception
  when invalid_text_representation then return false;
end;
$$;

revoke all on function private.aitask_client_command_allowed(text, text, jsonb) from public, anon, authenticated;

create or replace function private.aitask_merge_client_approval_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entity_type = 'task'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true'
    and private.aitask_member_role(old.workspace_id) = 'Client' then
    new.data := old.data || jsonb_build_object(
      'clientApprovalStatus', new.data -> 'clientApprovalStatus',
      'status', case when new.data->>'clientApprovalStatus' = 'Approved' then to_jsonb('Approved'::text) else to_jsonb('In Progress'::text) end,
      'isCompleted', false,
      'completionPercentage', case when new.data->>'clientApprovalStatus' = 'Approved' then 80 else 50 end,
      'completedAt', 'null'::jsonb,
      'revisionCount', to_jsonb(case when new.data ->> 'clientApprovalStatus' = 'Rejected' then coalesce((old.data ->> 'revisionCount')::integer, 0) + 1 else coalesce((old.data ->> 'revisionCount')::integer, 0) end)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_merge_client_approval_task() from public, anon, authenticated;
-- Percentages and review permissions are authoritative even for cached clients.
create or replace function private.aitask_guard_task_stage_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_hod boolean := private.aitask_is_hod(new.workspace_id);
  v_boss boolean := private.aitask_is_super_admin(new.workspace_id);
  v_changed boolean := v_old->>'status' is distinct from new.data->>'status';
  v_percent integer;
begin
  if new.entity_type <> 'task' then return new; end if;
  if v_actor is not null and v_role <> 'Client' then
    if new.data->>'clientApprovalStatus'='Approved' and v_old->>'clientApprovalStatus' is distinct from 'Approved'
      and not (new.data->>'status'='Completed' and (v_role='Project Manager' or v_boss)) then
      raise check_violation using message='Only the client can record customer acceptance before final completion.';
    end if;
    if new.data->>'status' = 'Approved' and v_changed and not (
      v_old->>'status' = 'Waiting Approval' and (v_boss or (v_hod and exists (
        select 1 from public.aitask_members m where m.workspace_id=new.workspace_id and m.id=v_actor
        and private.aitask_task_department(new.data->>'department') = any(m.departments)
      )))
    ) then raise check_violation using message='Only the department HOD can approve submitted work.'; end if;
    if ((new.data->>'status' = 'Completed' and v_changed)
      or (coalesce((new.data->>'isCompleted')::boolean,false) and not coalesce((v_old->>'isCompleted')::boolean,false)))
      and not (v_boss or (v_role='Project Manager' and v_old->>'status'='Approved')) then
      raise check_violation using message='Only a project manager can confirm completion after HOD approval.';
    end if;
    if v_role='Staff' and not v_hod and not v_boss and (
      (v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed'))
      or (v_changed and new.data->>'status'='Revision')
      or coalesce((new.data->>'revisionCount')::integer,0)>coalesce((v_old->>'revisionCount')::integer,0)
      or (new.data->>'clientApprovalStatus'='Rejected' and v_old->>'clientApprovalStatus' is distinct from 'Rejected')
    ) then raise check_violation using message='Ask the HOD or project manager to return approved work for revision.'; end if;
  end if;
  if tg_op='UPDATE' and v_actor is not null and v_role <> 'Client' then
    if (v_old->>'assignedTo' is distinct from new.data->>'assignedTo' or v_old->>'department' is distinct from new.data->>'department')
      and v_old->>'status' not in ('Completed','Cancelled') and not v_changed then
      new.data := new.data || jsonb_build_object('status','Pending','clientApprovalStatus','Pending');
    elsif new.data->>'status'='In Progress' and v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed') then
      new.data := new.data || jsonb_build_object('clientApprovalStatus','Rejected','revisionCount',coalesce((v_old->>'revisionCount')::integer,0)+1);
    end if;
    if new.data->>'status'='Completed' and v_changed then
      new.data := new.data || jsonb_build_object('clientApprovalStatus','Approved');
    end if;
  end if;
  v_percent := case
    when new.data->>'status'='Cancelled' then 0
    when new.data->>'status'='Completed' then 100
    when new.data->>'status'='Approved' then 80
    when new.data->>'status'='Waiting Approval' then 60
    when new.data->>'clientApprovalStatus'='Rejected' or new.data->>'status'='Revision' then 50
    when new.data->>'status'='In Progress'
      or (nullif(new.data->>'assignedTo','') is not null and new.data->'workState'->>'acceptedBy'=new.data->>'assignedTo') then 30
    when nullif(btrim(new.data->>'assignedTo'),'') is null then 0
    when exists(select 1 from public.aitask_members m where m.workspace_id=new.workspace_id and m.id=new.data->>'assignedTo'
      and (m.role in ('HOD','Project Manager') or m.custom_role_id='builtin-hod')) then 10
    else 20 end;
  new.data := new.data || jsonb_build_object('completionPercentage',v_percent,'isCompleted',new.data->>'status'='Completed');
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_stage_progress() from public, anon, authenticated;
create trigger zzzz_aitask_guard_task_stage_progress before insert or update of data on public.aitask_entities
for each row execute function private.aitask_guard_task_stage_progress();

-- Allow the HOD approval handoff to the client after the internal 80% checkpoint.
CREATE OR REPLACE FUNCTION private.aitask_guard_staff_notification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id text := private.aitask_member_id(new.workspace_id);
  v_actor_name text;
  v_command_type text := current_setting('aitask.command_type', true);
  v_context jsonb;
  v_task_id text := nullif(btrim(new.data -> 'route' ->> 'entityId'), '');
  v_task jsonb;
  v_title text := new.data ->> 'title';
  v_target_user text := nullif(btrim(new.data ->> 'targetUserId'), '');
  v_target_role text := nullif(btrim(new.data ->> 'targetRole'), '');
  v_target_client text := lower(btrim(coalesce(new.data ->> 'targetClient', '')));
  v_task_client text;
  v_message text;
begin
  if current_setting('aitask.server_notification', true) = 'true' then return new; end if;
  if private.aitask_member_role(new.workspace_id) is distinct from 'Staff' then return new; end if;

  begin
    v_context := coalesce(nullif(current_setting('aitask.staff_task_context', true), ''), '[]')::jsonb;
  exception when others then
    v_context := '[]'::jsonb;
  end;

  -- Older cached clients placed the deletion notice before the task delete and
  -- did not include its entity id in the route. The command wrapper seeds the
  -- complete authorized task context so that this one legacy shape can be
  -- bound to an unambiguous task without accepting standalone notices.
  if v_task_id is null
    and v_title = 'Task Deleted'
    and v_command_type = 'task.delete'
    and jsonb_array_length(v_context) = 1 then
    v_task_id := v_context ->> 0;
  end if;

  if (new.data -> 'route' ->> 'page') is distinct from 'tasks'
    or v_task_id is null
    or not (v_context ? v_task_id)
    or v_command_type not in (
      'workspace.patch', 'task.create', 'task.update', 'comment.add',
      'approval.revision', 'reminder.generate', 'task.delete'
    ) then
    raise check_violation using message = 'Staff notifications must belong to the task changed by this command.';
  end if;

  select task.data into v_task
  from public.aitask_entities task
  where task.workspace_id = new.workspace_id
    and task.entity_type = 'task'
    and task.entity_id = v_task_id;
  if v_task is null or not private.aitask_can_edit_task(new.workspace_id, v_task_id) then
    raise check_violation using message = 'Staff notifications require an editable task.';
  end if;

  if ((v_target_user is not null)::integer
      + (v_target_role is not null)::integer
      + (v_target_client <> '')::integer) <> 1 then
    raise check_violation using message = 'Staff notifications require one approved audience.';
  end if;

  v_task_client := lower(btrim(coalesce(v_task ->> 'clientName', '')));
  if v_target_role is not null and v_target_role <> 'Project Manager' then
    raise check_violation using message = 'Staff role notifications may target Project Manager only.';
  elsif v_target_user is not null
    and v_target_user <> coalesce(nullif(v_task ->> 'assignedTo', ''), '')
    and not exists (
      select 1
      from public.aitask_members recipient
      where recipient.workspace_id = new.workspace_id
        and recipient.id = v_target_user
        and (
          recipient.is_super_admin
          or recipient.id = (
            select client.created_by from public.aitask_entities client
            where client.workspace_id = new.workspace_id
              and client.entity_type = 'client'
              and client.client_key = lower(btrim(coalesce(v_task ->> 'clientName', '')))
            limit 1
          )
          or recipient.id = (
            select project.created_by from public.aitask_entities project
            where project.workspace_id = new.workspace_id
              and project.entity_type = 'project'
              and project.entity_id = nullif(btrim(coalesce(v_task ->> 'projectId', '')), '')
            limit 1
          )
          or (
            recipient.role = 'Project Manager'
            and recipient.id in (
              nullif(btrim(coalesce(v_task ->> 'assignedBy', '')), ''),
              nullif(btrim(coalesce(v_task ->> 'createdBy', '')), '')
            )
          )
        )
    ) then
    raise check_violation using message = 'Staff user notifications may target the assignee, the owning Project Manager, or a super admin.';
  elsif v_target_client <> '' and (
    v_target_client <> v_task_client
    or coalesce(v_task ->> 'visibility', 'internal') = 'internal'
  ) then
    raise check_violation using message = 'Staff client notifications require a visible task for that client.';
  end if;

  select member.name into v_actor_name
  from public.aitask_members member
  where member.workspace_id = new.workspace_id and member.id = v_actor_id;
  v_actor_name := coalesce(nullif(btrim(v_actor_name), ''), 'Staff');

  v_message := case
    when v_title = 'Task Created by Staff' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.create', 'workspace.patch')
      then v_actor_name || ' created a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Task Assigned' and v_target_user is not null
      and v_command_type in ('task.create', 'workspace.patch')
      then 'You have been assigned a new task: "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Assigned To You' and v_target_user is not null
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" has been assigned to you by ' || v_actor_name || '.'
    when v_title = 'Task Status Updated' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('task.update', 'workspace.patch')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" was moved to '
        || left(coalesce(v_task ->> 'status', 'Updated'), 80) || ' by ' || v_actor_name || '.'
    when v_title = 'Task Deleted' and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type = 'task.delete'
      then v_actor_name || ' deleted "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title in ('Task Completed', 'Task Ready for Approval') and v_target_client <> ''
      and v_command_type in ('task.update', 'workspace.patch')
      and coalesce(v_task ->> 'status', '') in ('Completed', 'Waiting Approval', 'Approved')
      then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is ready for client review.'
    when v_title = 'New Comment' and v_target_user is not null
      and v_command_type in ('comment.add', 'workspace.patch')
      then 'You have a new comment on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'New Comment' and v_target_role = 'Project Manager'
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' commented on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Team Update' and v_target_client <> ''
      and v_command_type in ('comment.add', 'workspace.patch')
      then v_actor_name || ' posted an update on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Revision Requested' and v_target_user is not null
      and v_command_type in ('approval.revision', 'workspace.patch')
      then v_actor_name || ' requested a revision on "' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '".'
    when v_title = 'Task Deadline Approaching'
      and (v_target_role = 'Project Manager' or v_target_user is not null)
      and v_command_type in ('reminder.generate', 'workspace.patch')
      then case
        when coalesce(v_task ->> 'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then null
        else (
          case
            when (v_task ->> 'dueDate')::date = current_date then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is due today.'
            when (v_task ->> 'dueDate')::date = current_date + 1 then '"' || left(coalesce(v_task ->> 'title', 'Task'), 160) || '" is due tomorrow.'
            else null
          end
        )
      end
    else null
  end;

  if v_message is null then
    raise check_violation using message = 'This Staff notification is not permitted.';
  end if;
  new.data := jsonb_set(
    new.data,
    '{route}',
    jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
    true
  );
  new.data := jsonb_set(new.data, '{message}', to_jsonb(v_message), true);
  if v_title = 'Task Deleted' then
    begin
      v_context := coalesce(
        nullif(current_setting('aitask.staff_delete_notice_context', true), ''),
        '[]'
      )::jsonb;
    exception when others then
      v_context := '[]'::jsonb;
    end;
    if not (v_context ? v_task_id) then
      perform set_config(
        'aitask.staff_delete_notice_context',
        (v_context || jsonb_build_array(v_task_id))::text,
        true
      );
    end if;
  end if;
  return new;
end;
$function$;
