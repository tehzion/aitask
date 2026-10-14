-- Customer privacy and publication state. No business records are rewritten.
-- Preserve the RPC signature and existing payload collections.
create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientId',p_data->'clientId','clientName',p_data->'clientName','projectId',p_data->'projectId','projectName',p_data->'projectName',
    'deliverableId',p_data->'deliverableId','visibility',p_data->'visibility',
    'serviceType',p_data->'serviceType','title',p_data->'title','description',p_data->'description',
    'startDate',p_data->'startDate','dueDate',p_data->'dueDate','status',p_data->'status','completionPercentage',p_data->'completionPercentage',
    'attachmentLink',p_data->'attachmentLink','attachmentName',p_data->'attachmentName','website',p_data->'website','facebookPage',p_data->'facebookPage',
    'isCompleted',p_data->'isCompleted','completedAt',p_data->'completedAt','clientApprovalStatus',p_data->'clientApprovalStatus'
  ));
$$;
revoke all on function private.aitask_client_task_projection(jsonb) from public,anon,authenticated;

-- Deliverable projection for clients: keep the client-facing surface (title,
-- status, attachments, cycle/plan linkage) but never expose the frozen task-chain
-- (taskIds) or its generation metadata. `primaryTaskId` is the representative task
-- so the client can still open the delivery focus view.

create or replace function private.aitask_client_deliverable_projection(p_workspace_id text, p_data jsonb)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientId',p_data->'clientId','clientName',p_data->'clientName',
    'planId',p_data->'planId','cycleId',p_data->'cycleId','sequence',p_data->'sequence',
    'title',p_data->'title','status',p_data->'status','attachments',p_data->'attachments',
    'primaryTaskId', (
      select task.entity_id from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_id = p_data->>'clientId'
        and coalesce(task.data->>'visibility','client-visible') = 'client-visible'
        and (task.data->>'deliverableId' = p_data->>'id' or task.entity_id in (select jsonb_array_elements_text(coalesce(p_data->'taskIds','[]'::jsonb))))
      order by coalesce((task.data->>'workflowStepOrder')::int, 0) desc, task.entity_id
      limit 1
    )
  ));
$$;
revoke all on function private.aitask_client_deliverable_projection(text, jsonb) from public,anon,authenticated;

