begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009401','authenticated','authenticated','hod-project-hod@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009402','authenticated','authenticated','hod-project-pm@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009403','authenticated','authenticated','hod-project-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-hod-project','HOD project management');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions) values
  ('hod-project-hod','pgtap-hod-project','00000000-0000-0000-0000-000000009401','Project HOD','hod-project-hod@aitask.local','HOD','Designer',array['Designer'],'{}'),
  ('hod-project-pm','pgtap-hod-project','00000000-0000-0000-0000-000000009402','Project PM','hod-project-pm@aitask.local','Project Manager','Management',array['Management'],'{}'),
  ('hod-project-staff','pgtap-hod-project','00000000-0000-0000-0000-000000009403','Release Staff','hod-project-staff@aitask.local','Staff','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-hod-project','client','hod-project-company','{"id":"hod-project-company","clientName":"HOD Company","createdBy":"hod-project-pm"}'),
  ('pgtap-hod-project','project','hod-project','{"id":"hod-project","clientId":"hod-project-company","clientName":"HOD Company","projectName":"HOD project","services":["Design"],"startDate":"2026-10-01","deadline":"2026-11-30","projectManagerIds":["hod-project-pm"],"hodMemberIds":["hod-project-hod"],"staffMemberIds":[],"createdBy":"hod-project-pm","status":"Active","defaultApprovalMode":"hod","requireClearClosureChecklist":false,"memberResponsibilities":{},"milestones":[]}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009401',true);
select set_config('request.jwt.claim.role','authenticated',true);

select ok(private.aitask_can_mutate_entity(
  'pgtap-hod-project','update','project','hod-project',null,
  (select data from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project'),
  (select data || jsonb_build_object('projectName','HOD project updated','staffMemberIds',jsonb_build_array('hod-project-staff'),'memberResponsibilities',jsonb_build_object('hod-project-staff','Delivery lead')) from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project')
), 'assigned HOD updates project details and staff');

select ok(not private.aitask_can_mutate_entity(
  'pgtap-hod-project','update','project','hod-project',null,
  (select data from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project'),
  (select data || '{"clientName":"Other Company"}'::jsonb from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project')
), 'assigned HOD cannot change the company link');

select ok(not private.aitask_can_mutate_entity(
  'pgtap-hod-project','update','project','hod-project',null,
  (select data from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project'),
  (select data || '{"hodMemberIds":[]}'::jsonb from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project')
), 'assigned HOD cannot change HOD membership');

select ok(not private.aitask_can_mutate_entity(
  'pgtap-hod-project','update','project','hod-project',null,
  (select data from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project'),
  (select data || '{"projectManagerIds":["hod-project-hod"]}'::jsonb from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project')
), 'assigned HOD cannot change Project Manager assignments');

select ok(not private.aitask_can_mutate_entity(
  'pgtap-hod-project','delete','project','hod-project',null,
  (select data from public.aitask_entities where workspace_id='pgtap-hod-project' and entity_type='project' and entity_id='hod-project'),
  '{}'::jsonb
), 'assigned HOD cannot delete the project');

select * from finish();
rollback;
