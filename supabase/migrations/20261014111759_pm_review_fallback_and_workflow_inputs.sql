-- Responsible PMs cover every department without an HOD. Existing HOD
-- departments keep their review authority; portfolio boundaries still apply.
create or replace function private.aitask_task_reviewers(p_workspace text, p_task jsonb)
returns table(id text) language sql stable security definer set search_path='' as $$
  with hods as (
    select member.id from public.aitask_members member
    where member.workspace_id=p_workspace and member.role in ('HOD','Staff')
      and (member.role='HOD' or member.custom_role_id='builtin-hod')
      and private.aitask_task_department(p_task->>'department')=any(member.departments)
  )
  select id from hods
  union
  select member.id from public.aitask_members member
  where member.workspace_id=p_workspace and member.role='Project Manager'
    and private.aitask_task_department(p_task->>'department') is not null
    and not exists(select 1 from hods)
    and (member.is_super_admin or member.id in (p_task->>'createdBy',p_task->>'assignedTo')
      or exists(select 1 from public.aitask_entities client where client.workspace_id=p_workspace
        and client.entity_type='client' and client.created_by=member.id
        and client.client_key=lower(btrim(coalesce(p_task->>'clientName',''))))
      or exists(select 1 from public.aitask_entities project where project.workspace_id=p_workspace
        and project.entity_type='project' and project.entity_id=p_task->>'projectId' and project.created_by=member.id));
$$;
revoke all on function private.aitask_task_reviewers(text,jsonb) from public,anon,authenticated,service_role;

-- Preserve the existing signed-decision/output-version checks as the local
-- predicate. A skipped optional step must also satisfy its frozen ancestors.
do $migration$
declare v_definition text; v_anchor text:='private.aitask_workflow_task_satisfied(';
begin
  v_definition:=pg_get_functiondef('private.aitask_workflow_task_satisfied(text,jsonb)'::regprocedure);
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one workflow satisfaction definition';
  end if;
  execute replace(v_definition,v_anchor,'private.aitask_workflow_task_locally_satisfied(');