create or replace function public.aitask_read_client_portal(p_workspace_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_member public.aitask_members%rowtype; v_key text; v_client_id text;
  v_tasks jsonb; v_projects jsonb; v_clients jsonb; v_contacts jsonb;
  v_plans jsonb; v_cycles jsonb; v_deliverables jsonb; v_comments jsonb;
  v_task_comments jsonb; v_task_approvals jsonb;
begin
  if (select auth.uid()) is null then raise insufficient_privilege using message='Authentication required.'; end if;
  select member.* into v_member from public.aitask_members member
    where member.workspace_id=p_workspace_id
      and member.auth_user_id=(select auth.uid())
      and member.role = 'Client'
    limit 1;
  if not found then raise insufficient_privilege using message='Client workspace membership required.'; end if;
  v_key:=lower(btrim(coalesce(v_member.client_name,'')));
  select entity_id into v_client_id from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key limit 1;
  select coalesce(jsonb_agg(private.aitask_client_task_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at) order by updated_at desc),'[]') into v_tasks from public.aitask_entities
    where workspace_id=p_workspace_id and entity_type='task' and client_key=v_key
      and coalesce(data->>'visibility','client-visible')='client-visible'
      and (coalesce(data->>'serviceCycleId','')='' or exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=(aitask_entities.data->>'serviceCycleId') and cycle.data->>'status' in ('Published','Completed')));
  select coalesce(jsonb_agg(private.aitask_client_project_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at) order by updated_at desc),'[]') into v_projects from public.aitask_entities where workspace_id=p_workspace_id and entity_type='project' and client_key=v_key;
  select coalesce(jsonb_agg(private.aitask_client_profile_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at, 'awaitingPublication', exists (select 1 from public.aitask_entities draft join public.aitask_entities plan on plan.workspace_id=draft.workspace_id and plan.entity_type='client_plan' and plan.entity_id=draft.data->>'planId' where draft.workspace_id=p_workspace_id and draft.entity_type='service_cycle' and draft.client_id=v_client_id and plan.client_id=v_client_id and plan.data->>'status'='Active' and draft.data->>'status'='Draft' and draft.period_start <= timezone('Asia/Kuala_Lumpur',now())::date and case when coalesce(draft.data->>'periodEnd','') ~ '^\d{4}-\d{2}-\d{2}$' and pg_input_is_valid(draft.data->>'periodEnd','date') then (draft.data->>'periodEnd')::date end >= timezone('Asia/Kuala_Lumpur',now())::date))),'[]') into v_clients from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key;
  v_contacts := '[]'::jsonb;
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at)),'[]') into v_plans from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client_plan' and client_id=v_client_id and data->>'status'='Active';
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps'-'addonSnapshots')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at) order by period_start desc),'[]') into v_cycles from public.aitask_entities where workspace_id=p_workspace_id and entity_type='service_cycle' and client_id=v_client_id and data->>'status' in ('Published','Completed');
  select coalesce(jsonb_agg(private.aitask_client_deliverable_projection(p_workspace_id,data)||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_deliverables from public.aitask_entities where workspace_id=p_workspace_id and entity_type='deliverable' and client_id=v_client_id and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  select coalesce(jsonb_agg(data||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_comments from public.aitask_entities where workspace_id=p_workspace_id and entity_type='cycle_comment' and client_id=v_client_id and data->>'visibility'='client-visible' and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',comment.entity_id,'taskId',comment.parent_id,'userId',comment.data->>'userId','text',comment.data->>'text','createdAt',comment.data->>'createdAt','version',comment.version,'updatedAt',comment.updated_at)) order by comment.data->>'createdAt'),'[]') into v_task_comments
    from public.aitask_entities comment
    where comment.workspace_id=p_workspace_id and comment.entity_type='comment' and comment.parent_id is not null
      and exists (select 1 from jsonb_array_elements(v_tasks) visible_task where visible_task->>'id'=comment.parent_id);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',approval.entity_id,'taskId',approval.parent_id,'userId',approval.data->>'userId','status',approval.data->>'status','note',approval.data->>'note','createdAt',approval.data->>'createdAt','version',approval.version,'updatedAt',approval.updated_at)) order by approval.data->>'createdAt'),'[]') into v_task_approvals
    from public.aitask_entities approval
    where approval.workspace_id=p_workspace_id and approval.entity_type='approval' and approval.parent_id is not null
      and exists (select 1 from jsonb_array_elements(v_tasks) visible_task where visible_task->>'id'=approval.parent_id);
  return jsonb_build_object('workspaceId',p_workspace_id,'clientName',v_member.client_name,'tasks',v_tasks,'projects',v_projects,'clients',v_clients,'contacts',v_contacts,'clientPlans',v_plans,'serviceCycles',v_cycles,'deliverables',v_deliverables,'cycleComments',v_comments,'taskComments',v_task_comments,'taskApprovals',v_task_approvals);
end;
$$;
revoke all on function public.aitask_read_client_portal(text) from public,anon;
grant execute on function public.aitask_read_client_portal(text) to authenticated,service_role;

-- Projected approvals do not carry internal revision counters. The canonical
-- merge owns those counters, completion dates and hidden assignment metadata.
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
      and (coalesce(v_old_task->>'visibility','client-visible')='client-visible' and (coalesce(v_old_task->>'serviceCycleId','')='' or exists (select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=v_old_task->>'serviceCycleId' and cycle.data->>'status' in ('Published','Completed'))))
      and lower(btrim(coalesce(v_old_task ->> 'clientName', ''))) = v_client_key
      and v_child_data ->> 'id' = v_child_operation ->> 'entityId'
      and v_child_data ->> 'taskId' = v_task_id
      and v_child_data ->> 'userId' = v_member_id
      and length(btrim(coalesce(v_child_data ->> 'text', ''))) between 1 and 2000;
  end if;

  if not private.aitask_has_permission(p_workspace_id,'clientReview') or p_command_type <> 'approval.review'
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
    or not (coalesce(v_old_task->>'visibility','client-visible')='client-visible' and (coalesce(v_old_task->>'serviceCycleId','')='' or exists (select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=v_old_task->>'serviceCycleId' and cycle.data->>'status' in ('Published','Completed'))))
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
      and not (key='assignedTo' and coalesce(v_new_task->>'assignedTo','')='')
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
      and (not (v_new_task ? 'revisionCount') or (v_new_task ->> 'revisionCount')::integer = v_old_revision);
  end if;
  if v_review_status = 'Rejected' then
    return v_new_task ->> 'status' = 'In Progress'
      and not coalesce((v_new_task ->> 'isCompleted')::boolean, true)
      and coalesce((v_new_task ->> 'completionPercentage')::integer, -1) = least(v_old_completion, 90)
      and (not (v_new_task ? 'revisionCount') or (v_new_task ->> 'revisionCount')::integer = v_old_revision + 1);
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
      'revisionCount', coalesce((old.data->>'revisionCount')::integer,0) + case when new.data->>'clientApprovalStatus'='Rejected' then 1 else 0 end,
      'completedAt', case when new.data->>'clientApprovalStatus'='Approved' then case when coalesce((old.data->>'isCompleted')::boolean,false) or old.data->>'status'='Completed' then old.data->'completedAt' else to_jsonb(now()::text) end else null end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_merge_client_approval_task() from public, anon, authenticated;


-- Preserve the existing function identity, grants, RLS dependencies, and all
-- accumulated PM/HOD authorization changes. Validated Client approvals need a
-- narrow path because the public task projection omits private assignments.
do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  v_anchor text := '  if v_member_id is null then return false; end if;';
  v_client_approval text := $branch$
  if p_entity_type = 'task' and p_action = 'update'
    and v_role = 'Client'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true' then
    return private.aitask_has_permission(p_workspace_id, 'clientReview')
      and lower(btrim(coalesce(p_old_data ->> 'clientName', ''))) = private.aitask_member_client_key(p_workspace_id)
      and coalesce(p_old_data ->> 'visibility', 'client-visible') = 'client-visible';
  end if;
$branch$;
begin
  if strpos(v_definition, v_anchor) = 0 then
    raise exception 'Client approval authorization anchor missing; refusing to replace existing permissions';
  end if;
  execute replace(v_definition, v_anchor, v_anchor || v_client_approval);
end;
$migration$;
