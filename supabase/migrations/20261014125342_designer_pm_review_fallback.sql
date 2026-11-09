-- Designer review temporarily belongs to portfolio PMs when no HOD is configured.
-- HOD departments retain their existing review audience. No global PM authority.
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
    and private.aitask_task_department(p_task->>'department')='Designer'
    and not exists(select 1 from hods)
    and (member.is_super_admin or member.id in (p_task->>'createdBy',p_task->>'assignedTo')
      or exists(select 1 from public.aitask_entities client where client.workspace_id=p_workspace
        and client.entity_type='client' and client.created_by=member.id
        and client.client_key=lower(btrim(coalesce(p_task->>'clientName',''))))
      or exists(select 1 from public.aitask_entities project where project.workspace_id=p_workspace
        and project.entity_type='project' and project.entity_id=p_task->>'projectId' and project.created_by=member.id));
$$;
revoke all on function private.aitask_task_reviewers(text,jsonb) from public,anon,authenticated;

-- Patch only the review permission predicates, retaining all stage/evidence guards.
do $migration$
declare
  v_definition text;
  v_anchor text;
begin
  v_definition:=pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  v_anchor:='v_old->>''status'' = ''Waiting Approval'' and (v_boss or (v_hod and exists (';
  if position(v_anchor in v_definition)=0 then raise exception 'Task stage review anchor is missing'; end if;
  v_anchor:='if new.data->>''status'' = ''Approved'' and v_changed and not (';
  if position(v_anchor in v_definition)=0 then raise exception 'Approval assignment anchor is missing'; end if;
  v_definition:=replace(v_definition,v_anchor,
    'if v_changed and new.data->>''status'' in (''Approved'',''Completed'') and (v_old->>''assignedTo'' is distinct from new.data->>''assignedTo'' or v_old->>''department'' is distinct from new.data->>''department'') then raise check_violation using message=''Reassign work before submitting it for review.''; end if; '||v_anchor);
  v_anchor:='v_old->>''status'' = ''Waiting Approval'' and (v_boss or (v_hod and exists (';
  v_definition:=replace(v_definition,'Only the department HOD can approve submitted work.','Only the department reviewer can approve submitted work.');
  v_definition:=replace(v_definition,'Only a project manager can confirm completion after HOD approval.','Only a project manager can confirm completion after internal approval.');
  execute replace(v_definition,v_anchor,
    'v_old->>''status'' = ''Waiting Approval'' and (v_boss or (v_role=''Project Manager'' and exists(select 1 from private.aitask_task_reviewers(new.workspace_id,v_old) reviewer where reviewer.id=v_actor)) or (v_hod and exists (');
  v_definition:=pg_get_functiondef('private.aitask_guard_workflow_task()'::regprocedure);
  v_definition:=replace(v_definition,'Only the department HOD or Boss Koo can approve internal review.','Only the authorized department reviewer or Boss Koo can approve internal review.');
  v_anchor:='private.aitask_is_super_admin(new.workspace_id)';
  if position(v_anchor in v_definition)=0 then raise exception 'Workflow review anchor is missing'; end if;
  execute replace(v_definition,v_anchor,v_anchor || ' or (private.aitask_member_role(new.workspace_id)=''Project Manager'' and exists(select 1 from private.aitask_task_reviewers(new.workspace_id,new.data) reviewer where reviewer.id=v_actor))');
end;
$migration$;

create or replace function private.aitask_notify_hod_review_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_recipient record;
  v_id text;
  v_server_notification text := current_setting('aitask.server_notification', true);
begin
  if v_actor is null or private.aitask_member_role(new.workspace_id) = 'Client'
    or new.data->>'status' is distinct from 'Waiting Approval'
    or (tg_op='UPDATE' and old.data->>'status' is not distinct from new.data->>'status') then
    return new;
  end if;

  if not exists(select 1 from private.aitask_task_reviewers(new.workspace_id,new.data)) then
    raise check_violation using message='No reviewer is configured for this task. Ask your project manager to configure a reviewer before submitting.';
  end if;

  for v_recipient in
    select reviewer.id from private.aitask_task_reviewers(new.workspace_id,new.data) reviewer where reviewer.id<>v_actor
  loop
    v_id := 'N-hod-review-' || replace(gen_random_uuid()::text, '-', '');
    perform set_config('aitask.server_notification', 'true', true);
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
    values (new.workspace_id, 'notification', v_id, new.entity_id, jsonb_build_object(
      'id', v_id, 'targetUserId', v_recipient.id,
      'title', 'Task Ready for Approval',
      'message', '"' || left(coalesce(new.data->>'title', 'Task'), 160) || '" is ready for department review.',
      'route', jsonb_build_object('page', 'tasks', 'entityId', new.entity_id),
      'iconType', 'status', 'isRead', false, 'readByUserIds', jsonb_build_array(),
      'createdAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end loop;
  perform set_config('aitask.server_notification', coalesce(v_server_notification, 'false'), true);
  return new;
end;
$$;

revoke all on function private.aitask_notify_hod_review_submission() from public, anon, authenticated;
-- Actor-bound summaries include ordinary tasks; the browser cannot infer missing
-- HODs from a scoped directory. Approved signed reviews remain visible at 80%.
create or replace function public.aitask_get_workflow_task_context(p_workspace_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_tasks jsonb; v_actor text:=private.aitask_member_id(p_workspace_id);
begin
  if (select auth.uid()) is null or v_actor is null or private.aitask_member_role(p_workspace_id)='Client' then
    return jsonb_build_object('ok',false,'code','FORBIDDEN');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',task.entity_id,
    'reviewAccess',jsonb_build_object('actorId',v_actor,'canApprove',private.aitask_can_edit_task(p_workspace_id,task.entity_id)
      and (private.aitask_is_super_admin(p_workspace_id) or exists(select 1 from private.aitask_task_reviewers(p_workspace_id,task.data) reviewer where reviewer.id=v_actor))),
    'workflowStepKind',private.aitask_workflow_step(p_workspace_id,task.data)->>'kind',
    'workflowOutputVersion',case when task.data->>'generatedFromDeliverable'='true' or coalesce(task.data->>'workflowStepId','')<>'' then coalesce((task.data->>'workflowOutputVersion')::bigint,1) else null end,
    'workflowDependenciesReady',private.aitask_workflow_dependencies_ready(p_workspace_id,task.data),
    'internalReview',case when task.data->>'status' in ('Approved','Completed')
      and private.aitask_workflow_task_satisfied(p_workspace_id,task.data||jsonb_build_object('status','Completed','isCompleted',true)) then task.data->'internalReview' else null end) order by task.entity_id),'[]'::jsonb) into v_tasks
  from public.aitask_entities task where task.workspace_id=p_workspace_id and task.entity_type='task'
    and private.aitask_can_view_task(p_workspace_id,task.entity_id);
  return jsonb_build_object('ok',true,'tasks',v_tasks);
end;
$$;
revoke all on function public.aitask_get_workflow_task_context(text) from public,anon;
grant execute on function public.aitask_get_workflow_task_context(text) to authenticated,service_role;

-- Notify responsible PMs about already-waiting Designer work without changing
-- the task, assignment, review decision or completion stage. Safe to rerun.
do $backfill$
declare v_task record; v_reviewer record; v_id text;
  v_server_notification text:=current_setting('aitask.server_notification',true);
begin
  for v_task in select workspace_id,entity_id,data from public.aitask_entities
    where entity_type='task' and data->>'status'='Waiting Approval'
      and private.aitask_task_department(data->>'department')='Designer'
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
