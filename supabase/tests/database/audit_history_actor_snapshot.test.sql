begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.aitask_workspaces (id, name) values ('pgtap-actor-snapshot', 'Actor snapshot');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-b000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'snapshot-actor@example.test', 'x', now(), now());
insert into public.aitask_members (id, workspace_id, auth_user_id, name, email, role, department, departments, is_super_admin, avatar)
values ('pgtap-snapshot-actor', 'pgtap-actor-snapshot', '00000000-0000-4000-b000-000000000001', 'Snapshot Actor',
  'snapshot-actor@example.test', 'Project Manager', 'Management', '{}', true, repeat('a', 5000));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000001","role":"authenticated"}', true);

-- An acting member changes a workspace entity, which fires the entity history trigger.
insert into public.aitask_entities (workspace_id, entity_type, entity_id, data)
values ('pgtap-actor-snapshot', 'task_status', 'snapshot-status', '{}'::jsonb);

-- The same member edits another member, which fires the member history trigger.
update public.aitask_members set name = 'Snapshot Actor Renamed' where id = 'pgtap-snapshot-actor';

select is(
  (select count(*)::integer from public.aitask_entity_history where workspace_id = 'pgtap-actor-snapshot' and actor_member_id = 'pgtap-snapshot-actor'),
  2,
  'the entity change and the member edit were each recorded with the acting member'
);

select ok(
  not exists (
    select 1 from public.aitask_entity_history
    where workspace_id = 'pgtap-actor-snapshot' and actor_snapshot ? 'avatar'
  ),
  'no history row keeps the actor avatar'
);

select is(
  (select actor_snapshot ->> 'name' from public.aitask_entity_history
   where workspace_id = 'pgtap-actor-snapshot' and entity_type = 'task_status'),
  'Snapshot Actor',
  'the entity history row still records who acted'
);

select ok(
  (select actor_snapshot ?& array['id', 'workspace_id', 'email', 'role', 'departments', 'is_super_admin']
   from public.aitask_entity_history
   where workspace_id = 'pgtap-actor-snapshot' and entity_type = 'task_status'),
  'the other identity fields stay in the snapshot'
);

select ok(
  (select after_data ->> 'avatar' is not null from public.aitask_entity_history
   where workspace_id = 'pgtap-actor-snapshot' and entity_type = 'member' and action = 'update'),
  'member before and after values are unchanged and still hold the record itself'
);

select finish();

rollback;
