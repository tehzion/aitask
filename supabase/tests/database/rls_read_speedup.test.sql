begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Seed one workspace with every role. Triggers are bypassed only for seeding.
-- ---------------------------------------------------------------------------
set local session_replication_role = replica;

insert into public.aitask_workspaces (id, name) values ('ws-rls', 'RLS read check');

create temporary table rls_seed_members (id text, role text, super_admin boolean, custom_role text, deps text[], client_name text);
insert into rls_seed_members values
  ('r-sa',   'Project Manager', true,  null,          '{}',                     null),
  ('r-pm1',  'Project Manager', false, null,          '{}',                     null),
  ('r-pm2',  'Project Manager', false, null,          '{}',                     null),
  ('r-hod',  'HOD',             false, null,          '{Designer}',             null),
  ('r-hod2', 'Staff',           false, 'builtin-hod', '{Operation}',            null),
  ('r-s1',   'Staff',           false, null,          '{Designer}',             null),
  ('r-s2',   'Staff',           false, null,          '{Management,Designer}',  null),
  ('r-cl',   'Client',          false, null,          '{Client}',               'client1');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('00000000-0000-4000-9000-0000000000' || lpad((row_number() over (order by id))::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', id || '@rls.test', 'x', now(), now()
from rls_seed_members;

insert into public.aitask_members (id, workspace_id, auth_user_id, name, email, role, department, departments, client_name, is_super_admin, custom_role_id)
select m.id, 'ws-rls',
  ('00000000-0000-4000-9000-0000000000' || lpad((row_number() over (order by m.id))::text, 2, '0'))::uuid,
  m.id, m.id || '@rls.test', m.role, coalesce(m.deps[1], 'Management'), m.deps, m.client_name, m.super_admin, m.custom_role
from rls_seed_members m;

-- A login that belongs to no workspace.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-9000-000000000099', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@rls.test', 'x', now(), now());

insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, created_by, data)
select 'ws-rls', 'client', 'c' || g, 'client' || g, (array['r-pm1', 'r-pm2', 'r-sa', 'r-s1', 'r-hod'])[1 + g % 5], '{}'::jsonb
from generate_series(1, 8) g;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, created_by, data)
select 'ws-rls', 'project', 'p' || g, 'client' || (1 + g % 8), 'c' || (1 + g % 8), (array['r-pm1', 'r-pm2', 'r-sa', 'r-hod'])[1 + g % 4],
  jsonb_build_object(
    'projectManagerIds', jsonb_build_array((array['r-pm1', 'r-pm2'])[1 + g % 2]),
    'hodMemberIds', jsonb_build_array((array['r-hod', 'r-hod2'])[1 + g % 2]),
    'staffMemberIds', jsonb_build_array((array['r-s1', 'r-s2'])[1 + g % 2]))
from generate_series(1, 8) g;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, client_key, client_id, assigned_to, created_by, data)
select 'ws-rls', 'task', 't' || g, 'p' || (1 + g % 8), 'client' || (1 + g % 8), 'c' || (1 + g % 8),
  case when g % 7 = 0 then null else (array['r-s1', 'r-s2', 'r-pm1', 'r-pm2', 'r-hod', 'r-hod2'])[1 + g % 6] end,
  (array['r-pm1', 'r-pm2', 'r-sa', 'r-hod', 'r-s1'])[1 + g % 5],
  jsonb_build_object('projectId', case when g % 5 = 0 then null else 'p' || (1 + g % 8) end,
    'department', (array['Designer', 'Operation', 'Management'])[1 + g % 3])
from generate_series(1, 48) g;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, client_key, created_by, data)
select 'ws-rls', (array['comment', 'approval'])[1 + g % 2], 'x' || g, 't' || (1 + g % 48), 'client' || (1 + g % 8), 'r-pm1', '{}'::jsonb
from generate_series(1, 30) g;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, client_key, client_id, created_by, data)
select 'ws-rls', (array['client_plan', 'service_cycle', 'deliverable', 'addon', 'service_pricing_snapshot', 'cycle_comment'])[1 + g % 6],
  's' || g, 'c' || (1 + g % 8), 'client' || (1 + g % 8), 'c' || (1 + g % 8), 'r-pm1', '{}'::jsonb
from generate_series(1, 36) g;
insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, client_key, client_id, created_by, data)
values ('ws-rls', 'service_cycle_payment', 'pay1', 's1', 'client1', 'c1', 'r-pm1', '{"clientId":"c1","cycleId":"s1"}');

