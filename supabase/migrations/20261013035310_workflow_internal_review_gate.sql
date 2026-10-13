-- Approval provenance cannot come from task JSON that old clients could edit.
create table private.aitask_internal_review_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  task_id text not null,
  output_version bigint not null check(output_version>0),
  reviewer_id text not null,
  reviewed_at timestamptz not null,
  input_versions jsonb not null check(jsonb_typeof(input_versions)='array')
);
create index aitask_internal_review_task_idx on private.aitask_internal_review_decisions(workspace_id,task_id,output_version);
alter table private.aitask_internal_review_decisions enable row level security;
revoke all on private.aitask_internal_review_decisions from public,anon,authenticated,service_role;

-- Resolve the immutable workflow from the deliverable's frozen cycle snapshot.
create or replace function private.aitask_workflow_step(p_workspace text, p_task jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select step.value
  from public.aitask_entities output
  join public.aitask_entities cycle on cycle.workspace_id=output.workspace_id
    and cycle.entity_type='service_cycle' and cycle.entity_id=output.data->>'cycleId'
  cross join lateral jsonb_array_elements(coalesce(cycle.data->'serviceItems','[]'::jsonb)) item(value)
  cross join lateral jsonb_array_elements(coalesce(item.value->'workflow'->'steps','[]'::jsonb)) step(value)
  where output.workspace_id=p_workspace and output.entity_type='deliverable'
    and output.entity_id=p_task->>'deliverableId'
    and output.data->>'clientId'=p_task->>'clientId'
    and cycle.entity_id=p_task->>'serviceCycleId'
    and cycle.data->>'clientId'=p_task->>'clientId'
    and item.value->>'id'=output.data->>'serviceItemId'
    and item.value->'workflow'->>'templateId'=p_task->>'workflowTemplateId'
    and item.value->'workflow'->>'templateRevision'=p_task->>'workflowTemplateRevision'
    and step.value->>'id'=p_task->>'workflowStepId'
  limit 1;
$$;

create or replace function private.aitask_workflow_task_satisfied(p_workspace text, p_task jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_step jsonb; v_id text; v_input jsonb; v_recorded jsonb;
  v_decision private.aitask_internal_review_decisions%rowtype;
  v_generated boolean;
begin
  if p_task is null then return false; end if;
  v_generated := coalesce((p_task->>'generatedFromDeliverable')::boolean,false) or coalesce(p_task->>'workflowStepId','')<>'';
  if v_generated then
    v_step := private.aitask_workflow_step(p_workspace,p_task);
    if v_step is null or coalesce(v_step->>'kind','') not in ('work','internal_review','client_approval','publishing') then return false; end if;
  end if;
  if p_task->>'status'='Cancelled' and (case when v_generated then coalesce((v_step->>'required')::boolean,true) else coalesce((p_task->>'workflowStepRequired')::boolean,true) end)=false then return true; end if;
  if not (coalesce((p_task->>'isCompleted')::boolean,false) or p_task->>'status'='Completed') then return false; end if;
  if not v_generated then return true; end if;
  if v_step->>'kind'<>'internal_review' then return true; end if;
  if coalesce(p_task->'internalReview'->>'reviewedBy','')='' or coalesce(p_task->'internalReview'->>'reviewedAt','')='' then return false; end if;
  select * into v_decision from private.aitask_internal_review_decisions
    where workspace_id=p_workspace and task_id=p_task->>'id'
      and output_version=coalesce((p_task->>'workflowOutputVersion')::bigint,1)
      and decision_id::text=p_task->'internalReview'->>'decisionId';
  if not found or v_decision.reviewer_id is distinct from p_task->'internalReview'->>'reviewedBy'
    or v_decision.input_versions is distinct from p_task->'internalReview'->'inputVersions'
    or v_decision.reviewed_at is distinct from (p_task->'internalReview'->>'reviewedAt')::timestamptz then return false; end if;
  for v_id in select distinct value from jsonb_array_elements_text(coalesce(p_task->'predecessorTaskIds','[]'::jsonb)) loop
    select data into v_input from public.aitask_entities where workspace_id=p_workspace and entity_type='task' and entity_id=v_id;
    select value into v_recorded from jsonb_array_elements(coalesce(p_task->'internalReview'->'inputVersions','[]'::jsonb)) where value->>'taskId'=v_id limit 1;
    if v_input is null or v_recorded is null
      or coalesce((v_recorded->>'outputVersion')::bigint,0)<>coalesce((v_input->>'workflowOutputVersion')::bigint,1)
      or not (coalesce((v_input->>'isCompleted')::boolean,false) or v_input->>'status'='Completed'
        or (v_input->>'status'='Cancelled' and v_input->>'workflowStepRequired'='false')) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.aitask_workflow_dependencies_ready(p_workspace text,p_task jsonb)
returns boolean language sql volatile security definer set search_path='' as $$
  select not exists (
    select 1 from jsonb_array_elements_text(coalesce(p_task->'predecessorTaskIds','[]'::jsonb)) dependency(id)
    left join public.aitask_entities predecessor on predecessor.workspace_id=p_workspace
      and predecessor.entity_type='task' and predecessor.entity_id=dependency.id
    where predecessor.entity_id is null
      or predecessor.data->>'clientId' is distinct from p_task->>'clientId'
      or predecessor.data->>'deliverableId' is distinct from p_task->>'deliverableId'
      or not private.aitask_workflow_task_satisfied(p_workspace,predecessor.data)
  );
$$;

create or replace function private.aitask_workflow_deliverable_ready(p_workspace text,p_output jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_workflow jsonb; v_step jsonb;
begin
  select item.value->'workflow' into v_workflow from public.aitask_entities cycle
  cross join lateral jsonb_array_elements(coalesce(cycle.data->'serviceItems','[]'::jsonb)) item(value)
  where cycle.workspace_id=p_workspace and cycle.entity_type='service_cycle' and cycle.entity_id=p_output->>'cycleId'
    and cycle.data->>'clientId'=p_output->>'clientId' and item.value->>'id'=p_output->>'serviceItemId';
  if v_workflow is null then return true; end if;
  for v_step in select value from jsonb_array_elements(coalesce(v_workflow->'steps','[]'::jsonb)) where coalesce((value->>'required')::boolean,true) loop
    if not exists(select 1 from public.aitask_entities task where task.workspace_id=p_workspace and task.entity_type='task'
      and task.data->>'deliverableId'=p_output->>'id' and task.data->>'clientId'=p_output->>'clientId'
      and task.data->>'workflowStepId'=v_step->>'id' and private.aitask_workflow_task_satisfied(p_workspace,task.data)) then return false; end if;
  end loop;
  return not exists(select 1 from public.aitask_entities task where task.workspace_id=p_workspace and task.entity_type='task'
    and (task.data->>'deliverableId'=p_output->>'id' or coalesce(p_output->'taskIds','[]'::jsonb) ? task.entity_id)
    and task.data->>'clientId'=p_output->>'clientId' and coalesce((task.data->>'workflowStepRequired')::boolean,true)
    and not private.aitask_workflow_task_satisfied(p_workspace,task.data));
end;
$$;

create or replace function private.aitask_guard_workflow_task()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_step jsonb; v_previous_step jsonb; v_previous_task text; v_actor text;
  v_before jsonb := '{}'::jsonb; v_output_changed boolean := false; v_counter bigint := 1;
  v_ready boolean; v_complete boolean; v_review jsonb; v_inputs jsonb;
  v_identity text[] := array['id','generatedFromDeliverable','workflowStepId','workflowStepOrder','workflowStepRequired','workflowTemplateId','workflowTemplateRevision','predecessorTaskIds','clientId','serviceCycleId','deliverableId','department','visibility'];
  v_output text[] := array['title','description','notes','attachmentLink','attachmentName','status','isCompleted','revisionCount'];
begin
  if new.entity_type='service_cycle' and tg_op='UPDATE' and old.data->'serviceItems' is distinct from new.data->'serviceItems'
    and exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'serviceCycleId'=new.entity_id and coalesce((task.data->>'generatedFromDeliverable')::boolean,false)) then
    raise check_violation using message='A generated workflow keeps its frozen service items.';
  end if;
  if new.entity_type='deliverable' then
    if tg_op='UPDATE' and exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'deliverableId'=new.entity_id and coalesce((task.data->>'generatedFromDeliverable')::boolean,false))
      and exists(select 1 from unnest(array['clientId','cycleId','serviceItemId','planId']) field where old.data->field is distinct from new.data->field) then
      raise check_violation using message='A generated workflow keeps its frozen deliverable identity.';
    end if;
    if new.data->>'status'='Delivered' and not private.aitask_workflow_deliverable_ready(new.workspace_id,new.data) then
      raise check_violation using message='Every required workflow step and internal review must be approved before delivery.';
    end if;
  end if;
  if new.entity_type<>'task' then return new; end if;
  if tg_op='UPDATE' then
    v_before := old.data;
    if (coalesce((old.data->>'generatedFromDeliverable')::boolean,false) or coalesce(old.data->>'workflowStepId','')<>'')
      and exists(select 1 from unnest(v_identity) field where old.data->field is distinct from new.data->field) then
      raise check_violation using message='Workflow identity and review records cannot be edited directly.';
    end if;
    if not coalesce((old.data->>'generatedFromDeliverable')::boolean,false) and coalesce(old.data->>'workflowStepId','')=''
      and (coalesce((new.data->>'generatedFromDeliverable')::boolean,false) or coalesce(new.data->>'workflowStepId','')<>'') then
      raise check_violation using message='Existing tasks cannot be promoted into a frozen workflow.';
    end if;
    v_counter := coalesce((old.data->>'workflowOutputVersion')::bigint,1);
    v_output_changed := exists(select 1 from unnest(v_output) field where coalesce(old.data->field,'""'::jsonb) is distinct from coalesce(new.data->field,'""'::jsonb));
    if v_output_changed then v_counter := v_counter+1; end if;
  end if;
  if not coalesce((new.data->>'generatedFromDeliverable')::boolean,false) and coalesce(new.data->>'workflowStepId','')='' then
    new.data := new.data-array['workflowStepKind','workflowOutputVersion','workflowDependenciesReady','internalReview'];
    return new;
  end if;
  v_step := private.aitask_workflow_step(new.workspace_id,new.data);
  if v_step is null or coalesce(v_step->>'kind','') not in ('work','internal_review','client_approval','publishing')
    or new.data->>'id' is distinct from new.entity_id
    or v_step->>'order' is distinct from new.data->>'workflowStepOrder'
    or v_step->>'required' is distinct from new.data->>'workflowStepRequired'
    or private.aitask_task_department(v_step->>'department') is distinct from private.aitask_task_department(new.data->>'department')
    or (case when (v_step->>'clientVisible')::boolean then 'client-visible' else 'internal' end) is distinct from new.data->>'visibility' then
    raise check_violation using message='Workflow task does not match its frozen step.';
  end if;
  v_actor := private.aitask_member_id(new.workspace_id);
  if tg_op='INSERT' then
    if v_actor is null or not private.aitask_has_permission(new.workspace_id,'manageServiceCycles')
      or not private.aitask_can_access_service_client(new.workspace_id,new.data->>'clientId') then
      raise check_violation using message='Workflow generation permission is required.';
    end if;
    if exists(select 1 from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'deliverableId'=new.data->>'deliverableId' and task.data->>'workflowStepId'=new.data->>'workflowStepId') then
      raise check_violation using message='The frozen workflow step already exists.';
    end if;
    select step.value into v_previous_step
    from public.aitask_entities cycle
    cross join lateral jsonb_array_elements(cycle.data->'serviceItems') item(value)
    cross join lateral jsonb_array_elements(item.value->'workflow'->'steps') step(value)
    where cycle.workspace_id=new.workspace_id and cycle.entity_type='service_cycle' and cycle.entity_id=new.data->>'serviceCycleId'
      and item.value->'workflow'->>'templateId'=new.data->>'workflowTemplateId'
      and item.value->'workflow'->>'templateRevision'=new.data->>'workflowTemplateRevision'
      and item.value->>'id'=(select output.data->>'serviceItemId' from public.aitask_entities output
        where output.workspace_id=new.workspace_id and output.entity_type='deliverable' and output.entity_id=new.data->>'deliverableId')
      and (step.value->>'order')::integer<(v_step->>'order')::integer
    order by (step.value->>'order')::integer desc limit 1;
    if v_previous_step is null then
      if coalesce(new.data->'predecessorTaskIds','[]'::jsonb)<>'[]'::jsonb then raise check_violation using message='Invalid workflow predecessors.'; end if;
    else
      select entity_id into v_previous_task from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
        and task.data->>'deliverableId'=new.data->>'deliverableId' and task.data->>'workflowStepId'=v_previous_step->>'id';
      if v_previous_task is null or new.data->'predecessorTaskIds' is distinct from jsonb_build_array(v_previous_task) then
        raise check_violation using message='Invalid workflow predecessors.';
      end if;
    end if;
  end if;
  v_ready := private.aitask_workflow_dependencies_ready(new.workspace_id,new.data);
  v_complete := coalesce((new.data->>'isCompleted')::boolean,false) or new.data->>'status'='Completed';
  if (v_complete or new.data->>'status'='Waiting Approval') and not v_ready then
    raise check_violation using message='Complete every required predecessor before submitting or completing this step.';
  end if;
  if v_step->>'kind'='internal_review' and v_complete then
    if tg_op='INSERT' or v_output_changed or not private.aitask_workflow_task_satisfied(new.workspace_id,v_before) then
      if v_actor is null or not (
        private.aitask_is_super_admin(new.workspace_id)
        or (private.aitask_is_hod(new.workspace_id) and exists(select 1 from public.aitask_members member
          where member.workspace_id=new.workspace_id and member.id=v_actor and private.aitask_task_department(v_step->>'department')=any(member.departments)))
        or (private.aitask_member_role(new.workspace_id)='Project Manager' and private.aitask_has_permission(new.workspace_id,'manageServiceCycles')
          and private.aitask_can_edit_task(new.workspace_id,new.entity_id))
      ) then raise check_violation using message='Only the department HOD, responsible Project Manager or Boss Koo can approve internal review.'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('taskId',task.entity_id,'outputVersion',coalesce((task.data->>'workflowOutputVersion')::bigint,1)) order by task.entity_id),'[]'::jsonb) into v_inputs
      from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
        and coalesce(new.data->'predecessorTaskIds','[]'::jsonb) ? task.entity_id;
      v_review := jsonb_build_object('decisionId',gen_random_uuid()::text,'reviewedBy',v_actor,'reviewedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'inputVersions',v_inputs);
    else v_review := old.data->'internalReview'; end if;
  end if;
  if tg_op='UPDATE' and not v_output_changed and v_review is distinct from old.data->'internalReview' then v_counter := v_counter+1; end if;
  if v_review is not null and (tg_op='INSERT' or v_review is distinct from old.data->'internalReview') then
    insert into private.aitask_internal_review_decisions(decision_id,workspace_id,task_id,output_version,reviewer_id,reviewed_at,input_versions)
    values((v_review->>'decisionId')::uuid,new.workspace_id,new.entity_id,v_counter,v_actor,(v_review->>'reviewedAt')::timestamptz,v_inputs);
  end if;
  new.data := new.data-array['workflowStepKind','workflowOutputVersion','workflowDependenciesReady','internalReview'];
  new.data := new.data||jsonb_build_object('workflowStepKind',v_step->>'kind','workflowOutputVersion',v_counter);
  if v_review is not null then new.data := new.data||jsonb_build_object('internalReview',v_review); end if;
  return new;
end;
$$;
create trigger aitask_zz_guard_workflow_task before insert or update on public.aitask_entities
for each row execute function private.aitask_guard_workflow_task();

create or replace function private.aitask_reopen_workflow_dependents()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.entity_type<>'task' or (not coalesce((new.data->>'generatedFromDeliverable')::boolean,false) and coalesce(new.data->>'workflowStepId','')='')
    or coalesce((old.data->>'workflowOutputVersion')::bigint,1)=coalesce((new.data->>'workflowOutputVersion')::bigint,1) then return new; end if;
  with recursive descendants(id) as (
    select task.entity_id from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task'
      and task.data->>'deliverableId'=new.data->>'deliverableId' and coalesce(task.data->'predecessorTaskIds','[]'::jsonb) ? new.entity_id
    union
    select task.entity_id from public.aitask_entities task join descendants parent on coalesce(task.data->'predecessorTaskIds','[]'::jsonb) ? parent.id
      where task.workspace_id=new.workspace_id and task.entity_type='task' and task.data->>'deliverableId'=new.data->>'deliverableId'
  )
  update public.aitask_entities task set data=(task.data-array['internalReview','completedAt'])||jsonb_build_object(
    'status','Pending','isCompleted',false,'clientApprovalStatus','Pending','completionPercentage',least(coalesce((task.data->>'completionPercentage')::integer,0),90))
  where task.workspace_id=new.workspace_id and task.entity_type='task' and task.entity_id in(select id from descendants)
    and (task.data->>'status' in ('Completed','Waiting Approval') or coalesce((task.data->>'isCompleted')::boolean,false) or task.data ? 'internalReview');
  return new;
end;
$$;
create trigger aitask_a_reopen_workflow_dependents after update on public.aitask_entities
for each row execute function private.aitask_reopen_workflow_dependents();

-- Read-only summaries expose readiness, never hidden predecessor details.
create or replace function public.aitask_get_workflow_task_context(p_workspace_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_tasks jsonb;
begin
  if (select auth.uid()) is null or private.aitask_member_id(p_workspace_id) is null or private.aitask_member_role(p_workspace_id)='Client' then
    return jsonb_build_object('ok',false,'code','FORBIDDEN');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',task.entity_id,
    'workflowStepKind',private.aitask_workflow_step(p_workspace_id,task.data)->>'kind',
    'workflowOutputVersion',coalesce((task.data->>'workflowOutputVersion')::bigint,1),
    'workflowDependenciesReady',private.aitask_workflow_dependencies_ready(p_workspace_id,task.data),
    'internalReview',case when private.aitask_workflow_task_satisfied(p_workspace_id,task.data) then task.data->'internalReview' else null end) order by task.entity_id),'[]'::jsonb) into v_tasks
  from public.aitask_entities task where task.workspace_id=p_workspace_id and task.entity_type='task'
    and (coalesce((task.data->>'generatedFromDeliverable')::boolean,false) or coalesce(task.data->>'workflowStepId','')<>'')
    and private.aitask_can_view_task(p_workspace_id,task.entity_id);
  return jsonb_build_object('ok',true,'tasks',v_tasks);
