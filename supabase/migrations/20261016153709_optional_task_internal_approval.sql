-- Optional internal approval.
--
-- By default a submitted task still requires the department HOD checkpoint
-- (stage 5, 80%) before a Project Manager finalizes it (stage 6, 100%). A
-- Project Manager may mark a task as not requiring internal approval, in which
-- case they can finalize it directly from "Waiting Approval". Client acceptance
-- remains optional: final completion is always the Project Manager's action.
--
-- Secure clients only write the flag when the backend advertises the
-- optionalTaskApproval capability, so add it here and relax the stage guard for
-- tasks that opt out of internal approval (internal-review workflow steps are
-- still gated by the workflow review trigger).

do $migration$
declare
  v_definition text;
  v_anchor text;
begin
  -- 1) Advertise the capability so the client may persist the flag.
  v_definition := pg_get_functiondef('public.aitask_get_backend_capabilities(text)'::regprocedure);
  v_anchor := '''workflowReviewGate'', true';
  if strpos(v_definition, v_anchor) = 0 then v_anchor := '''workflowReviewGate'',true'; end if;
  if strpos(v_definition, v_anchor) = 0 then
    raise exception 'Expected workflow review capability anchor';
  end if;
  if strpos(v_definition, 'optionalTaskApproval') = 0 then
    execute replace(v_definition, v_anchor, v_anchor || ',''optionalTaskApproval'',true');
  end if;

  -- 2) Let a Project Manager finalize a waiting task that opted out of internal
  --    approval. Every other stage/role rule is unchanged.
  v_definition := pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  v_anchor := 'and not (v_boss or (v_role=''Project Manager'' and v_old->>''status''=''Approved''))';
  if strpos(v_definition, v_anchor) = 0 then
    raise exception 'Expected task completion anchor';
  end if;
  if strpos(v_definition, 'requiresInternalApproval') = 0 then
    execute replace(
      v_definition,
      v_anchor,
      'and not (v_boss or (v_role=''Project Manager'' and (v_old->>''status''=''Approved'''
        || ' or (v_old->>''status''=''Waiting Approval'''
        || ' and coalesce((v_old->>''requiresInternalApproval'')::boolean, true) = false'
        || ' and coalesce(v_old->>''workflowStepKind'', '''') <> ''internal_review''))))'
    );
  end if;
end;
$migration$;
-- A responsible PM may opt an ordinary task out of internal approval. Missing
-- values retain the historical requirement, including for cached clients.
create or replace function private.aitask_guard_task_approval_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old jsonb:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end;
  v_actor text:=private.aitask_member_id(new.workspace_id);
  v_old_required boolean:=coalesce((v_old->>'requiresInternalApproval')::boolean,true);
  v_new_required boolean;
  v_step_kind text;
begin
  if new.entity_type<>'task' then return new; end if;
  if tg_op='UPDATE' and not(new.data ? 'requiresInternalApproval') and v_old ? 'requiresInternalApproval' then
    new.data:=new.data||jsonb_build_object('requiresInternalApproval',v_old->'requiresInternalApproval');
  end if;
  if new.data ? 'requiresInternalApproval' and jsonb_typeof(new.data->'requiresInternalApproval')<>'boolean' then
    raise check_violation using message='Choose whether internal approval is required.';
  end if;
  v_new_required:=coalesce((new.data->>'requiresInternalApproval')::boolean,true);
  if v_new_required is distinct from v_old_required then
    if v_actor is not null and not(private.aitask_is_super_admin(new.workspace_id) or
      (private.aitask_member_role(new.workspace_id)='Project Manager' and
        (tg_op='INSERT' or private.aitask_can_edit_task(new.workspace_id,new.entity_id)))) then
      raise check_violation using message='Only the responsible project manager can change the approval requirement.';
    end if;
    if tg_op='UPDATE' and v_old->>'status' in('Completed','Cancelled') then
      raise check_violation using message='Reopen the task before changing its approval requirement.';
    end if;
  end if;
  if not v_new_required then
    v_step_kind:=coalesce(private.aitask_workflow_step(new.workspace_id,new.data)->>'kind',new.data->>'workflowStepKind');
    if v_step_kind='internal_review' then
      raise check_violation using message='Internal review workflow steps always require approval.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_approval_requirement() from public,anon,authenticated,service_role;
create trigger aitask_00_guard_task_approval_requirement before insert or update of data on public.aitask_entities
  for each row execute function private.aitask_guard_task_approval_requirement();

do $migration$
declare d text; a text;
begin
  d:=pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  a:='''outputAttachments'',''reviewCover'',''accountableLeadId''';
  if strpos(d,a)=0 then raise exception 'Expected review configuration history fields'; end if;
  execute replace(d,a,a||',''requiresInternalApproval''');
end;
$migration$;
