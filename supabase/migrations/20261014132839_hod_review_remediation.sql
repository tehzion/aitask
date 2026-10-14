-- Independent, reachable review; explicit temporary cover and stable ownership.
create or replace function private.aitask_review_member_can_lead(p_workspace text,p_task jsonb,p_member text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.aitask_members m join auth.users u on u.id=m.auth_user_id
    where m.workspace_id=p_workspace and m.id=p_member and (u.banned_until is null or u.banned_until<=now())
      and ((m.role='HOD' or (m.role='Staff' and m.custom_role_id='builtin-hod'))
        and private.aitask_task_department(p_task->>'department')=any(m.departments)
      or m.role='Project Manager' and (m.is_super_admin or m.id in(p_task->>'createdBy',p_task->>'assignedTo')
        or exists(select 1 from public.aitask_entities c where c.workspace_id=p_workspace and c.entity_type='client' and c.created_by=m.id and c.client_key=lower(btrim(p_task->>'clientName')))
        or exists(select 1 from public.aitask_entities p where p.workspace_id=p_workspace and p.entity_type='project' and p.entity_id=p_task->>'projectId' and p.created_by=m.id))));
$$;
revoke all on function private.aitask_review_member_can_lead(text,jsonb,text) from public,anon,authenticated,service_role;

create or replace function private.aitask_task_reviewers(p_workspace text,p_task jsonb)
returns table(id text) language sql stable security definer set search_path='' as $$
  with available as (
    select m.id,m.role,m.is_super_admin from public.aitask_members m
    where m.workspace_id=p_workspace and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
      and m.id is distinct from p_task->>'assignedTo' and m.id is distinct from p_task->'workState'->>'reviewRequestedBy'
  ), cover as (
    select a.id from available a where a.id=p_task->'reviewCover'->>'reviewerId'
      and (p_task->'reviewCover'->>'expiresAt')::timestamptz>now()
  ), hods as (
    select a.id from available a where a.role in('HOD','Staff')
  ), pms as (
    select a.id from available a where a.role='Project Manager'
  )
  select id from cover
  union select id from hods where not exists(select 1 from cover)
  union select id from pms where not exists(select 1 from cover) and not exists(select 1 from hods)
  union select m.id from public.aitask_members m where m.workspace_id=p_workspace and m.is_super_admin
    and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
    and not exists(select 1 from cover) and not exists(select 1 from hods) and not exists(select 1 from pms);
