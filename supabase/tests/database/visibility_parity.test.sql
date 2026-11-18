begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- The same fixture and expected lists as src/lib/visibilityParity.test.ts:
-- what the client shows each member must equal what the database lets them
-- read. Change both files together.
set local session_replication_role = replica;

insert into public.aitask_workspaces (id, name) values ('ws-parity', 'Visibility parity');

create temporary table parity_members (id text, role text, deps text[], n int);
insert into parity_members values
  ('par-pm-a', 'Project Manager', '{Management}', 1),
  ('par-pm-b', 'Project Manager', '{Management}', 2),
  ('par-hod', 'HOD', '{Designer}', 3),
  ('par-staff-1', 'Staff', '{Designer}', 4),
  ('par-staff-2', 'Staff', '{"Video Editor"}', 5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('00000000-0000-4000-9000-00000000010' || n)::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', id || '@parity.test', 'x', now(), now()
from parity_members;

insert into public.aitask_members (id, workspace_id, auth_user_id, name, email, role, department, departments)
select id, 'ws-parity', ('00000000-0000-4000-9000-00000000010' || n)::uuid, id, id || '@parity.test', role, deps[1], deps
from parity_members;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, created_by, data) values
  ('ws-parity', 'client', 'par-c-a', 'alpha co', 'par-pm-a', '{"id":"par-c-a","clientName":"Alpha Co","createdBy":"par-pm-a"}'),
  ('ws-parity', 'client', 'par-c-b', 'beta co', 'par-pm-b', '{"id":"par-c-b","clientName":"Beta Co","createdBy":"par-pm-b"}');

insert into public.aitask_entities (workspace_id, entity_type, entity_id, client_key, client_id, created_by, data) values
  ('ws-parity', 'project', 'par-p-a', 'alpha co', 'par-c-a', 'par-pm-a', '{"id":"par-p-a","clientId":"par-c-a","clientName":"Alpha Co","projectManagerIds":["par-pm-a"],"hodMemberIds":["par-hod"]}'),
  ('ws-parity', 'project', 'par-p-b', 'beta co', 'par-c-b', 'par-pm-b', '{"id":"par-p-b","clientId":"par-c-b","clientName":"Beta Co","projectManagerIds":["par-pm-b"],"hodMemberIds":[]}');

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, client_key, client_id, assigned_to, created_by, data) values
  ('ws-parity', 'task', 'par-t1', 'par-p-a', 'alpha co', 'par-c-a', 'par-staff-1', 'par-pm-a', '{"id":"par-t1","projectId":"par-p-a","clientId":"par-c-a","clientName":"Alpha Co","department":"Designer","assignedTo":"par-staff-1","responsibleHodId":"par-hod","createdBy":"par-pm-a","status":"Pending","visibility":"internal"}'),
  ('ws-parity', 'task', 'par-t2', 'par-p-a', 'alpha co', 'par-c-a', null, 'par-pm-a', '{"id":"par-t2","projectId":"par-p-a","clientId":"par-c-a","clientName":"Alpha Co","department":"Designer","createdBy":"par-pm-a","status":"Pending","visibility":"internal"}'),
  ('ws-parity', 'task', 'par-t3', 'par-p-b', 'beta co', 'par-c-b', 'par-staff-2', 'par-pm-b', '{"id":"par-t3","projectId":"par-p-b","clientId":"par-c-b","clientName":"Beta Co","department":"Video Editor","assignedTo":"par-staff-2","createdBy":"par-pm-b","status":"Pending","visibility":"internal"}'),
  ('ws-parity', 'task', 'par-t4', null, 'alpha co', 'par-c-a', null, 'par-pm-a', '{"id":"par-t4","clientId":"par-c-a","clientName":"Alpha Co","department":"Designer","createdBy":"par-pm-a","status":"Pending","visibility":"internal"}'),
  ('ws-parity', 'task', 'par-t5', 'par-p-b', 'beta co', 'par-c-b', 'par-staff-1', 'par-pm-b', '{"id":"par-t5","projectId":"par-p-b","clientId":"par-c-b","clientName":"Beta Co","department":"Designer","assignedTo":"par-staff-1","createdBy":"par-pm-b","status":"Pending","visibility":"internal"}'),
  ('ws-parity', 'task', 'par-t6', null, 'beta co', 'par-c-b', 'par-hod', 'par-pm-b', '{"id":"par-t6","clientId":"par-c-b","clientName":"Beta Co","department":"Designer","assignedTo":"par-hod","createdBy":"par-pm-b","status":"Pending","visibility":"internal"}');

set local session_replication_role = origin;

create function pg_temp.visible_tasks(p_member text) returns text[] language plpgsql as $$
declare v_rows text[];
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select auth_user_id from public.aitask_members where id = p_member), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(array_agg(entity_id order by entity_id), '{}') into v_rows
  from public.aitask_entities where workspace_id = 'ws-parity' and entity_type = 'task';
  reset role;
  return v_rows;
end $$;

select is(pg_temp.visible_tasks('par-pm-a'), array['par-t1','par-t2','par-t4'], 'PM A reads exactly the tasks the client shows');
select is(pg_temp.visible_tasks('par-pm-b'), array['par-t3','par-t5','par-t6'], 'PM B reads exactly the tasks the client shows');
select is(pg_temp.visible_tasks('par-hod'), array['par-t1','par-t2','par-t4','par-t6'], 'HOD reads exactly the tasks the client shows');
select is(pg_temp.visible_tasks('par-staff-1'), array['par-t1','par-t5'], 'Staff 1 reads exactly the tasks the client shows');
select is(pg_temp.visible_tasks('par-staff-2'), array['par-t3'], 'Staff 2 reads exactly the tasks the client shows');

select * from finish();
rollback;
