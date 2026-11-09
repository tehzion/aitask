-- HOD-approved ordinary work is unfinished at 80%, but its approval still
-- depends on its upstream output. Invalidate it with signed reviews and final
-- completions when the server increments an upstream output version.
-- Keep installations without the optional frozen workflow extension supported.
do $migration$
begin
 if to_regprocedure('private.aitask_reopen_workflow_dependents()') is not null then
  execute $definition$
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
    and (task.data->>'status' in ('Approved','Completed','Waiting Approval') or coalesce((task.data->>'isCompleted')::boolean,false) or task.data ? 'internalReview');
  return new;
end;
$$;
$definition$;
 end if;
end;
$migration$;

-- Align signed-workflow output versioning with the permitted completed-note edit.
do $migration$
begin
 if to_regprocedure('private.aitask_guard_workflow_task()') is not null then
  execute $definition$
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
    -- Completed private notes are editable operational metadata, consistent
    -- with the stage guard; they cannot replace output or sign a new decision.
    if old.data->>'status'='Completed' and new.data->>'status'='Completed' then
      v_output := array_remove(v_output,'notes');
    end if;
    v_output_changed := exists(select 1 from unnest(v_output) field where coalesce(old.data->>field,'') is distinct from coalesce(new.data->>field,''));
    -- Final PM confirmation changes the stage, not the approved output/signature.
    if old.data->>'status'='Approved' and new.data->>'status'='Completed'
      and not exists(select 1 from unnest(array['title','description','notes','attachmentLink','attachmentName','revisionCount']) field where coalesce(old.data->>field,'') is distinct from coalesce(new.data->>field,'')) then
      v_output_changed:=false;
    end if;
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
  v_complete := coalesce((new.data->>'isCompleted')::boolean,false) or new.data->>'status' in ('Approved','Completed');
  if (v_complete or new.data->>'status'='Waiting Approval') and not v_ready then
    raise check_violation using message='Complete every required predecessor before submitting or completing this step.';
  end if;
  if v_step->>'kind'='internal_review' and v_complete then
    if tg_op='INSERT' or v_output_changed or not private.aitask_workflow_task_satisfied(new.workspace_id,v_before||jsonb_build_object('status','Completed','isCompleted',true)) then
      if v_actor is null or not (
        private.aitask_is_super_admin(new.workspace_id)
        or (private.aitask_is_hod(new.workspace_id) and exists(select 1 from public.aitask_members member
          where member.workspace_id=new.workspace_id and member.id=v_actor and private.aitask_task_department(v_step->>'department')=any(member.departments)))
      ) then raise check_violation using message='Only the department HOD or Boss Koo can approve internal review.'; end if;
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
$definition$;
 end if;
end;
$migration$;

-- Allow only the tightly constrained server dependency reset through the Staff
-- transition guard; direct withdrawal and all approval checks remain enforced.
create or replace function private.aitask_guard_task_stage_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_hod boolean := private.aitask_is_hod(new.workspace_id) and private.aitask_member_role(new.workspace_id) in ('Staff','HOD');
  v_boss boolean := private.aitask_is_super_admin(new.workspace_id);
  v_changed boolean := v_old->>'status' is distinct from new.data->>'status';
  v_percent integer;
  v_system_reopen boolean := false;
begin
  if new.entity_type <> 'task' then return new; end if;
  -- A dependency trigger may withdraw stale downstream review. A direct API
  -- update cannot obtain trigger depth > 1, and every non-reset field must stay
  -- identical. This exception permits no assignee, identity or output change.
  if tg_op='UPDATE' and pg_trigger_depth()>1
    and (coalesce((v_old->>'generatedFromDeliverable')::boolean,false) or coalesce(v_old->>'workflowStepId','')<>'')
    and v_old->>'status' in ('Waiting Approval','Approved','Completed')
    and new.data->>'status'='Pending'
    and new.data->>'isCompleted'='false' and new.data->>'clientApprovalStatus'='Pending'
    and (v_old-array['status','isCompleted','clientApprovalStatus','completionPercentage','internalReview','completedAt'])
      = (new.data-array['status','isCompleted','clientApprovalStatus','completionPercentage','internalReview','completedAt']) then
    v_system_reopen := true;
  end if;

  if v_actor is not null and v_role <> 'Client' then
    if v_old->>'status' in ('Approved','Completed') and new.data->>'status' in ('Approved','Completed')
      and exists(select 1 from unnest(case when v_old->>'status'='Approved'
        then array['title','description','notes','attachmentLink','attachmentName'] else array['title','description','attachmentLink','attachmentName'] end) field
        where coalesce(v_old->>field,'') is distinct from coalesce(new.data->>field,'')) then
      raise check_violation using message='Ask the HOD or project manager to return approved work for revision.';
    end if;
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
    if v_role='Staff' and not v_hod and not v_boss and not v_system_reopen and (
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
    elsif new.data->>'status' in ('In Progress','Revision') and v_changed and v_old->>'status' in ('Waiting Approval','Approved','Completed') then
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
