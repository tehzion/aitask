-- AiTask v1.6.15: allowlisted Client portal reads and redacted approval writes.
-- This migration is additive. Direct Client table reads are restricted only
-- after the projection frontend is deployed.

create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_data -> 'id',
    'clientName', p_data -> 'clientName',
    'projectId', p_data -> 'projectId',
    'projectName', p_data -> 'projectName',
    'serviceType', p_data -> 'serviceType',
    'title', p_data -> 'title',
    'description', p_data -> 'description',
    'assignedTo', p_data -> 'assignedTo',
    'startDate', p_data -> 'startDate',
    'dueDate', p_data -> 'dueDate',
    'status', p_data -> 'status',
    'completionPercentage', p_data -> 'completionPercentage',
    'attachmentLink', p_data -> 'attachmentLink',
    'attachmentName', p_data -> 'attachmentName',
    'website', p_data -> 'website',
    'facebookPage', p_data -> 'facebookPage',
    'isCompleted', p_data -> 'isCompleted',
    'completedAt', p_data -> 'completedAt',
    'revisionCount', p_data -> 'revisionCount',
    'clientApprovalStatus', p_data -> 'clientApprovalStatus'
  ));
$$;

create or replace function private.aitask_client_project_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_data -> 'id',
    'clientName', p_data -> 'clientName',
    'projectName', p_data -> 'projectName',
    'services', p_data -> 'services',
    'startDate', p_data -> 'startDate',
    'deadline', p_data -> 'deadline',
    'totalTasks', p_data -> 'totalTasks',
    'completedTasks', p_data -> 'completedTasks'
  ));
$$;

create or replace function private.aitask_client_profile_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_data -> 'id',
    'clientName', p_data -> 'clientName',
    'contactPerson', p_data -> 'contactPerson',
    'email', p_data -> 'email',
    'phone', p_data -> 'phone',
    'address', p_data -> 'address',
    'website', p_data -> 'website',
    'facebookPage', p_data -> 'facebookPage',
    'createdAt', p_data -> 'createdAt',
    'updatedAt', p_data -> 'updatedAt'
  ));
$$;

revoke all on function private.aitask_client_task_projection(jsonb) from public, anon, authenticated;
revoke all on function private.aitask_client_project_projection(jsonb) from public, anon, authenticated;
revoke all on function private.aitask_client_profile_projection(jsonb) from public, anon, authenticated;

create or replace function public.aitask_read_client_portal(p_workspace_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.aitask_members%rowtype;
  v_client_key text;
  v_tasks jsonb;
  v_projects jsonb;
  v_clients jsonb;
  v_contacts jsonb;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication required.';
  end if;

  select member.* into v_member
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.auth_user_id = (select auth.uid())
    and member.role = 'Client'
  limit 1;

  if not found then
    raise insufficient_privilege using message = 'Client workspace membership required.';
  end if;

  v_client_key := lower(btrim(coalesce(v_member.client_name, '')));
  if v_client_key = '' then
    raise check_violation using message = 'Client account is not linked to a company.';
  end if;

  select coalesce(jsonb_agg(
    private.aitask_client_task_projection(entity.data)
      || jsonb_build_object(
        'version', entity.version,
        'updatedAt', entity.updated_at
      )
    order by entity.updated_at desc, entity.entity_id
  ), '[]'::jsonb)
  into v_tasks
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'task'
    and entity.client_key = v_client_key;

  select coalesce(jsonb_agg(
    private.aitask_client_project_projection(entity.data)
      || jsonb_build_object(
        'version', entity.version,
        'updatedAt', entity.updated_at
      )
    order by entity.updated_at desc, entity.entity_id
  ), '[]'::jsonb)
  into v_projects
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'project'
    and entity.client_key = v_client_key;

  select coalesce(jsonb_agg(
    private.aitask_client_profile_projection(entity.data)
      || jsonb_build_object(
        'version', entity.version,
        'updatedAt', entity.updated_at
      )
    order by entity.updated_at desc, entity.entity_id
  ), '[]'::jsonb)
  into v_clients
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'client'
    and entity.client_key = v_client_key;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', contact.id,
    'name', contact.name,
    'avatar', contact.avatar
  ) order by contact.name, contact.id), '[]'::jsonb)
  into v_contacts
  from public.aitask_members contact
  where contact.workspace_id = p_workspace_id
    and contact.id in (
      select distinct entity.assigned_to
      from public.aitask_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type = 'task'
        and entity.client_key = v_client_key
        and entity.assigned_to is not null
    );

  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'clientName', v_member.client_name,
    'tasks', v_tasks,
    'projects', v_projects,
    'clients', v_clients,
    'contacts', v_contacts
  );
end;
$$;

revoke all on function public.aitask_read_client_portal(text) from public, anon;
grant execute on function public.aitask_read_client_portal(text) to authenticated, service_role;

-- Client approval commands may come from the legacy full-task client or the
-- v1.6.15 redacted portal. Hidden fields are accepted only when unchanged.
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
    or not (coalesce((v_old_task ->> 'isCompleted')::boolean, false) or v_old_task ->> 'status' = 'Waiting Approval')
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
    return v_new_task ->> 'status' = 'Completed'
      and coalesce((v_new_task ->> 'isCompleted')::boolean, false)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = 100
      and coalesce((v_new_task ->> 'revisionCount')::integer, -1) = v_old_revision;
  end if;
  if v_review_status = 'Rejected' then
    return v_new_task ->> 'status' = 'In Progress'
      and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = least(v_old_completion, 90)
      and coalesce((v_new_task ->> 'revisionCount')::integer, -1) = v_old_revision + 1;
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
      'status', new.data -> 'status',
      'isCompleted', new.data -> 'isCompleted',
      'completionPercentage', new.data -> 'completionPercentage',
      'revisionCount', new.data -> 'revisionCount'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_merge_client_approval_task() from public, anon, authenticated;

drop trigger if exists aitask_00_merge_client_approval_task on public.aitask_entities;
create trigger aitask_00_merge_client_approval_task
  before update of data on public.aitask_entities
  for each row execute function private.aitask_merge_client_approval_task();
