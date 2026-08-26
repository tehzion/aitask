-- Client read-privacy hardening.
--
-- 1. Close a server-side data leak: clients could SELECT `comment`/`approval`
--    entities for *any* task in their company (including `visibility='internal'`
--    tasks) because the comment/approval branch only checked task visibility
--    and omitted the `role <> 'Client'` guard the task branch carries. Clients
--    now receive comments/approvals exclusively through the portal RPC, which
--    filters to client-visible tasks.
-- 2. Stop leaking the frozen task-chain to clients: the deliverable payload is
--    projected to expose only a single `primaryTaskId` (the representative task)
--    instead of the raw `taskIds` dependency list, and drops internal linkage
--    fields. Task projections also drop workflow step ordering and revision
--    counters.

alter policy "members can read scoped entities" on public.aitask_entities
  using (
    (entity_type = 'task' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project' and private.aitask_member_role(workspace_id) <> 'Client' and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type = 'task_status' and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'custom_role' and (private.aitask_member_role(workspace_id) <> 'Client' or exists (
      select 1 from public.aitask_members member where member.workspace_id = aitask_entities.workspace_id
        and member.auth_user_id = (select auth.uid()) and member.custom_role_id = aitask_entities.entity_id
    )))
    or (entity_type = 'registration' and private.aitask_is_super_admin(workspace_id))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client' and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
    or (entity_type = 'service_package' and private.aitask_has_permission(workspace_id, 'manageServiceCatalog'))
    or (entity_type = 'service_workflow_template' and private.aitask_has_permission(workspace_id, 'manageTaskTemplates'))
    or (entity_type = 'service_pricing_snapshot' and private.aitask_has_permission(workspace_id, 'viewServicePrices'))
    or (entity_type in ('client_plan', 'addon')
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_access_service_client(workspace_id, client_id))
    or (entity_type in ('service_cycle', 'deliverable', 'cycle_comment')
      and private.aitask_member_role(workspace_id) <> 'Client'
      and private.aitask_can_access_service_client(workspace_id, client_id))
  );

-- Drop workflow step ordering, revision counters, and the raw cycle linkage from
-- the client task projection. Keep `deliverableId` so clients can map a task to
-- its deliverable without the task-chain list.
create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientName',p_data->'clientName','projectId',p_data->'projectId','projectName',p_data->'projectName',
    'deliverableId',p_data->'deliverableId','visibility',p_data->'visibility',
    'serviceType',p_data->'serviceType','title',p_data->'title','description',p_data->'description','assignedTo',p_data->'assignedTo',
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
        and task.entity_id in (select jsonb_array_elements_text(coalesce(p_data->'taskIds','[]'::jsonb)))
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
  select coalesce(jsonb_agg(private.aitask_client_profile_projection(data)||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_clients from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'avatar',m.avatar) order by m.name),'[]') into v_contacts from public.aitask_members m where m.workspace_id=p_workspace_id and m.id in (select distinct assigned_to from public.aitask_entities where workspace_id=p_workspace_id and entity_type='task' and client_key=v_key and assigned_to is not null);
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at)),'[]') into v_plans from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client_plan' and client_id=v_client_id and data->>'status'='Active';
  select coalesce(jsonb_agg((data-'discountValue'-'taxRateBps'-'addonSnapshots')||jsonb_build_object('serviceItems',private.aitask_public_service_items(data->'serviceItems'),'version',version,'updatedAt',updated_at) order by period_start desc),'[]') into v_cycles from public.aitask_entities where workspace_id=p_workspace_id and entity_type='service_cycle' and client_id=v_client_id and data->>'status' in ('Published','Completed');
  select coalesce(jsonb_agg(private.aitask_client_deliverable_projection(p_workspace_id,data)||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_deliverables from public.aitask_entities where workspace_id=p_workspace_id and entity_type='deliverable' and client_id=v_client_id and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  select coalesce(jsonb_agg(data||jsonb_build_object('version',version,'updatedAt',updated_at)),'[]') into v_comments from public.aitask_entities where workspace_id=p_workspace_id and entity_type='cycle_comment' and client_id=v_client_id and data->>'visibility'='client-visible' and exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=aitask_entities.cycle_id and cycle.data->>'status' in ('Published','Completed'));
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',comment.entity_id,'taskId',comment.parent_id,'userId',comment.data->>'userId','text',comment.data->>'text','createdAt',comment.data->>'createdAt','version',comment.version,'updatedAt',comment.updated_at)) order by comment.data->>'createdAt'),'[]') into v_task_comments
    from public.aitask_entities comment
    where comment.workspace_id=p_workspace_id and comment.entity_type='comment' and comment.parent_id is not null
      and exists (select 1 from public.aitask_entities task where task.workspace_id=p_workspace_id and task.entity_type='task' and task.entity_id=comment.parent_id and task.client_key=v_key and coalesce(task.data->>'visibility','client-visible')='client-visible');
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',approval.entity_id,'taskId',approval.parent_id,'userId',approval.data->>'userId','status',approval.data->>'status','note',approval.data->>'note','createdAt',approval.data->>'createdAt','version',approval.version,'updatedAt',approval.updated_at)) order by approval.data->>'createdAt'),'[]') into v_task_approvals
    from public.aitask_entities approval
    where approval.workspace_id=p_workspace_id and approval.entity_type='approval' and approval.parent_id is not null
      and exists (select 1 from public.aitask_entities task where task.workspace_id=p_workspace_id and task.entity_type='task' and task.entity_id=approval.parent_id and task.client_key=v_key and coalesce(task.data->>'visibility','client-visible')='client-visible');
  return jsonb_build_object('workspaceId',p_workspace_id,'clientName',v_member.client_name,'tasks',v_tasks,'projects',v_projects,'clients',v_clients,'contacts',v_contacts,'clientPlans',v_plans,'serviceCycles',v_cycles,'deliverables',v_deliverables,'cycleComments',v_comments,'taskComments',v_task_comments,'taskApprovals',v_task_approvals);
end;
$$;
revoke all on function public.aitask_read_client_portal(text) from public,anon;
grant execute on function public.aitask_read_client_portal(text) to authenticated,service_role;
