begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009501','authenticated','authenticated','hod-vis-hod@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009502','authenticated','authenticated','hod-vis-pm@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009503','authenticated','authenticated','hod-vis-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-hod-vis','HOD company visibility');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions) values
  ('hod-vis-hod','pgtap-hod-vis','00000000-0000-0000-0000-000000009501','Vis HOD','hod-vis-hod@aitask.local','HOD','Designer',array['Designer'],'{}'),
  ('hod-vis-pm','pgtap-hod-vis','00000000-0000-0000-0000-000000009502','Vis PM','hod-vis-pm@aitask.local','Project Manager','Management',array['Management'],'{}'),
  ('hod-vis-staff','pgtap-hod-vis','00000000-0000-0000-0000-000000009503','Vis Staff','hod-vis-staff@aitask.local','Staff','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-hod-vis','client','vis-company','{"id":"vis-company","clientName":"Visible Via Project","createdBy":"hod-vis-pm"}'),
  ('pgtap-hod-vis','client','other-company','{"id":"other-company","clientName":"Unrelated Company","createdBy":"hod-vis-pm"}'),
  ('pgtap-hod-vis','project','vis-project','{"id":"vis-project","clientId":"vis-company","clientName":"Visible Via Project","projectName":"Vis project","services":["Design"],"startDate":"2026-10-01","deadline":"2026-11-30","projectManagerIds":["hod-vis-pm"],"hodMemberIds":["hod-vis-hod"],"staffMemberIds":[],"createdBy":"hod-vis-pm","status":"Active","defaultApprovalMode":"hod","requireClearClosureChecklist":false,"memberResponsibilities":{},"milestones":[]}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009501',true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(private.aitask_can_view_client('pgtap-hod-vis','visible via project'), 'a HOD sees the company of a project they are assigned to');
select ok(not private.aitask_can_view_client('pgtap-hod-vis','unrelated company'), 'a HOD does not see unrelated companies');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009503',true);
select ok(not private.aitask_can_view_client('pgtap-hod-vis','visible via project'), 'non-HOD Staff keep the task-based rule');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009502',true);
select ok(private.aitask_can_view_client('pgtap-hod-vis','visible via project'), 'the Project Manager still sees the company');

select * from finish();
rollback;
