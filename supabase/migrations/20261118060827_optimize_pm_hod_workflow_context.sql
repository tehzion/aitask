-- PM and HOD workspace loading calls this projection after the scoped entity
-- snapshot. The previous implementation evaluated every review/workflow helper
-- several times for every visible task, including ordinary Pending, In Progress
-- and Completed work. On the production-sized workspace this touched tens of
-- thousands of cached blocks and took about one second per refresh.
--
-- Materialize visible tasks and each derived value once. Expensive review
-- evidence is needed only while a task is awaiting review or when it belongs to
-- a generated workflow. Ordinary task output remains in task/deliverable rows.
create or replace function public.aitask_get_workflow_task_context(p_workspace_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tasks jsonb;
  v_actor text := private.aitask_member_id(p_workspace_id);
begin
  if (select auth.uid()) is null
    or v_actor is null
    or private.aitask_member_role(p_workspace_id) = 'Client' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  with visible_tasks as materialized (
    select task.entity_id, task.data
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and private.aitask_can_view_task(p_workspace_id, task.entity_id)
  ), evaluated as materialized (
    select
      task.entity_id,
      task.data,
      case when task.data ->> 'status' = 'Waiting Approval'
          or task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> ''
        then private.aitask_task_review_input_links(p_workspace_id, task.data)
        else '[]'::jsonb
      end as input_links,
      case when task.data ->> 'status' = 'Waiting Approval'
          or task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> ''
        then private.aitask_task_review_input_files(p_workspace_id, task.data)
        else '[]'::jsonb
      end as input_files,
      case when task.data ->> 'status' = 'Waiting Approval'
          or task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> ''
        then private.aitask_task_review_attachments(p_workspace_id, task.data)
        else '[]'::jsonb
      end as review_attachments,
      -- Revision authority for approved/completed legacy work also derives
      -- from this actor-bound projection, so it must remain available at every
      -- task stage even though evidence loading can stay lazy.
      private.aitask_can_sign_task_review(p_workspace_id, task.data) as can_approve,
      case when task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> ''
        then private.aitask_workflow_step(p_workspace_id, task.data) ->> 'kind'
        else null
      end as workflow_step_kind,
      case when task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> ''
        then private.aitask_workflow_dependencies_ready(p_workspace_id, task.data)
        else true
      end as workflow_dependencies_ready,
      case when (task.data ->> 'generatedFromDeliverable' = 'true'
          or coalesce(task.data ->> 'workflowStepId', '') <> '')
          and task.data ->> 'status' in ('Approved', 'Completed')
        then private.aitask_workflow_task_satisfied(
          p_workspace_id,
          task.data || jsonb_build_object('status', 'Completed', 'isCompleted', true)
        )
        else false
      end as internal_review_satisfied
    from visible_tasks task
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', task.entity_id,
    'reviewAccess', jsonb_build_object(
      'actorId', v_actor,
      'canReadInputs', jsonb_array_length(task.input_links) > 0
        or jsonb_array_length(task.input_files) > 0,
      'expiresAt', task.data -> 'reviewCover' -> 'expiresAt',
      'canApprove', task.can_approve
    ),
    'reviewEvidence', jsonb_build_object(
      'actorId', v_actor,
      'attachments', task.review_attachments,
      'links', task.input_links
    ),
    'workflowStepKind', task.workflow_step_kind,
    'workflowOutputVersion', case when task.data ->> 'generatedFromDeliverable' = 'true'
        or coalesce(task.data ->> 'workflowStepId', '') <> ''
      then coalesce((task.data ->> 'workflowOutputVersion')::bigint, 1)
      else null
    end,
    'workflowDependenciesReady', task.workflow_dependencies_ready,
    'internalReview', case when task.internal_review_satisfied
      then task.data -> 'internalReview'
      else null
    end
  ) order by task.entity_id), '[]'::jsonb)
  into v_tasks
  from evaluated task;

  return jsonb_build_object('ok', true, 'tasks', v_tasks);
end;
$$;

revoke all on function public.aitask_get_workflow_task_context(text) from public, anon;
grant execute on function public.aitask_get_workflow_task_context(text) to authenticated, service_role;

-- The FK advisor checks deletion/update paths by the referenced Auth user. The
-- existing unique index starts with workspace_id and cannot serve that lookup.
create index if not exists aitask_tutorial_feedback_auth_user_idx
  on public.aitask_tutorial_feedback(auth_user_id);