-- A service record with no client id, to cover the NULL-client branch.
insert into public.aitask_entities (workspace_id, entity_type, entity_id, data)
values ('ws-rls', 'client_plan', 'orphan-plan', '{}');

insert into public.aitask_entities (workspace_id, entity_type, entity_id, data)
values ('ws-rls', 'task_status', 'ts1', '{}'), ('ws-rls', 'service_package', 'sp1', '{}'),
  ('ws-rls', 'service_workflow_template', 'wt1', '{}'), ('ws-rls', 'registration', 'reg1', '{}'),
  ('ws-rls', 'custom_role', 'role-x', '{}');

insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, target_user_id, target_role, target_client_key, data)
select 'ws-rls', 'notification', 'n' || g, 'client' || (1 + g % 8),
  case when g % 4 = 0 then (array['r-s1', 'r-pm1', 'r-hod', 'r-cl'])[1 + g % 4] end,
  case when g % 4 = 1 then (array['Staff', 'Project Manager', 'HOD', 'Client'])[1 + g % 4] end,
  case when g % 4 = 2 then 'client1' end,
  '{}'::jsonb
from generate_series(1, 40) g;

set local session_replication_role = origin;

-- ---------------------------------------------------------------------------
-- Helpers. The reference rule below is the read policy exactly as it was before
-- the speed-up (plus the restrictive and cycle-payment policies), evaluated with
-- row security bypassed. The real read, through row security, must equal it.
-- ---------------------------------------------------------------------------
create function pg_temp.set_actor(p_member text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select auth_user_id from public.aitask_members where id = p_member),
    'role', 'authenticated')::text, true);
end $$;

create function pg_temp.rls_rows(p_member text) returns text[] language plpgsql as $$
declare v_rows text[];
begin
  perform pg_temp.set_actor(p_member);
  set local role authenticated;
  select coalesce(array_agg(entity_type || '/' || entity_id order by entity_type, entity_id), '{}') into v_rows
  from public.aitask_entities where workspace_id = 'ws-rls';
  reset role;
  return v_rows;
end $$;

