-- Prepare the client portal for clients: they see how many revision rounds were
-- used out of what the project includes, and can rate a delivery when they
-- accept it. Nothing here opens the portal to anyone new.
--
-- 1. The task projection shows revisionCount and the client's own rating; the
--    project projection shows includedRevisions.
-- 2. An approval may carry a rating (1-5, only when the decision is Approved).
--    The canonical merge stamps who rated and when on the server, so a client
--    cannot forge either.

create or replace function private.aitask_client_task_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_data->'id','clientId',p_data->'clientId','clientName',p_data->'clientName','projectId',p_data->'projectId','projectName',p_data->'projectName',
    'deliverableId',p_data->'deliverableId','visibility',p_data->'visibility',
    'serviceType',p_data->'serviceType','title',p_data->'title','description',p_data->'description',
    'startDate',p_data->'startDate','dueDate',p_data->'dueDate','status',p_data->'status','completionPercentage',p_data->'completionPercentage',
    'outputAttachments',case when p_data->>'status' in('Approved','Completed') then p_data->'outputAttachments' else null end,'attachmentLink',p_data->'attachmentLink','attachmentName',p_data->'attachmentName','website',p_data->'website','facebookPage',p_data->'facebookPage',
    'isCompleted',p_data->'isCompleted','completedAt',p_data->'completedAt','clientApprovalStatus',p_data->'clientApprovalStatus',
    'revisionCount',p_data->'revisionCount','clientRating',p_data->'clientRating'
  ));
$$;

create or replace function private.aitask_client_project_projection(p_data jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', p_data -> 'id',
    'clientName', p_data -> 'clientName',
    'projectName', p_data -> 'projectName',
    'services', p_data -> 'services',
    'startDate', p_data -> 'startDate',
    'deadline', p_data -> 'deadline',
    'totalTasks', p_data -> 'totalTasks',
    'completedTasks', p_data -> 'completedTasks',
    'includedRevisions', p_data -> 'includedRevisions'
  ));
$$;

create or replace function private.aitask_merge_client_approval_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rating jsonb := new.data -> 'clientRating';
begin
  if new.entity_type = 'task'
    and current_setting('aitask.command_type', true) = 'approval.review'
    and current_setting('aitask.client_command_allowed', true) = 'true'
    and private.aitask_member_role(old.workspace_id) = 'Client' then
    new.data := old.data || jsonb_build_object(
      'clientApprovalStatus', new.data -> 'clientApprovalStatus',
      'status', case when new.data->>'clientApprovalStatus' = 'Approved' then to_jsonb('Approved'::text) else to_jsonb('In Progress'::text) end,
      'isCompleted', false,
      'completionPercentage', case when new.data->>'clientApprovalStatus' = 'Approved' then 80 else 50 end,
      'completedAt', 'null'::jsonb,
      'revisionCount', to_jsonb(case when new.data ->> 'clientApprovalStatus' = 'Rejected' then coalesce((old.data ->> 'revisionCount')::integer, 0) + 1 else coalesce((old.data ->> 'revisionCount')::integer, 0) end)
    );
    -- The rating comes from the client; who rated and when come from the server.
    if new.data ->> 'clientApprovalStatus' = 'Approved' and jsonb_typeof(v_rating) = 'object' then
      new.data := new.data || jsonb_build_object('clientRating', jsonb_strip_nulls(jsonb_build_object(
        'stars', (v_rating ->> 'stars')::integer,
        'comment', nullif(left(btrim(coalesce(v_rating ->> 'comment', '')), 500), ''),
        'ratedBy', private.aitask_member_id(old.workspace_id),
        'ratedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )));
    end if;
  end if;
  return new;
end;
$$;

do $migration$
declare
  definition text := pg_get_functiondef('private.aitask_client_command_allowed(text,text,jsonb)'::regprocedure);
  keys_anchor text := $sql$'status', 'isCompleted', 'completionPercentage', 'revisionCount', 'completedAt'$sql$;
  keys_replacement text := $sql$'status', 'isCompleted', 'completionPercentage', 'revisionCount', 'completedAt', 'clientRating'$sql$;
  status_anchor text := $sql$  v_review_status := v_child_data ->> 'status';$sql$;
  status_replacement text := $sql$  v_review_status := v_child_data ->> 'status';
  if v_new_task ? 'clientRating' and (v_new_task -> 'clientRating') is distinct from (v_old_task -> 'clientRating') then
    if v_review_status <> 'Approved'
      or jsonb_typeof(v_new_task -> 'clientRating') <> 'object'
      or jsonb_typeof(v_new_task -> 'clientRating' -> 'stars') <> 'number'
      or (v_new_task -> 'clientRating' ->> 'stars')::numeric not between 1 and 5
      or (v_new_task -> 'clientRating' ->> 'stars')::numeric <> trunc((v_new_task -> 'clientRating' ->> 'stars')::numeric) then
      return false;
    end if;
  end if;$sql$;
begin
  if (length(definition) - length(replace(definition, keys_anchor, ''))) / length(keys_anchor) <> 1 then
    raise exception 'Expected one protected-key list in the client command rule';
  end if;
  if (length(definition) - length(replace(definition, status_anchor, ''))) / length(status_anchor) <> 1 then
    raise exception 'Expected one review status line in the client command rule';
  end if;
  execute replace(replace(definition, keys_anchor, keys_replacement), status_anchor, status_replacement);
end;
$migration$;
