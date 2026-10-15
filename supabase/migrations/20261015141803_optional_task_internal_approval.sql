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