create function pg_temp.reference_rows(p_member text) returns text[] language plpgsql as $$
declare v_rows text[];
begin
  perform pg_temp.set_actor(p_member);
  select coalesce(array_agg(entity_type || '/' || entity_id order by entity_type, entity_id), '{}') into v_rows
  from public.aitask_entities
  where workspace_id = 'ws-rls'
    and (
      ((entity_type = 'task') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_task(workspace_id, entity_id))
      or ((entity_type = any (array['comment', 'approval'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_task(workspace_id, parent_id))
      or ((entity_type = 'client') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_client(workspace_id, client_key))
      or ((entity_type = 'project') and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_view_project(workspace_id, entity_id))
      or ((entity_type = 'task_status') and (private.aitask_member_id(workspace_id) is not null))
      or ((entity_type = 'custom_role') and ((private.aitask_member_role(workspace_id) <> 'Client') or exists (
           select 1 from public.aitask_members member
           where member.workspace_id = aitask_entities.workspace_id
             and member.auth_user_id = (select auth.uid())
             and member.custom_role_id = aitask_entities.entity_id)))
      or ((entity_type = 'registration') and private.aitask_is_super_admin(workspace_id))
      or ((entity_type = 'notification') and ((target_user_id = private.aitask_member_id(workspace_id))
           or ((target_role = private.aitask_member_role(workspace_id)) or (private.aitask_is_hod(workspace_id) and (target_role = 'HOD')))
           or ((target_role = 'Project Manager') and private.aitask_is_admin(workspace_id))
           or ((private.aitask_member_role(workspace_id) = 'Client') and (target_client_key = private.aitask_member_client_key(workspace_id)))))
      or ((entity_type = 'service_package') and private.aitask_has_permission(workspace_id, 'manageServiceCatalog'))
      or ((entity_type = 'service_workflow_template') and private.aitask_has_permission(workspace_id, 'manageTaskTemplates'))
      or ((entity_type = 'service_pricing_snapshot') and private.aitask_has_permission(workspace_id, 'viewServicePrices'))
      or ((entity_type = any (array['client_plan', 'addon'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_access_service_client(workspace_id, client_id))
      or ((entity_type = any (array['service_cycle', 'deliverable', 'cycle_comment'])) and (private.aitask_member_role(workspace_id) <> 'Client') and private.aitask_can_access_service_client(workspace_id, client_id))
      or ((entity_type = 'service_cycle_payment') and (private.aitask_member_id(workspace_id) is not null) and (private.aitask_member_role(workspace_id) <> 'Client')
           and private.aitask_has_permission(workspace_id, 'viewServicePrices') and private.aitask_can_access_service_client(workspace_id, (data ->> 'clientId')))
    )
    -- restrictive: Project Managers stay inside their portfolio
    and (private.aitask_is_super_admin(workspace_id)
      or (private.aitask_member_role(workspace_id) <> 'Project Manager')
      or (entity_type <> all (array['client_plan', 'addon', 'service_pricing_snapshot', 'service_cycle', 'deliverable', 'cycle_comment']))
      or private.aitask_can_access_service_client(workspace_id, client_id))
    -- restrictive: cycle payments need financial access
    and ((entity_type <> 'service_cycle_payment')
      or ((private.aitask_member_id(workspace_id) is not null) and (private.aitask_member_role(workspace_id) <> 'Client')
        and private.aitask_has_permission(workspace_id, 'viewServicePrices')
        and private.aitask_can_access_service_client(workspace_id, (data ->> 'clientId'))));
  return v_rows;
end $$;

create function pg_temp.outsider_row_count() returns integer language plpgsql as $$
declare v_count integer;
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-4000-9000-000000000099', 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*)::integer into v_count from public.aitask_entities where workspace_id = 'ws-rls';
  reset role;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Objects and grants
-- ---------------------------------------------------------------------------
select has_function('private', 'aitask_rls_member_context', array[]::text[], 'member context helper exists');
select has_function('private', 'aitask_rls_visible_entities', array[]::text[], 'visible entity set helper exists');
select has_function('private', 'aitask_rls_service_clients', array[]::text[], 'service client set helper exists');

select ok(
  not has_function_privilege('anon', 'private.aitask_rls_member_context()', 'execute')
  and not has_function_privilege('anon', 'private.aitask_rls_visible_entities()', 'execute')
  and not has_function_privilege('anon', 'private.aitask_rls_service_clients()', 'execute'),
  'anonymous callers cannot run the row-security helpers'
);

select ok(
  has_function_privilege('authenticated', 'private.aitask_rls_member_context()', 'execute')
  and has_function_privilege('authenticated', 'private.aitask_rls_visible_entities()', 'execute')
  and has_function_privilege('authenticated', 'private.aitask_rls_service_clients()', 'execute'),
  'signed-in callers can run the row-security helpers their policies need'
);

select is(
  (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'aitask_entities'),
  array[
    'PM service records stay in portfolio',
    'cycle payments require financial access',
    'internal price readers can read cycle payments',
    'members can delete authorized entities',
    'members can insert authorized entities',
    'members can read scoped entities',
    'members can update authorized entities'
  ]::name[],
  'the entity policies keep their names'
);

-- ---------------------------------------------------------------------------
-- Every login reads exactly what the previous per-row rule allowed.
-- ---------------------------------------------------------------------------
select is(pg_temp.rls_rows('r-sa'),   pg_temp.reference_rows('r-sa'),   'super admin reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-pm1'),  pg_temp.reference_rows('r-pm1'),  'project manager one reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-pm2'),  pg_temp.reference_rows('r-pm2'),  'project manager two reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-hod'),  pg_temp.reference_rows('r-hod'),  'HOD reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-hod2'), pg_temp.reference_rows('r-hod2'), 'built-in HOD staff reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-s1'),   pg_temp.reference_rows('r-s1'),   'staff one reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-s2'),   pg_temp.reference_rows('r-s2'),   'staff two reads the same rows as the per-row rule');
select is(pg_temp.rls_rows('r-cl'),   pg_temp.reference_rows('r-cl'),   'client reads the same rows as the per-row rule');

-- ---------------------------------------------------------------------------
-- The comparison above is only meaningful if the rule lets real rows through
-- for some logins and keeps them out for others.
-- ---------------------------------------------------------------------------
select cmp_ok(cardinality(pg_temp.rls_rows('r-pm1')), '>', 20, 'a project manager can read workspace rows');

select ok(
  not exists (
    select 1 from unnest(pg_temp.rls_rows('r-cl')) as row_key
    where row_key like 'task/%' or row_key like 'comment/%' or row_key like 'approval/%'
      or row_key like 'client/%' or row_key like 'project/%'
  ),
  'a client cannot read tasks, comments, approvals, clients or projects directly'
);

select is(
  pg_temp.outsider_row_count(),
  0,
  'a login that belongs to no workspace reads nothing'
);

select finish();

rollback;
