begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008501','authenticated','authenticated','output-hod@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-output','HOD output files');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('output-hod','pgtap-hod-output','00000000-0000-0000-0000-000000008501','HOD','output-hod@aitask.local','HOD','Video Editor','{"Video Editor"}','{}',false);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008501',true);
select set_config('request.jwt.claim.role','authenticated',true);

select ok(private.aitask_hod_task_execution_patch_is_valid('pgtap-hod-output',
  '{"assignedTo":"output-hod"}', '{"assignedTo":"output-hod","outputAttachments":[{"id":"f1"}]}'),
  'an HOD doing the task themselves may attach output files');
select ok(not private.aitask_hod_task_execution_patch_is_valid('pgtap-hod-output',
  '{"assignedTo":"staff-x"}', '{"assignedTo":"staff-x","outputAttachments":[{"id":"f1"}]}'),
  'an HOD still cannot change output files on work routed to Staff');
select ok(not private.aitask_hod_task_execution_patch_is_valid('pgtap-hod-output',
  '{"assignedTo":"output-hod"}', '{"assignedTo":"output-hod","department":"Designer"}'),
  'other restricted fields stay protected on the HOD''s own task');

select * from finish();
rollback;
