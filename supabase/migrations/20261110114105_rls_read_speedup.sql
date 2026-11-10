-- Make reads of public.aitask_entities evaluate row security once per statement
-- instead of once per row. No access decision is meant to change.
--
-- Why reads are slow today
--   1. Helpers that depend only on the signed-in member (aitask_member_role,
--      aitask_member_id, aitask_is_super_admin, aitask_has_permission, ...) run
--      for every row. Each is a SECURITY DEFINER function, so it cannot be
--      inlined and re-reads aitask_members each time.
--   2. aitask_can_access_service_client runs for every plan, cycle, deliverable,
--      add-on and price snapshot row although there are far fewer distinct clients.
--   3. aitask_can_view_task runs once per comment and approval as well as once
--      per task.
--
-- What this migration does
--   * One jsonb "member context" per statement (an uncorrelated sub-select, so
--     Postgres runs it once as an InitPlan) replaces the per-row helper calls.
--   * aitask_rls_visible_entities() lists the tasks, projects and clients the
--     member can see, and aitask_rls_service_clients() lists the clients whose
--     service records they can see. Each candidate is decided once by the
--     EXISTING decision functions (can_view_task / can_view_project /
--     can_view_client / can_access_service_client); the rules are not rewritten.
--   * The read policy references the visible set exactly once, so Postgres builds
--     one hash table per statement.
--   * Policy names, commands, roles and WITH CHECK clauses are unchanged
--     (ALTER POLICY ... USING only). Both cycle-payment policies are untouched.
--
-- Safety net
--   The migration records, for every member with a login, exactly which rows
--   row security lets them read before the change, repeats that after the
--   change, and aborts (rolling everything back) if any row differs.
--
-- Measured on a local replay of every repository migration with production-shaped
-- seed data (12 members across all roles, 400 tasks, 43 projects, 42 clients,
-- 400 service records), reading the whole workspace. Shared buffer hits, which do
-- not depend on machine load:
--     Project Manager   34,971 -> 17,985   (-49%)
--     HOD               59,166 -> 24,539   (-59%)
--     Staff             64,880 -> 33,194   (-49%)
--     Client             4,090 ->  1,098   (-73%)
--   Every member read byte-identical rows before and after. aitask_can_view_task
--   calls per Staff read fell from 1,204 to 904.
--   Staff reads stay the slowest because the remaining time is inside
--   aitask_can_view_client and aitask_can_view_project, which re-check tasks per
--   client and per project. Rewriting those is a separate, riskier pass and is
--   deliberately not part of this migration.
--
-- Operations
--   ALTER POLICY takes an exclusive lock on aitask_entities until this migration
--   commits, and the verification pass below reads the table once per member while
--   holding it. Apply in a quiet period. lock_timeout makes the migration fail
--   fast, changing nothing, if the lock cannot be taken.
--
-- Rollback: see the commented block at the end. It restores the policy text
-- exactly as it was in production on 10 Nov 2026 (verified byte-identical on a
-- local replay).

-- ---------------------------------------------------------------------------
-- 0. Record what every member can read today, through real row security.
-- ---------------------------------------------------------------------------
create temporary table aitask_rls_visible_before (
  auth_user_id uuid, entity_type text, entity_id text
) on commit drop;
create temporary table aitask_rls_visible_after (
  auth_user_id uuid, entity_type text, entity_id text
) on commit drop;

do $capture$
declare
  actor record;
  original_sub text := current_setting('request.jwt.claim.sub', true);
  v_types text[];
  v_ids text[];
begin
  for actor in select auth_user_id, workspace_id from public.aitask_members
    where auth_user_id is not null
  loop
    perform set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
    set local role authenticated;
    select array_agg(e.entity_type), array_agg(e.entity_id) into v_types, v_ids
    from public.aitask_entities e
    where e.workspace_id = actor.workspace_id;
    reset role;
    insert into aitask_rls_visible_before
      select actor.auth_user_id, t.entity_type, t.entity_id
      from unnest(v_types, v_ids) as t(entity_type, entity_id);
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
end;
$capture$;

-- ---------------------------------------------------------------------------
-- 1. Member context: everything about the signed-in member that the read
--    policies need, keyed by workspace id. Values come from the existing
--    helpers, so a member who is not in a workspace gets SQL NULLs exactly as
--    those helpers return today.
-- ---------------------------------------------------------------------------
create or replace function private.aitask_rls_member_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(member.workspace_id, jsonb_build_object(
    'memberId', private.aitask_member_id(member.workspace_id),
    'role', private.aitask_member_role(member.workspace_id),
    'isSuperAdmin', private.aitask_is_super_admin(member.workspace_id),
    'isHod', private.aitask_is_hod(member.workspace_id),
    'isAdmin', private.aitask_is_admin(member.workspace_id),
    'clientKey', private.aitask_member_client_key(member.workspace_id),
    'manageServiceCatalog', private.aitask_has_permission(member.workspace_id, 'manageServiceCatalog'),
    'manageTaskTemplates', private.aitask_has_permission(member.workspace_id, 'manageTaskTemplates'),
    'viewServicePrices', private.aitask_has_permission(member.workspace_id, 'viewServicePrices'),
    -- The decision for a service record that has no client id.
    'serviceNullClient', private.aitask_can_access_service_client(member.workspace_id, null)
  )), '{}'::jsonb)
  from public.aitask_members member
  where member.auth_user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. Visible sets. One function lists every task, project and client the
