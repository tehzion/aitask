begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008801','authenticated','authenticated','legacy-hod@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008802','authenticated','authenticated','legacy-staff-a@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008803','authenticated','authenticated','legacy-staff-b@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008804','authenticated','authenticated','legacy-designer@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-legacy-hod','Legacy HOD reassign');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('legacy-hod','pgtap-legacy-hod','00000000-0000-0000-0000-000000008801','HOD','legacy-hod@aitask.local','HOD','Video Editor','{"Video Editor"}','{}',false),
  ('legacy-staff-a','pgtap-legacy-hod','00000000-0000-0000-0000-000000008802','Staff A','legacy-staff-a@aitask.local','Staff','Video Editor','{"Video Editor"}','{}',false),
  ('legacy-staff-b','pgtap-legacy-hod','00000000-0000-0000-0000-000000008803','Staff B','legacy-staff-b@aitask.local','Staff','Video Editor','{"Video Editor"}','{}',false),
  ('legacy-designer','pgtap-legacy-hod','00000000-0000-0000-0000-000000008804','Designer','legacy-designer@aitask.local','Staff','Designer','{Designer}','{}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-legacy-hod','project','legacy-proj','{"id":"legacy-proj","projectName":"Retainer","clientName":"Co","projectManagerIds":["someone"],"hodMemberIds":["legacy-hod"],"staffMemberIds":["legacy-staff-a","legacy-staff-b"]}'),
  ('pgtap-legacy-hod','project','other-proj','{"id":"other-proj","projectName":"Other","clientName":"Co","projectManagerIds":["someone"],"hodMemberIds":[],"staffMemberIds":["legacy-staff-a","legacy-staff-b"]}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008801',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- An older task: Staff A holds it, and no responsible HOD was recorded.
select ok(private.aitask_task_assignment_is_valid('pgtap-legacy-hod','update',
  '{"department":"Video Editor","projectId":"legacy-proj","assignedTo":"legacy-staff-a","createdBy":"someone"}',
  '{"department":"Video Editor","projectId":"legacy-proj","assignedTo":"legacy-staff-b","createdBy":"someone","assignedBy":"legacy-hod","responsibleHodId":"legacy-hod","assignmentState":"assigned_staff"}'),
  'the department HOD on the project can hand an older task to other Staff');
select ok(not private.aitask_task_assignment_is_valid('pgtap-legacy-hod','update',
  '{"department":"Designer","projectId":"legacy-proj","assignedTo":"legacy-designer","createdBy":"someone"}',
  '{"department":"Designer","projectId":"legacy-proj","assignedTo":"legacy-staff-b","createdBy":"someone"}'),
  'an HOD still cannot reassign work outside their departments');
select ok(not private.aitask_task_assignment_is_valid('pgtap-legacy-hod','update',
  '{"department":"Video Editor","projectId":"other-proj","assignedTo":"legacy-staff-a","createdBy":"someone"}',
  '{"department":"Video Editor","projectId":"other-proj","assignedTo":"legacy-staff-b","createdBy":"someone"}'),
  'an HOD still cannot reassign work on a project they are not assigned to');
select ok(not private.aitask_task_assignment_is_valid('pgtap-legacy-hod','update',
  '{"department":"Video Editor","projectId":"legacy-proj","assignedTo":"legacy-staff-a","createdBy":"someone","responsibleHodId":"another-hod"}',
  '{"department":"Video Editor","projectId":"legacy-proj","assignedTo":"legacy-staff-b","createdBy":"someone","responsibleHodId":"another-hod"}'),
  'a task that names another responsible HOD stays with that HOD');

select * from finish();
rollback;