end;
$$;
revoke all on function public.aitask_get_workflow_task_context(text) from public,anon;
grant execute on function public.aitask_get_workflow_task_context(text) to authenticated,service_role;
revoke all on function private.aitask_workflow_step(text,jsonb), private.aitask_workflow_task_satisfied(text,jsonb),
  private.aitask_workflow_dependencies_ready(text,jsonb), private.aitask_workflow_deliverable_ready(text,jsonb), private.aitask_guard_workflow_task(), private.aitask_reopen_workflow_dependents()
from public,anon,authenticated,service_role;

-- Preserve function identities and grants while tightening deletion and
-- rejecting old clients until their backend supports canonical review gates.
do $$
declare definition text; anchor text;
begin
  definition := pg_get_functiondef('private.aitask_can_delete_task(text,text)'::regprocedure);
  anchor := 'select private.aitask_can_edit_task(p_workspace_id, p_task_id)';
  if position(anchor in definition)=0 then raise exception 'Task deletion guard anchor is missing.'; end if;
  execute replace(definition,anchor,anchor||'
      and (not coalesce((task.data->>''generatedFromDeliverable'')::boolean,false) and coalesce(task.data->>''workflowStepId'','''')=''''
        or exists(select 1 from public.aitask_entities cycle where cycle.workspace_id=p_workspace_id and cycle.entity_type=''service_cycle''
          and cycle.entity_id=task.data->>''serviceCycleId'' and cycle.data->>''status''=''Cancelled''))');
  definition := pg_get_functiondef('public.aitask_get_backend_capabilities(text)'::regprocedure);
  if position('''schemaVersion'', 4' in definition)=0 then raise exception 'Backend capability anchor is missing.'; end if;
  execute replace(definition,'''schemaVersion'', 4','''schemaVersion'', 5, ''workflowReviewGate'', true');
  definition := pg_get_functiondef('private.aitask_refresh_service_progress()'::regprocedure);
  anchor := 'coalesce((task.data->>''isCompleted'')::boolean,false) or task.data->>''status''=''Completed''';
  if position(anchor in definition)=0 then raise exception 'Service progress completion anchor is missing.'; end if;
  execute replace(definition,anchor,'private.aitask_workflow_task_satisfied(v_workspace,task.data)');
end;
$$;