--    member may see, each decided once by the EXISTING decision function.
--    The read policy references it exactly once, so Postgres builds a single
--    hash table per statement (two separate task/comment references built the
--    task set twice).
-- ---------------------------------------------------------------------------
create or replace function private.aitask_rls_visible_entities()
returns table (kind text, workspace_id text, entity_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'task'::text, task.workspace_id, task.entity_id
  from public.aitask_entities task
  where task.entity_type = 'task'
    and task.workspace_id in (
      select member.workspace_id from public.aitask_members member
      where member.auth_user_id = (select auth.uid())
    )
    and private.aitask_can_view_task(task.workspace_id, task.entity_id)
  union all
  select 'project'::text, project.workspace_id, project.entity_id
  from public.aitask_entities project
  where project.entity_type = 'project'
    and project.workspace_id in (
      select member.workspace_id from public.aitask_members member
      where member.auth_user_id = (select auth.uid())
    )
    and private.aitask_can_view_project(project.workspace_id, project.entity_id)
  union all
  -- Keyed by the client row's own id, so a client row with no client_key keeps
  -- whatever aitask_can_view_client(workspace, null) decides today.
  select 'client'::text, client.workspace_id, client.entity_id
  from public.aitask_entities client
  where client.entity_type = 'client'
    and client.workspace_id in (
      select member.workspace_id from public.aitask_members member
      where member.auth_user_id = (select auth.uid())
    )
    and private.aitask_can_view_client(client.workspace_id, client.client_key);
$$;

-- Distinct client ids used by service records, each checked once. MATERIALIZED
-- stops the planner pushing the check back below DISTINCT.
create or replace function private.aitask_rls_service_clients()
returns table (workspace_id text, client_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as materialized (
    select distinct record.workspace_id, record.client_id
    from public.aitask_entities record
    where record.client_id is not null
      and record.entity_type in ('client_plan', 'addon', 'service_pricing_snapshot', 'service_cycle', 'deliverable', 'cycle_comment')
      and record.workspace_id in (
        select member.workspace_id from public.aitask_members member
        where member.auth_user_id = (select auth.uid())
      )
  )
  select candidates.workspace_id, candidates.client_id
  from candidates
  where private.aitask_can_access_service_client(candidates.workspace_id, candidates.client_id);
$$;

revoke all on function private.aitask_rls_member_context() from public, anon;
revoke all on function private.aitask_rls_visible_entities() from public, anon;
revoke all on function private.aitask_rls_service_clients() from public, anon;
grant execute on function private.aitask_rls_member_context() to authenticated, service_role;
grant execute on function private.aitask_rls_visible_entities() to authenticated, service_role;
grant execute on function private.aitask_rls_service_clients() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Read policy. Same branches, in the same order, as the current policy.
--    A NULL from the context behaves as it does today: the branch does not
--    grant access.
-- ---------------------------------------------------------------------------
set local lock_timeout = '10s';

alter policy "members can read scoped entities" on public.aitask_entities
using (
  (entity_type = any (array['task', 'comment', 'approval', 'client', 'project'])
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and (
      case when entity_type = any (array['comment', 'approval']) then 'task' else entity_type end,
      workspace_id,
      case when entity_type = any (array['comment', 'approval']) then parent_id else entity_id end
    ) in (select visible.kind, visible.workspace_id, visible.entity_id from private.aitask_rls_visible_entities() visible))
  or (entity_type = 'task_status'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'memberId') is not null)
  or (entity_type = 'custom_role'
    and (((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
      or exists (
        select 1 from public.aitask_members member
        where member.workspace_id = aitask_entities.workspace_id
          and member.auth_user_id = (select auth.uid())
          and member.custom_role_id = aitask_entities.entity_id
      )))
  or (entity_type = 'registration'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'isSuperAdmin')::boolean)
  or (entity_type = 'notification'
    and (target_user_id = ((select private.aitask_rls_member_context()) -> workspace_id ->> 'memberId')
      or target_role = ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role')
      or (((select private.aitask_rls_member_context()) -> workspace_id ->> 'isHod')::boolean and target_role = 'HOD')
      or (target_role = 'Project Manager' and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'isAdmin')::boolean)
      or (((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') = 'Client'
        and target_client_key = ((select private.aitask_rls_member_context()) -> workspace_id ->> 'clientKey'))))
  or (entity_type = 'service_package'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'manageServiceCatalog')::boolean)
  or (entity_type = 'service_workflow_template'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'manageTaskTemplates')::boolean)
  or (entity_type = 'service_pricing_snapshot'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'viewServicePrices')::boolean)
  or (entity_type = any (array['client_plan', 'addon', 'service_cycle', 'deliverable', 'cycle_comment'])
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and ((client_id is null and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'serviceNullClient')::boolean)
      or (workspace_id, client_id) in (select allowed.workspace_id, allowed.client_id from private.aitask_rls_service_clients() allowed)))
);