$$;
revoke all on function private.aitask_task_reviewers(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_can_sign_task_review(p_workspace text,p_task jsonb,p_reason text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.aitask_review_member_can_lead(p_workspace,p_task,private.aitask_member_id(p_workspace)) and (
    (private.aitask_member_id(p_workspace) is distinct from p_task->>'assignedTo'
      and private.aitask_member_id(p_workspace) is distinct from p_task->'workState'->>'reviewRequestedBy'
      and (private.aitask_is_super_admin(p_workspace) or exists(select 1 from private.aitask_task_reviewers(p_workspace,p_task) r where r.id=private.aitask_member_id(p_workspace))))
    or private.aitask_is_super_admin(p_workspace) and length(btrim(coalesce(p_reason,''))) between 1 and 2000),false);
$$;
revoke all on function private.aitask_can_sign_task_review(text,jsonb,text) from public,anon,authenticated,service_role;

create or replace function private.aitask_guard_task_review_config()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.aitask_member_id(new.workspace_id); v_old jsonb:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end; v_cover jsonb; v_lead text;
begin
  if new.entity_type<>'task' then return new; end if;
  if new.data ? 'reviewDecision' and new.data->'reviewDecision' is distinct from v_old->'reviewDecision' then
    raise check_violation using message='Review decisions are managed by the server.';
  end if;
  if new.data ? 'reviewOverrideReason' and (not private.aitask_is_super_admin(new.workspace_id)
    or new.data->>'status'<>'Approved' or v_old->>'status'<>'Waiting Approval'
    or length(btrim(coalesce(new.data->>'reviewOverrideReason',''))) not between 1 and 2000) then
    raise check_violation using message='Only Boss Koo can record an explicit review override.';
  end if;
  -- Omitted fields from cached clients retain the configured lead and cover.
  if tg_op='UPDATE' then
    if not(new.data ? 'accountableLeadId') and v_old ? 'accountableLeadId' then new.data:=new.data||jsonb_build_object('accountableLeadId',v_old->'accountableLeadId'); end if;
    if not(new.data ? 'reviewCover') and v_old ? 'reviewCover' then new.data:=new.data||jsonb_build_object('reviewCover',v_old->'reviewCover'); end if;
  end if;
  if (new.data->'accountableLeadId' is distinct from v_old->'accountableLeadId' and new.data ? 'accountableLeadId')
    or (new.data->'reviewCover' is distinct from v_old->'reviewCover' and new.data ? 'reviewCover') then
    if v_actor is not null and not(private.aitask_is_super_admin(new.workspace_id) or (private.aitask_member_role(new.workspace_id)='Project Manager'
      and (tg_op='INSERT' or private.aitask_can_edit_task(new.workspace_id,new.entity_id)))) then
      raise check_violation using message='Only the responsible project manager can configure review cover.';
    end if;
    if new.data ? 'accountableLeadId' and not private.aitask_review_member_can_lead(new.workspace_id,new.data,new.data->>'accountableLeadId') then
      raise check_violation using message='Choose a department lead or responsible project manager.';
    end if;
    v_cover:=new.data->'reviewCover';
    if v_cover is not null and v_cover<>'null'::jsonb and v_cover is distinct from v_old->'reviewCover' then
      if jsonb_typeof(v_cover)<>'object' or not private.aitask_review_member_can_lead(new.workspace_id,new.data,v_cover->>'reviewerId')
        or v_cover->>'reviewerId'=new.data->>'assignedTo' or v_cover->>'reviewerId'=v_old->'workState'->>'reviewRequestedBy'
        or coalesce((v_cover->>'expiresAt')::timestamptz,'epoch'::timestamptz)<=now()
        or (v_cover->>'expiresAt')::timestamptz>now()+interval '90 days' then
        raise check_violation using message='Choose an independent reviewer and a cover expiry within 90 days.';
      end if;
      new.data:=new.data||jsonb_build_object('reviewCover',jsonb_build_object('reviewerId',v_cover->>'reviewerId','expiresAt',(v_cover->>'expiresAt')::timestamptz,
        'configuredBy',v_actor,'configuredAt',clock_timestamp()));
    end if;
  end if;
  -- Nested dependency resets must retain every non-reset field unchanged.
  if v_actor is not null and pg_trigger_depth()=1 and not(new.data ? 'accountableLeadId') then
    if private.aitask_review_member_can_lead(new.workspace_id,new.data,new.data->>'createdBy') then
      new.data:=new.data||jsonb_build_object('accountableLeadId',new.data->>'createdBy');
    else
      select m.id into v_lead from public.aitask_members m where m.workspace_id=new.workspace_id
        and m.role='Project Manager' and private.aitask_review_member_can_lead(new.workspace_id,new.data,m.id)
        order by m.is_super_admin,m.id limit 1;
      if v_lead is not null then new.data:=new.data||jsonb_build_object('accountableLeadId',v_lead); end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_review_config() from public,anon,authenticated,service_role;
create trigger aitask_01_guard_task_review_config before insert or update of data on public.aitask_entities for each row execute function private.aitask_guard_task_review_config();

-- Keep existing frozen-chain/dependency guards and their identities in place.
do $migration$
declare d text; a text; b integer; e integer;
begin
  d:=pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  a:='v_hod boolean := private.aitask_is_hod(new.workspace_id) and private.aitask_member_role(new.workspace_id) in (''Staff'',''HOD'');';
  if strpos(d,a)=0 then raise exception 'Expected stage HOD predicate'; end if;
  d:=replace(d,a,'v_hod boolean := private.aitask_is_hod(new.workspace_id) and private.aitask_can_sign_task_review(new.workspace_id,case when tg_op=''UPDATE'' then old.data else new.data end);');
  a:='if new.data->>''status'' = ''Approved'' and v_changed and not ('; b:=strpos(d,a);
  if b=0 then raise exception 'Expected stage approval predicate'; end if;
  e:=strpos(substring(d from b),'end if;');
  d:=overlay(d placing 'if new.data->>''status''=''Approved'' and v_changed and not(v_old->>''status''=''Waiting Approval'' and private.aitask_can_sign_task_review(new.workspace_id,v_old,new.data->>''reviewOverrideReason'')) then raise check_violation using message=''Only an independent reviewer can approve submitted work.''; end if;' from b for e+length('end if;')-1);
  -- Acceptance cannot be silently withdrawn by an unrelated unchanged-status edit.
  a:='if v_actor is not null and v_role <> ''Client'' then';
  if strpos(d,a)=0 then raise exception 'Expected stage actor guard'; end if;
  d:=replace(d,a,a||' if tg_op=''UPDATE'' and not v_changed and v_old->>''clientApprovalStatus''=''Approved'' and new.data->>''clientApprovalStatus'' is distinct from ''Approved'' and v_old->>''assignedTo'' is not distinct from new.data->>''assignedTo'' and v_old->>''department'' is not distinct from new.data->>''department'' then new.data:=new.data||jsonb_build_object(''clientApprovalStatus'',''Approved''); end if;');
  execute d;
  d:=pg_get_functiondef('private.aitask_guard_workflow_task()'::regprocedure);
  a:='if v_actor is null or not ('; b:=strpos(d,a); e:=strpos(substring(d from b),') then raise check_violation using message=''Only the authorized department reviewer or Boss Koo can approve internal review.''; end if;');
  if b=0 or e=0 then raise exception 'Expected frozen reviewer predicate'; end if;
  d:=overlay(d placing 'if not private.aitask_can_sign_task_review(new.workspace_id,case when tg_op=''UPDATE'' then old.data else new.data end,new.data->>''reviewOverrideReason'') then raise check_violation using message=''Only an independent reviewer can approve submitted work.''; end if;' from b for e+length(') then raise check_violation using message=''Only the authorized department reviewer or Boss Koo can approve internal review.''; end if;')-1);
  a:='''attachmentName'',''status'''; if strpos(d,a)=0 then raise exception 'Expected frozen output fields'; end if;
  d:=replace(d,a,'''attachmentName'',''outputAttachments'',''status''');
  a:='if v_output_changed then v_counter := v_counter+1; end if;';
  d:=replace(d,a,'v_output_changed := v_output_changed or (coalesce(old.data->''outputAttachments'',''[]''::jsonb) is distinct from coalesce(new.data->''outputAttachments'',''[]''::jsonb)); '||a);
  execute d;
  d:=pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  a:='if not v_evidence then'; if strpos(d,a)=0 then raise exception 'Expected evidence gate'; end if;
  execute replace(d,a,'v_evidence := v_evidence or exists(select 1 from jsonb_array_elements(coalesce(new.data->''outputAttachments'',''[]''::jsonb)) f join storage.objects o on o.bucket_id=''client-service-files'' and o.name=f->>''path''); v_evidence:=v_evidence or jsonb_array_length(private.aitask_task_review_input_files(new.workspace_id,new.data))>0; '||a);
end;
$migration$;

-- Cover changes on already-waiting work receive the same transactional handoff.
do $migration$
declare d text; a text;
begin
  d:=pg_get_functiondef('private.aitask_notify_hod_review_submission()'::regprocedure);
  a:='or (tg_op=''UPDATE'' and old.data->>''status'' is not distinct from new.data->>''status'') then';
  if strpos(d,a)=0 then raise exception 'Expected review handoff guard'; end if;
  execute replace(d,a,'or (tg_op=''UPDATE'' and old.data->>''status'' is not distinct from new.data->>''status'' and old.data->''reviewCover'' is not distinct from new.data->''reviewCover'') then');
  d:=pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  a:='''priority'', ''attachmentLink'''; if strpos(d,a)=0 then raise exception 'Expected task history fields'; end if;
  execute replace(d,a,a||',''outputAttachments'',''reviewCover'',''accountableLeadId''');
end;
$migration$;

-- Clients receive task files only after internal approval, without reviewer,
-- cover, pricing, private notes, or accountable-lead metadata.
do $migration$
declare d text; a text;
begin
  d:=pg_get_functiondef('private.aitask_client_task_projection(jsonb)'::regprocedure);
  a:='''attachmentLink'',p_data->''attachmentLink'''; if strpos(d,a)=0 then raise exception 'Expected client task projection'; end if;
  execute replace(d,a,'''outputAttachments'',case when p_data->>''status'' in(''Approved'',''Completed'') then p_data->''outputAttachments'' else null end,'||a);
  d:=pg_get_functiondef('private.aitask_can_read_service_file(text,text,text,text)'::regprocedure);
  a:='select coalesce('; if strpos(d,a)=0 then raise exception 'Expected Storage read predicate'; end if;
  execute replace(d,a,a||'
    (private.aitask_member_role(p_workspace_id)=''Client'' and private.aitask_can_access_service_client(p_workspace_id,p_client_id)
      and exists(select 1 from public.aitask_entities task cross join lateral jsonb_array_elements(coalesce(task.data->''outputAttachments'',''[]''::jsonb)) file
        join public.aitask_entities cycle on cycle.workspace_id=task.workspace_id and cycle.entity_type=''service_cycle'' and cycle.entity_id=p_cycle_id
        where task.workspace_id=p_workspace_id and task.entity_type=''task'' and task.client_id=p_client_id and task.data->>''serviceCycleId''=p_cycle_id
          and task.data->>''visibility''=''client-visible'' and task.data->>''status'' in(''Approved'',''Completed'') and cycle.data->>''status'' in(''Published'',''Completed'')
          and file->>''bucket''=''client-service-files'' and file->>''path''=p_object_name)) or ');
end;
$migration$;

create or replace function private.aitask_guard_task_output_files()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.aitask_member_id(new.workspace_id); v_old jsonb:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end; f jsonb;
begin
  if new.entity_type<>'task' or coalesce(new.data->'outputAttachments','[]'::jsonb)=coalesce(v_old->'outputAttachments','[]'::jsonb) then return new; end if;
  if v_actor is null or private.aitask_member_role(new.workspace_id)='Client' or not private.aitask_can_edit_task(new.workspace_id,new.entity_id)
    or (new.data->>'assignedTo' is distinct from v_actor and not private.aitask_is_admin(new.workspace_id)) then
    raise check_violation using message='Only the assigned worker or responsible project manager can upload output.';
  end if;
  if v_old->>'status' in('Waiting Approval','Approved','Completed','Cancelled') then
    raise check_violation using message='Return this task for revision before changing its output files.';
  end if;
  if jsonb_typeof(new.data->'outputAttachments')<>'array' or jsonb_array_length(new.data->'outputAttachments')>50 then raise check_violation using message='A task can contain at most 50 output files.'; end if;
  if not exists(select 1 from public.aitask_entities d where d.workspace_id=new.workspace_id and d.entity_type='deliverable'
    and (d.entity_id=new.data->>'deliverableId' or coalesce(d.data->'taskIds','[]'::jsonb) ? new.entity_id)
    and d.client_id=new.data->>'clientId' and d.cycle_id=new.data->>'serviceCycleId') then raise check_violation using message='Choose an output file belonging to this task and cycle.'; end if;
  for f in select value from jsonb_array_elements(new.data->'outputAttachments') loop
    if coalesce(v_old->'outputAttachments','[]'::jsonb) @> jsonb_build_array(f) then continue; end if;
    if f->>'bucket'<>'client-service-files' or nullif(f->>'id','') is null or f->>'uploadedBy' is distinct from v_actor
      or array_length(string_to_array(f->>'path','/'),1)<>4 or split_part(f->>'path','/',1)<>new.workspace_id
      or split_part(f->>'path','/',2) is distinct from new.data->>'clientId' or split_part(f->>'path','/',3) is distinct from new.data->>'serviceCycleId'
      or coalesce(f->>'path','') ~ '(^|/)\.\.?(/|$)' or position(chr(92) in coalesce(f->>'path',''))>0
      or not exists(select 1 from storage.objects o where o.bucket_id='client-service-files' and o.name=f->>'path' and o.owner_id=(select auth.uid())::text) then
      raise check_violation using message='Choose an output file belonging to this task and cycle.';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_output_files() from public,anon,authenticated,service_role;
create trigger aitask_02_guard_task_output_files before insert or update of data on public.aitask_entities for each row execute function private.aitask_guard_task_output_files();

create or replace function private.aitask_task_review_input_files(p_workspace text,p_task jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select coalesce(jsonb_agg(f),'[]'::jsonb) from public.aitask_entities input
  cross join lateral jsonb_array_elements(coalesce(input.data->'outputAttachments','[]'::jsonb)) f
  join storage.objects o on o.bucket_id='client-service-files' and o.name=f->>'path'
  where (select auth.uid()) is not null and private.aitask_can_view_task(p_workspace,p_task->>'id')
    and private.aitask_workflow_step(p_workspace,p_task)->>'kind'='internal_review'
    and (private.aitask_can_sign_task_review(p_workspace,p_task) or private.aitask_is_super_admin(p_workspace)
      or (private.aitask_member_role(p_workspace)='Project Manager' and private.aitask_can_edit_task(p_workspace,p_task->>'id'))
      or p_task->>'assignedTo'=private.aitask_member_id(p_workspace))
    and input.workspace_id=p_workspace and input.entity_type='task' and coalesce(p_task->'predecessorTaskIds','[]'::jsonb) ? input.entity_id
    and input.client_id=p_task->>'clientId' and input.data->>'deliverableId'=p_task->>'deliverableId' and input.data->>'serviceCycleId'=p_task->>'serviceCycleId'
    and private.aitask_workflow_task_satisfied(p_workspace,input.data);
$$;
revoke all on function private.aitask_task_review_input_files(text,jsonb) from public,anon,authenticated,service_role;

-- Keep legacy deliverable-file projection and add task-bound files, including
-- completed predecessor output only for authorized frozen review inputs.
do $migration$
declare d text; a text;
begin
  d:=pg_get_functiondef('private.aitask_task_review_attachments(text,jsonb)'::regprocedure);
  execute replace(d,'private.aitask_task_review_attachments(','private.aitask_task_review_deliverable_files(');
end;
$migration$;
revoke all on function private.aitask_task_review_deliverable_files(text,jsonb) from public,anon,authenticated,service_role;
create or replace function private.aitask_task_review_attachments(p_workspace text,p_task jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.aitask_task_review_deliverable_files(p_workspace,p_task)
    || case when private.aitask_can_sign_task_review(p_workspace,p_task) or private.aitask_is_super_admin(p_workspace)
      then coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(p_task->'outputAttachments','[]'::jsonb)) f
        join storage.objects o on o.bucket_id='client-service-files' and o.name=f->>'path'
        where private.aitask_can_view_task(p_workspace,p_task->>'id')), '[]'::jsonb) else '[]'::jsonb end
    || private.aitask_task_review_input_files(p_workspace,p_task);
$$;
revoke all on function private.aitask_task_review_attachments(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_stamp_task_review_decision()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor text:=private.aitask_member_id(new.workspace_id);
begin
  if new.entity_type<>'task' then return new; end if;
  if tg_op='UPDATE' and old.data->>'status'='Waiting Approval' and new.data->>'status'='Approved' and v_actor is not null and private.aitask_member_role(new.workspace_id)<>'Client' then
    new.data:=new.data||jsonb_build_object('reviewDecision',jsonb_build_object('reviewedBy',v_actor,'reviewedAt',clock_timestamp(),'overrideReason',nullif(btrim(new.data->>'reviewOverrideReason'),'')));
  elsif tg_op='UPDATE' and new.data->>'status' in('Approved','Completed') and old.data ? 'reviewDecision' then
    new.data:=new.data||jsonb_build_object('reviewDecision',old.data->'reviewDecision');
  else new.data:=new.data-'reviewDecision'; end if;
  new.data:=new.data-'reviewOverrideReason';
  return new;
end;
$$;
revoke all on function private.aitask_stamp_task_review_decision() from public,anon,authenticated,service_role;
create trigger zzzzz_aitask_stamp_task_review_decision before insert or update of data on public.aitask_entities for each row execute function private.aitask_stamp_task_review_decision();

do $migration$
declare d text; a text;
begin
  d:=pg_get_functiondef('public.aitask_get_workflow_task_context(text)'::regprocedure);
  a:='private.aitask_can_edit_task(p_workspace_id,task.entity_id)';
  -- The complete old canApprove expression ends immediately before reviewEvidence.
  d:=regexp_replace(d,'''canApprove'',private\.aitask_can_edit_task\(p_workspace_id,task\.entity_id\).*?\),[[:space:]]*''reviewEvidence''', '''canApprove'',private.aitask_can_sign_task_review(p_workspace_id,task.data)),''reviewEvidence''','s');
  if strpos(d,'canApprove'',private.aitask_can_sign_task_review')=0 then raise exception 'Expected canonical reviewer projection'; end if;
  -- Authorized assigned reviewers can receive completed predecessor files.
  d:=replace(d,'''canReadInputs'',jsonb_array_length(private.aitask_task_review_input_links(p_workspace_id,task.data))>0', '''canReadInputs'',(jsonb_array_length(private.aitask_task_review_input_links(p_workspace_id,task.data))>0 or jsonb_array_length(private.aitask_task_review_input_files(p_workspace_id,task.data))>0)');
  d:=replace(d,'''canApprove'',private.aitask_can_sign_task_review', '''expiresAt'',task.data->''reviewCover''->''expiresAt'',''canApprove'',private.aitask_can_sign_task_review');
  execute d;
  d:=pg_get_functiondef('public.aitask_get_backend_capabilities(text)'::regprocedure);
  a:='''workflowReviewGate'', true';
  if strpos(d,a)=0 then a:='''workflowReviewGate'',true'; end if;
  if strpos(d,a)=0 then raise exception 'Expected review capability'; end if;
  execute replace(d,a,a||',''hodReviewRemediation'',true');
end;
$migration$;
