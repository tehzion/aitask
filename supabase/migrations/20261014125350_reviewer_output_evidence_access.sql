-- Department reviewers need linked output files without a personal service
-- assignment. This projection grants no service writes or pricing access.
create or replace function private.aitask_task_review_attachments(p_workspace text,p_task jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'id',attachment->>'id','bucket',attachment->>'bucket','path',attachment->>'path',
    'fileName',coalesce(case when jsonb_typeof(attachment->'fileName')='string' then nullif(btrim(attachment->>'fileName'),'') end,substring(attachment->>'path' from '[^/]+$')),
    'mimeType',case when jsonb_typeof(attachment->'mimeType')='string' then attachment->>'mimeType' else 'application/octet-stream' end,
    'sizeBytes',case when jsonb_typeof(attachment->'sizeBytes')='number' then attachment->'sizeBytes' else '0'::jsonb end,
    'uploadedBy',case when jsonb_typeof(attachment->'uploadedBy')='string' then attachment->>'uploadedBy' else '' end,
    'uploadedAt',case when jsonb_typeof(attachment->'uploadedAt')='string' then attachment->>'uploadedAt' else '' end)),'[]'::jsonb)
  from public.aitask_entities output
  cross join lateral jsonb_array_elements(case when jsonb_typeof(output.data->'attachments')='array' then output.data->'attachments' else '[]'::jsonb end) attachment
  join storage.objects object on object.bucket_id='client-service-files' and object.name=attachment->>'path'
  where (select auth.uid()) is not null
    and private.aitask_can_view_task(p_workspace,p_task->>'id')
    and (private.aitask_is_super_admin(p_workspace)
      or exists(select 1 from private.aitask_task_reviewers(p_workspace,p_task) reviewer where reviewer.id=private.aitask_member_id(p_workspace)))
    and output.workspace_id=p_workspace and output.entity_type='deliverable'
    and output.client_id=p_task->>'clientId'
    and (nullif(p_task->>'serviceCycleId','') is null or output.cycle_id=p_task->>'serviceCycleId')
    and (output.entity_id=p_task->>'deliverableId'
      or (nullif(p_task->>'deliverableId','') is null and coalesce(output.data->'taskIds','[]'::jsonb) ? (p_task->>'id')))
    and attachment->>'bucket'='client-service-files' and nullif(attachment->>'id','') is not null
    and split_part(attachment->>'path','/',1)=p_workspace
    and split_part(attachment->>'path','/',2)=output.client_id
    and split_part(attachment->>'path','/',3)=output.cycle_id
    and nullif(split_part(attachment->>'path','/',4),'') is not null
    and position(chr(92) in attachment->>'path')=0
    and (attachment->>'path') !~ '(^|/)\.\.?(/|$)';
$$;
revoke all on function private.aitask_task_review_attachments(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_can_read_review_output_file(p_workspace text,p_client text,p_cycle text,p_object text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.aitask_entities task
    cross join lateral jsonb_array_elements(private.aitask_task_review_attachments(p_workspace,task.data)) attachment
    where task.workspace_id=p_workspace and task.entity_type='task' and task.client_id=p_client
      and (nullif(task.data->>'serviceCycleId','') is null or task.data->>'serviceCycleId'=p_cycle)
      and split_part(attachment->>'path','/',3)=p_cycle and attachment->>'path'=p_object
  );
$$;
revoke all on function private.aitask_can_read_review_output_file(text,text,text,text) from public,anon,authenticated,service_role;

do $migration$
declare v_definition text; v_anchor text;
begin
  v_definition:=pg_get_functiondef('private.aitask_can_read_service_file(text,text,text,text)'::regprocedure);
  v_anchor:='select coalesce(';
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one Storage read predicate';
  end if;
  execute replace(v_definition,v_anchor,v_anchor||'
    private.aitask_can_read_review_output_file(p_workspace_id,p_client_id,p_cycle_id,p_object_name) or ');
  v_definition:=pg_get_functiondef('public.aitask_get_workflow_task_context(text)'::regprocedure);
  v_anchor:=$anchor$'workflowStepKind',private.aitask_workflow_step$anchor$;
  if (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 then
    raise exception 'Expected exactly one canonical task context predicate';
  end if;
  execute replace(v_definition,v_anchor,
    $projection$'reviewEvidence',jsonb_build_object('actorId',v_actor,'attachments',private.aitask_task_review_attachments(p_workspace_id,task.data)), $projection$||v_anchor);
end;
$migration$;

-- Evidence is response metadata, never a submitted task field.
create or replace function private.aitask_guard_task_review_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.data ? 'reviewEvidence' then
    raise check_violation using message='Task review evidence is managed by the server.';
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_review_evidence() from public,anon,authenticated,service_role;
create trigger aitask_guard_task_review_evidence before insert or update on public.aitask_entities
for each row when(new.entity_type='task') execute function private.aitask_guard_task_review_evidence();
