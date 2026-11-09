-- R3 S1 (team feedback decision D1, approved 2026-11-09): the PM reviews
-- work on every project.
--
-- 30 of 43 live projects still had `defaultApprovalMode = 'none'`, so the
-- server refused "Send for review" (Waiting Approval) on their tasks. This
-- switches every project default to 'pm', and moves open tasks whose own mode
-- is 'none', 'hod' or missing to 'pm'. Tasks set to 'inherit' follow their
-- project and need no change. Tasks already in Waiting Approval, and closed
-- tasks, are left exactly as they are.
--
-- Every changed row is copied to private.r3_backfill_snapshot first, so the
-- batch can be undone:
--   update public.aitask_entities e set data = s.data
--   from private.r3_backfill_snapshot s
--   where s.batch = 's1_project_approval_pm' and e.workspace_id = s.workspace_id
--     and e.entity_type = s.entity_type and e.entity_id = s.entity_id;

create table if not exists private.r3_backfill_snapshot (
  batch text not null,
  workspace_id text not null,
  entity_type text not null,
  entity_id text not null,
  data jsonb not null,
  taken_at timestamptz not null default now(),
  primary key (batch, workspace_id, entity_type, entity_id)
);
revoke all on table private.r3_backfill_snapshot from public, anon, authenticated;

create temporary table r3_s1_targets on commit drop as
select workspace_id, entity_type, entity_id
from public.aitask_entities
where (
    entity_type = 'project'
    and coalesce(data ->> 'defaultApprovalMode', '') <> 'pm'
  ) or (
    entity_type = 'task'
    and coalesce(data ->> 'status', '') not in ('Completed', 'Cancelled', 'Waiting Approval')
    and coalesce((data ->> 'isCompleted')::boolean, false) = false
    and coalesce(data ->> 'approvalMode', '') in ('', 'none', 'hod')
  );

insert into private.r3_backfill_snapshot (batch, workspace_id, entity_type, entity_id, data)
select 's1_project_approval_pm', e.workspace_id, e.entity_type, e.entity_id, e.data
from public.aitask_entities e
join r3_s1_targets t using (workspace_id, entity_type, entity_id)
on conflict do nothing;

update public.aitask_entities e
set data = e.data || jsonb_build_object('defaultApprovalMode', 'pm')
from r3_s1_targets t
where t.entity_type = 'project'
  and e.workspace_id = t.workspace_id and e.entity_type = t.entity_type and e.entity_id = t.entity_id;

update public.aitask_entities e
set data = e.data || jsonb_build_object('approvalMode', 'pm')
from r3_s1_targets t
where t.entity_type = 'task'
  and e.workspace_id = t.workspace_id and e.entity_type = t.entity_type and e.entity_id = t.entity_id;

-- Tell open clients to reload their snapshot.
update public.aitask_workspaces w
set version = version + 1, updated_at = now()
where w.id in (select distinct workspace_id from r3_s1_targets);
