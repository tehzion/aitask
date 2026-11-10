-- DRAFT, NOT APPLIED. Review before use.
--
-- Purpose: make reads of public.aitask_entities evaluate row security once per
-- statement instead of once per row. No access decision is meant to change.
--
-- Baseline (production, 10 Nov 2026, read-only EXPLAIN as a Project Manager):
--   load every non-notification entity: 601 ms, 20,750 buffer hits, 1,256 rows
--   scanned for 209 visible. All of the time is in the RLS filter.
--
-- Why it is slow today
--   1. Helpers that depend only on the signed-in member (aitask_member_role,
--      aitask_member_id, aitask_is_super_admin, aitask_has_permission, ...) run
--      for every row. Each is a SECURITY DEFINER function, so it cannot be
--      inlined and re-reads aitask_members each time.
--   2. aitask_can_access_service_client runs for every plan, cycle, deliverable,
--      add-on and price snapshot row (about 390 rows) although there are only
--      about 43 distinct clients.
--   3. aitask_can_view_task runs once per comment and approval as well as once
--      per task.
--
-- What this draft does
--   * One jsonb "member context" per statement (an uncorrelated sub-select, so
--     Postgres runs it once as an InitPlan) replaces the per-row helper calls.
--   * Four set-returning functions list what the member can see (tasks,
--     projects, clients, service clients). The policies test membership with
--     IN (...), which Postgres hashes once per statement.
--   * Every set is built by calling the EXISTING decision functions, so the
--     rules themselves are not rewritten here.
--   * Policy names, commands, roles and WITH CHECK clauses are unchanged
--     (ALTER POLICY ... USING only). Both cycle-payment policies are untouched.
--
-- Safety net
--   The migration records, for every member with a login, exactly which rows
--   row security lets them read before the change, repeats that after the
--   change, and aborts (rolling everything back) if any row differs.
--
-- Before this can ship (same PR)
--   1. Move to supabase/migrations/<timestamp>_rls_read_speedup.sql. It is kept
--      in supabase/drafts so `pnpm verify:release-db-alignment` stays green.
--   2. Update two tests that match policy text literally:
--        supabase/tests/database/client_read_privacy.test.sql (line 66) expects
--          "...AND(private.aitask_member_role(workspace_id)<>'Client'::text)"
--          in the comment/approval branch; the new text reads the role from
--          private.aitask_rls_member_context().
--        supabase/tests/database/project_manager_hod_role_model.test.sql
--          (line 68) expects some policy to contain "private.aitask_is_hod";
--          the new policy reads isHod from the context instead.
--   3. Regenerate supabase/schema.sql and the schema fingerprint / release
--      manifest in supabase/preflight.
--   4. Run on a Supabase branch first and compare EXPLAIN (ANALYZE, BUFFERS)
--      for a Project Manager, an HOD, a Staff member and a Client.
--   5. ALTER POLICY takes a brief exclusive lock on aitask_entities and the
--      two verification passes read the table once per member. Apply in a
--      quiet period.
--
-- Read-only check on production (10 Nov 2026, no DDL, nothing written)
--   The new predicates were run as plain SQL with the function bodies inlined
--   and compared with what real row security returns, for all 11 members with
--   a login. Every member saw exactly the same rows. Time to read the whole
--   workspace, old -> new:
--     Staff (4)            1,320-1,441 ms -> 485-600 ms
--     HOD (1)              1,238 ms       -> 301 ms
--     Project Manager (4)  379-426 ms     -> 219-291 ms
--     Super admin (1)      117 ms         -> 48 ms
--     Client (1)           144 ms         -> 16 ms
--   This checks the logic, not the functions and policies as deployed, so the
--   branch run in step 4 is still required. Staff stay the slowest because the
--   remaining time is inside aitask_can_view_client and aitask_can_view_project,
--   which rescan tasks per client and per project. Rewriting those is a second,
--   riskier pass and is deliberately not part of this draft.
--
-- Not covered: aitask_get_workflow_task_context and aitask_read_notifications
-- are separate functions with their own checks and need their own pass.

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
-- 2. Visible sets. Each calls the existing decision function once per
--    candidate, instead of once per row that refers to the candidate.
-- ---------------------------------------------------------------------------
create or replace function private.aitask_rls_visible_tasks()
returns table (workspace_id text, entity_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select task.workspace_id, task.entity_id
  from public.aitask_entities task
  where task.entity_type = 'task'
    and task.workspace_id in (
      select member.workspace_id from public.aitask_members member
      where member.auth_user_id = (select auth.uid())
    )
    and private.aitask_can_view_task(task.workspace_id, task.entity_id);
$$;

create or replace function private.aitask_rls_visible_projects()
returns table (workspace_id text, entity_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select project.workspace_id, project.entity_id
  from public.aitask_entities project
  where project.entity_type = 'project'
    and project.workspace_id in (
      select member.workspace_id from public.aitask_members member
      where member.auth_user_id = (select auth.uid())
    )
    and private.aitask_can_view_project(project.workspace_id, project.entity_id);
$$;

-- Keyed by the client row's own id, so a client row with no client_key keeps
-- whatever aitask_can_view_client(workspace, null) decides today.
create or replace function private.aitask_rls_visible_clients()
returns table (workspace_id text, entity_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select client.workspace_id, client.entity_id
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
revoke all on function private.aitask_rls_visible_tasks() from public, anon;
revoke all on function private.aitask_rls_visible_projects() from public, anon;
revoke all on function private.aitask_rls_visible_clients() from public, anon;
revoke all on function private.aitask_rls_service_clients() from public, anon;
grant execute on function private.aitask_rls_member_context() to authenticated, service_role;
grant execute on function private.aitask_rls_visible_tasks() to authenticated, service_role;
grant execute on function private.aitask_rls_visible_projects() to authenticated, service_role;
grant execute on function private.aitask_rls_visible_clients() to authenticated, service_role;
grant execute on function private.aitask_rls_service_clients() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Read policy. Same branches, in the same order, as the current policy.
--    A NULL from the context behaves as it does today: the branch does not
--    grant access.
-- ---------------------------------------------------------------------------
alter policy "members can read scoped entities" on public.aitask_entities
using (
  (entity_type = 'task'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and (workspace_id, entity_id) in (select visible.workspace_id, visible.entity_id from private.aitask_rls_visible_tasks() visible))
  or (entity_type = any (array['comment', 'approval'])
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and (workspace_id, parent_id) in (select visible.workspace_id, visible.entity_id from private.aitask_rls_visible_tasks() visible))
  or (entity_type = 'client'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and (workspace_id, entity_id) in (select visible.workspace_id, visible.entity_id from private.aitask_rls_visible_clients() visible))
  or (entity_type = 'project'
    and ((select private.aitask_rls_member_context()) -> workspace_id ->> 'role') <> 'Client'
    and (workspace_id, entity_id) in (select visible.workspace_id, visible.entity_id from private.aitask_rls_visible_projects() visible))
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
--        or (target_role = private.aitask_member_role(workspace_id))
--        or (private.aitask_is_hod(workspace_id) and (target_role = 'HOD'))
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
-- drop function private.aitask_rls_visible_clients();
-- drop function private.aitask_rls_visible_projects();
-- drop function private.aitask_rls_visible_tasks();
-- drop function private.aitask_rls_member_context();
