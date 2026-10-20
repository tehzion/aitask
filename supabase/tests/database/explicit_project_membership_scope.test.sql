begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','project-scope-'||n||'@aitask.local','',now(),'{}','{}',now(),now()
from generate_series(1801,1805) n;

insert into public.aitask_workspaces(id,name) values('pgtap-project-membership','Project membership');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
select id,'pgtap-project-membership',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,name,email,role,department,departments,is_super_admin
from (values
  ('pm-a',1801,'PM A','Project Manager','Management',array['Management']::text[],false),
  ('pm-b',1802,'PM B','Project Manager','Management',array['Management']::text[],false),
  ('hod-a',1803,'HOD A','HOD','Designer',array['Designer']::text[],false),
  ('staff-shared',1804,'Shared Staff','Staff','Designer',array['Designer']::text[],false),
  ('boss-koo',1805,'Boss Koo','Project Manager','Management',array['Management']::text[],true)
) fixtures(id,n,name,role,department,departments,is_super_admin);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-project-membership','project','project-a','{"id":"project-a","clientName":"Company A","projectName":"Project A","createdBy":"boss-koo","projectManagerIds":["pm-a"],"hodMemberIds":["hod-a"],"services":["Design"],"startDate":"2026-10-01","deadline":"2026-10-30"}'),
('pgtap-project-membership','project','project-b','{"id":"project-b","clientName":"Company B","projectName":"Project B","createdBy":"boss-koo","projectManagerIds":["pm-b"],"hodMemberIds":[],"services":["Design"],"startDate":"2026-10-01","deadline":"2026-10-30"}'),
('pgtap-project-membership','task','task-a','{"id":"task-a","projectId":"project-a","clientName":"Company A","projectName":"Project A","title":"Shared staff task A","department":"Designer","assignedTo":"staff-shared","createdBy":"pm-a","status":"In Progress","isCompleted":false,"visibility":"internal"}'),
('pgtap-project-membership','task','task-b','{"id":"task-b","projectId":"project-b","clientName":"Company B","projectName":"Project B","title":"Shared staff task B","department":"Designer","assignedTo":"staff-shared","createdBy":"pm-a","status":"In Progress","isCompleted":false,"visibility":"internal"}');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001801',true);
set local role authenticated;
select ok(private.aitask_can_view_project('pgtap-project-membership','project-a'),'PM A can read an explicitly assigned project');
select ok(not private.aitask_can_view_project('pgtap-project-membership','project-b'),'PM A cannot read PM B project');
select ok(private.aitask_can_view_task('pgtap-project-membership','task-a'),'PM A can access tasks inside the assigned project');
select ok(not private.aitask_can_view_task('pgtap-project-membership','task-b'),'assignment or authorship cannot bypass a foreign project boundary');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='project'),1,'project RLS exposes only the assigned project');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='task'),1,'task RLS exposes only tasks in the assigned project');
select throws_ok($$update public.aitask_entities set data=jsonb_set(data,'{projectManagerIds}','["pm-b"]'::jsonb,true) where workspace_id='pgtap-project-membership' and entity_type='project' and entity_id='project-a'$$,'23514','Only Boss Koo can change Project Manager assignments.','PM cannot transfer an assigned project to another PM');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001803',true);
set local role authenticated;
select ok(private.aitask_can_view_project('pgtap-project-membership','project-a'),'assigned HOD can see their project');
select ok(not private.aitask_can_view_project('pgtap-project-membership','project-b'),'HOD cannot see another project from the same department');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='task'),1,'HOD task visibility is constrained to assigned project membership');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001804',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='task'),2,'shared Staff can see assigned tasks across multiple projects');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='project'),2,'shared Staff can see projects connected to their assigned work');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001805',true);
set local role authenticated;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='project'),2,'Boss Koo retains access to every project');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-project-membership' and entity_type='task'),2,'Boss Koo retains access to every task');
reset role;

select set_config('request.jwt.claim.sub','',true);
select * from finish();
rollback;