-- ---------------------------------------------------------------------------
-- 4. Portfolio restriction for Project Managers. USING only: WITH CHECK keeps
--    calling aitask_can_access_service_client for the row being written.
-- ---------------------------------------------------------------------------
alter policy "PM service records stay in portfolio" on public.aitask_entities
using (
  ((select private.aitask_rls_member_context()) -> workspace_id ->> 'isSuperAdmin')::boolean
  or ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Project Manager'
  or entity_type <> all (array['client_plan', 'addon', 'service_pricing_snapshot', 'service_cycle', 'deliverable', 'cycle_comment'])
  or (client_id is null and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'serviceNullClient')::boolean)
  or (workspace_id, client_id) in (select allowed.workspace_id, allowed.client_id from private.aitask_rls_service_clients() allowed)
);

-- ---------------------------------------------------------------------------
-- 5. Abort if any member can now read a different set of rows.
-- ---------------------------------------------------------------------------
do $verify$
declare
  actor record;
  original_sub text := current_setting('request.jwt.claim.sub', true);
  v_types text[];
  v_ids text[];
  v_changed integer;
begin
  for actor in select auth_user_id, workspace_id from public.aitask_members
    where auth_user_id is not null
  loop
    perform set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
    set local role authenticated;
    select array_agg(e.entity_type), array_agg(e.entity_id) into v_types, v_ids
    from public.aitask_entities e
    where e.workspace_id = actor.workspace_id;
    reset role;
    insert into aitask_rls_visible_after
      select actor.auth_user_id, t.entity_type, t.entity_id
      from unnest(v_types, v_ids) as t(entity_type, entity_id);
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);

  select count(*) into v_changed from (
    (select * from aitask_rls_visible_before except select * from aitask_rls_visible_after)
    union all
    (select * from aitask_rls_visible_after except select * from aitask_rls_visible_before)
  ) difference;
  if v_changed > 0 then
    raise exception 'RLS read speed-up changed % row visibility decision(s); nothing was applied', v_changed;
  end if;
end;
$verify$;

-- ---------------------------------------------------------------------------
-- Rollback (run as one transaction). The USING clauses are the production
-- definitions read on 10 Nov 2026.
-- ---------------------------------------------------------------------------
-- alter policy "members can read scoped entities" on public.aitask_entities
-- using (
--   ((entity_type = 'task') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_task(workspace_id, entity_id))
--   or ((entity_type = any (array['comment', 'approval'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_task(workspace_id, parent_id))
--   or ((entity_type = 'client') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_client(workspace_id, client_key))
--   or ((entity_type = 'project') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_project(workspace_id, entity_id))
--   or ((entity_type = 'task_status') and (private.aitask_member_id(workspace_id) is not null))
--   or ((entity_type = 'custom_role') and ((private.aitask_member_role(workspace_id) <> 'Client') or exists (
--        select 1 from public.aitask_members member
--        where member.workspace_id = aitask_entities.workspace_id
--          and member.auth_user_id = (select auth.uid())
--          and member.custom_role_id = aitask_entities.entity_id)))
--   or ((entity_type = 'registration') and private.aitask_is_super_admin(workspace_id))
--   or ((entity_type = 'notification') and ((target_user_id = private.aitask_member_id(workspace_id))
--        or ((target_role = private.aitask_member_role(workspace_id)) or (private.aitask_is_hod(workspace_id) and (target_role = 'HOD')))
--        or ((target_role = 'Project Manager') and private.aitask_is_admin(workspace_id))
--        or ((private.aitask_member_role(workspace_id) = 'Client') and (target_client_key = private.aitask_member_client_key(workspace_id)))))
--   or ((entity_type = 'service_package') and private.aitask_has_permission(workspace_id, 'manageServiceCatalog'))
--   or ((entity_type = 'service_workflow_template') and private.aitask_has_permission(workspace_id, 'manageTaskTemplates'))
--   or ((entity_type = 'service_pricing_snapshot') and private.aitask_has_permission(workspace_id, 'viewServicePrices'))
--   or ((entity_type = any (array['client_plan', 'addon'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_access_service_client(workspace_id, client_id))
--   or ((entity_type = any (array['service_cycle', 'deliverable', 'cycle_comment'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_access_service_client(workspace_id, client_id))
-- );
-- alter policy "PM service records stay in portfolio" on public.aitask_entities
-- using (
--   private.aitask_is_super_admin(workspace_id)
--   or (private.aitask_member_role(workspace_id) <> 'Project Manager')
--   or (entity_type <> all (array['client_plan', 'addon', 'service_pricing_snapshot', 'service_cycle', 'deliverable', 'cycle_comment']))
--   or private.aitask_can_access_service_client(workspace_id, client_id)
-- );
-- drop function private.aitask_rls_service_clients();
-- drop function private.aitask_rls_visible_entities();
-- drop function private.aitask_rls_member_context();
