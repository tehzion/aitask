begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008601','authenticated','authenticated','stamp-hod@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-assigned-at','Assigned at format');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('stamp-hod','pgtap-assigned-at','00000000-0000-0000-0000-000000008601','HOD','stamp-hod@aitask.local','HOD','Designer','{Designer}','{}',false);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008601',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Older rows hold the Postgres text form; the app sends the JavaScript form.
select ok(not private.aitask_restricted_task_field_changed('assignedAt',
  '"2026-07-21T11:01:04.630301+00:00"', '"2026-07-21T11:01:04.630Z"'),
  'the same instant in another format is not a change');
select ok(private.aitask_restricted_task_field_changed('assignedAt',
  '"2026-07-21T11:01:04.630301+00:00"', '"2026-07-22T11:01:04.630Z"'),
  'a different instant is still a change');
select ok(private.aitask_restricted_task_field_changed('assignedAt',
  '"2026-07-21T11:01:04.630Z"', '"not a date"'),
  'an unreadable value is still a change');
select ok(private.aitask_restricted_task_field_changed('assignedAt',
  '"2026-07-21T11:01:04.630Z"', null),
  'removing the timestamp is still a change');

select ok(private.aitask_hod_task_execution_patch_is_valid('pgtap-assigned-at',
  '{"assignedTo":"staff-x","status":"Waiting Approval","assignedAt":"2026-07-21T11:01:04.630301+00:00"}',
  '{"assignedTo":"staff-x","status":"Approved","assignedAt":"2026-07-21T11:01:04.630Z"}'),
  'an HOD can approve an older task the app re-sends with a reformatted timestamp');
select ok(not private.aitask_hod_task_execution_patch_is_valid('pgtap-assigned-at',
  '{"assignedTo":"staff-x","assignedAt":"2026-07-21T11:01:04.630301+00:00"}',
  '{"assignedTo":"staff-x","assignedAt":"2026-08-01T00:00:00.000Z"}'),
  'an HOD still cannot rewrite the assignment time');

select * from finish();
rollback;