end;
$migration$;
revoke all on function private.aitask_workflow_task_locally_satisfied(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_workflow_task_satisfied(p_workspace text,p_task jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if not private.aitask_workflow_task_locally_satisfied(p_workspace,p_task) then return false; end if;
  if not (coalesce((p_task->>'generatedFromDeliverable')::boolean,false) or coalesce(p_task->>'workflowStepId','')<>'') then return true; end if;
  return not exists (
    with recursive inputs(data,path,invalid) as (
      select p_task,array[coalesce(p_task->>'id','')],false
      union all
      select input.data,prior.path||dependency.id,
        input.entity_id is null or dependency.id=any(prior.path) or cardinality(prior.path)>=256
        or input.data->>'clientId' is distinct from p_task->>'clientId'
        or input.data->>'deliverableId' is distinct from p_task->>'deliverableId'
        or input.data->>'serviceCycleId' is distinct from p_task->>'serviceCycleId'
      from inputs prior
      cross join lateral jsonb_array_elements_text(coalesce(prior.data->'predecessorTaskIds','[]'::jsonb)) dependency(id)
      left join public.aitask_entities input on input.workspace_id=p_workspace and input.entity_type='task' and input.entity_id=dependency.id
      where not prior.invalid
    )
    select 1 from inputs where invalid or not private.aitask_workflow_task_locally_satisfied(p_workspace,data)
  );
end;
$$;
revoke all on function private.aitask_workflow_task_satisfied(text,jsonb) from public,anon,authenticated,service_role;

-- A frozen internal review receives only completed input output links. It does
-- not expose the earlier task's brief, title, notes, clients or pricing.
create or replace function private.aitask_task_review_input_links(p_workspace text,p_task jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('taskId',input.entity_id,
    'url',btrim(input.data->>'attachmentLink'),'name',coalesce(nullif(btrim(input.data->>'attachmentName'),''),'Output'),
    'outputVersion',coalesce((input.data->>'workflowOutputVersion')::bigint,1)) order by input.entity_id),'[]'::jsonb)
  from public.aitask_entities input
  where (select auth.uid()) is not null and private.aitask_can_view_task(p_workspace,p_task->>'id')
    and private.aitask_workflow_step(p_workspace,p_task)->>'kind'='internal_review'
    and (private.aitask_is_super_admin(p_workspace)
      or (private.aitask_member_role(p_workspace)='Project Manager' and private.aitask_can_edit_task(p_workspace,p_task->>'id'))
      or exists(select 1 from private.aitask_task_reviewers(p_workspace,p_task) reviewer where reviewer.id=private.aitask_member_id(p_workspace))
      or (p_task->>'assignedTo'=private.aitask_member_id(p_workspace) and private.aitask_can_edit_task(p_workspace,p_task->>'id')))
    and input.workspace_id=p_workspace and input.entity_type='task'
    and coalesce(p_task->'predecessorTaskIds','[]'::jsonb) ? input.entity_id
    and input.data->>'clientId'=p_task->>'clientId'
    and input.data->>'deliverableId'=p_task->>'deliverableId'
    and input.data->>'serviceCycleId'=p_task->>'serviceCycleId'
    and private.aitask_workflow_task_satisfied(p_workspace,input.data)
    and length(btrim(coalesce(input.data->>'attachmentLink','')))<=2048
    and btrim(coalesce(input.data->>'attachmentLink','')) ~* '^https://[^/?#@[:space:]\\]+([/?#][^[:space:]\\]*)?$';
$$;
revoke all on function private.aitask_task_review_input_links(text,jsonb) from public,anon,authenticated,service_role;

do $migration$
declare v_definition text; v_anchor text;
begin
  v_definition:=pg_get_functiondef('public.aitask_get_workflow_task_context(text)'::regprocedure);
  v_anchor:=$anchor$'actorId',v_actor,'canApprove'$anchor$;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one task review permission projection';
  end if;
  v_definition:=replace(v_definition,v_anchor,$projection$'actorId',v_actor,'canReadInputs',jsonb_array_length(private.aitask_task_review_input_links(p_workspace_id,task.data))>0,'canApprove'$projection$);
  v_anchor:=$anchor$'attachments',private.aitask_task_review_attachments(p_workspace_id,task.data)$anchor$;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one task evidence projection';
  end if;
  execute replace(v_definition,v_anchor,v_anchor||$projection$,'links',private.aitask_task_review_input_links(p_workspace_id,task.data)$projection$);
  v_definition:=pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  v_anchor:='if not v_evidence then';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one task evidence check';
  end if;
  execute replace(v_definition,v_anchor,'v_evidence := v_evidence or jsonb_array_length(private.aitask_task_review_input_links(new.workspace_id,new.data))>0; '||v_anchor);
end;
$migration$;

-- Notify newly covered PMs without changing task decisions.
do $backfill$
declare v_task record; v_reviewer record; v_id text;
  v_server_notification text:=current_setting('aitask.server_notification',true);
begin
  for v_task in select workspace_id,entity_id,data from public.aitask_entities
    where entity_type='task' and data->>'status'='Waiting Approval'

  loop
    for v_reviewer in select reviewer.id from private.aitask_task_reviewers(v_task.workspace_id,v_task.data) reviewer
      join public.aitask_members member on member.workspace_id=v_task.workspace_id and member.id=reviewer.id
      where member.role='Project Manager'
        and not exists(select 1 from public.aitask_entities notice where notice.workspace_id=v_task.workspace_id
          and notice.entity_type='notification' and notice.parent_id=v_task.entity_id
          and notice.data->>'targetUserId'=reviewer.id and notice.data->>'title'='Task Ready for Approval')
    loop
      v_id:='N-pm-review-'||replace(gen_random_uuid()::text,'-','');
      perform set_config('aitask.server_notification','true',true);
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(v_task.workspace_id,'notification',v_id,v_task.entity_id,jsonb_build_object('id',v_id,'targetUserId',v_reviewer.id,
        'title','Task Ready for Approval','message','"'||left(coalesce(v_task.data->>'title','Task'),160)||'" is ready for department review.',
        'route',jsonb_build_object('page','tasks','entityId',v_task.entity_id),'iconType','status','isRead',false,'readByUserIds','[]'::jsonb,
        'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    end loop;
  end loop;
  perform set_config('aitask.server_notification',coalesce(v_server_notification,'false'),true);
end;
$backfill$;
