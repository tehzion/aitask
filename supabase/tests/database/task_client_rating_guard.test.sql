begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007901', 'authenticated', 'authenticated', 'rate-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000007902', 'authenticated', 'authenticated', 'rate-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.aitask_workspaces(id, name) values ('pgtap-task-rating', 'Task rating guard');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin) values
  ('rate-pm', 'pgtap-task-rating', '00000000-0000-0000-0000-000000007901', 'Rate PM', 'rate-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('rate-staff', 'pgtap-task-rating', '00000000-0000-0000-0000-000000007902', 'Rate Staff', 'rate-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}'::jsonb, false);
insert into public.aitask_entities(workspace_id, entity_type, entity_id, client_key, created_by, assigned_to, data) values
  ('pgtap-task-rating', 'task', 'rated-task', 'rate co', 'rate-pm', 'rate-staff', '{"id":"rated-task","clientName":"Rate Co","department":"Designer","assignedTo":"rate-staff","createdBy":"rate-pm","status":"Completed","isCompleted":true,"visibility":"client-visible"}');

create function pg_temp.patch_task(p_sub text, p_patch jsonb) returns jsonb language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub, true);
  return public.aitask_execute_command(
    'pgtap-task-rating', gen_random_uuid(), 'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'rated-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-task-rating' and entity_id = 'rated-task'),
      'data', (select data from public.aitask_entities where workspace_id = 'pgtap-task-rating' and entity_id = 'rated-task') || p_patch
    ))
  );
end $$;

select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007901',
  '{"clientRating":{"stars":4,"ratedBy":"rate-pm","ratedAt":"2026-11-19T01:00:00.000Z"}}') ->> 'ok')::boolean, true,
  'a Project Manager can rate a delivery');
select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007901',
  '{"clientRating":{"stars":9,"ratedBy":"rate-pm","ratedAt":"2026-11-19T01:00:00.000Z"}}') ->> 'ok')::boolean, false,
  'out-of-range stars are refused');
select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007902',
  '{"clientRating":{"stars":5,"ratedBy":"rate-staff","ratedAt":"2026-11-19T02:00:00.000Z"}}') ->> 'ok')::boolean, false,
  'Staff cannot change the rating');
select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007902', '{"clientRating":null}') ->> 'ok')::boolean, false,
  'Staff cannot remove the rating');

select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007902',
  '{"brief":{"references":[],"mustHave":"Do everything","updatedBy":"rate-staff","updatedAt":"2026-11-19T02:00:00.000Z"}}') ->> 'ok')::boolean, false,
  'Staff cannot write the client brief');
select is((pg_temp.patch_task('00000000-0000-0000-0000-000000007901',
  '{"brief":{"references":["https://example.com/ref"],"mustHave":"Logo top left","updatedBy":"rate-pm","updatedAt":"2026-11-19T01:30:00.000Z"}}') ->> 'ok')::boolean, true,
  'a Project Manager can write the client brief');

reset role;
select is((select data -> 'clientRating' ->> 'stars' from public.aitask_entities where workspace_id = 'pgtap-task-rating' and entity_id = 'rated-task'), '4',
  'the PM rating is the one stored');

select * from finish();
rollback;
