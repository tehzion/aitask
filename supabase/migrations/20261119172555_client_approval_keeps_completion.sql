-- A client's acceptance must not reopen work a Project Manager already completed.
--
-- The app records acceptance and completion separately: a Project Manager may
-- complete a task while the client's review is still pending, and the client's
-- later "approve" is only their decision. The command rule already accepts that
-- shape (Completed, 100%), and the app keeps the task completed. The merge step
-- that finalizes the client's decision, however, forced every approval back to
-- Approved / 80% / not completed and cleared the completion date, so the saved
-- task silently lost its completion. A change request still reopens the work.

create or replace function private.aitask_merge_client_approval_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rating jsonb := new.data -> 'clientRating';
  v_approved boolean;
  v_was_completed boolean;
begin
  if new.entity_type = 'task'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true'
    and private.aitask_member_role(old.workspace_id) = 'Client' then
    v_approved := new.data ->> 'clientApprovalStatus' = 'Approved';
    v_was_completed := coalesce(old.data ->> 'status', '') = 'Completed'
      or coalesce(old.data ->> 'isCompleted', 'false') = 'true';
    new.data := old.data || jsonb_build_object(
      'clientApprovalStatus', new.data -> 'clientApprovalStatus',
      'status', case when v_approved and v_was_completed then to_jsonb('Completed'::text)
                     when v_approved then to_jsonb('Approved'::text)
                     else to_jsonb('In Progress'::text) end,
      'isCompleted', v_approved and v_was_completed,
      'completionPercentage', case when v_approved and v_was_completed then 100
                                   when v_approved then 80
                                   else 50 end,
      -- Keep the date the work was really completed; a reopened task has none.
      'completedAt', case when v_approved and v_was_completed then coalesce(old.data -> 'completedAt', 'null'::jsonb) else 'null'::jsonb end,
      'revisionCount', to_jsonb(case when new.data ->> 'clientApprovalStatus' = 'Rejected' then coalesce((old.data ->> 'revisionCount')::integer, 0) + 1 else coalesce((old.data ->> 'revisionCount')::integer, 0) end)
    );
    -- The rating comes from the client; who rated and when come from the server.
    if v_approved and jsonb_typeof(v_rating) = 'object' then
      new.data := new.data || jsonb_build_object('clientRating', jsonb_strip_nulls(jsonb_build_object(
        'stars', (v_rating ->> 'stars')::integer,
        'comment', nullif(left(btrim(coalesce(v_rating ->> 'comment', '')), 500), ''),
        'ratedBy', private.aitask_member_id(old.workspace_id),
        'ratedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )));
    end if;
    -- Tell the team what the client decided.
    perform private.aitask_notify_client_decision(old.workspace_id, new.entity_id, new.data);
  end if;
  return new;
end;
$$;
