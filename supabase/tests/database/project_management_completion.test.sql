begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','project-management-'||n||'@aitask.local','',now(),'{}','{}',now(),now()
from generate_series(1951,1955) n;
insert into public.aitask_workspaces(id,name) values('pgtap-project-management','Project management');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,worker_type)
select id,'pgtap-project-management',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,name,'project-management-'||n||'@aitask.local',role,department,departments,is_super_admin,'employee'
from (values
  ('pm-a',1951,'PM A','Project Manager','Management',array['Management']::text[],false),
  ('pm-b',1952,'PM B','Project Manager','Management',array['Management']::text[],false),
  ('hod-a',1953,'HOD A','HOD','Designer',array['Designer']::text[],false),
  ('staff-a',1954,'Staff A','Staff','Designer',array['Designer']::text[],false),
  ('boss',1955,'Boss Koo','Project Manager','Management',array['Management']::text[],true)
) fixture(id,n,name,role,department,departments,is_super_admin);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-project-management','project','project-a','{"id":"project-a","clientName":"A","projectName":"A","createdBy":"boss","projectManagerIds":["pm-a"],"hodMemberIds":["hod-a"],"staffMemberIds":[],"services":["Design"],"startDate":"2026-10-01","deadline":"2026-11-30","status":"Active","defaultApprovalMode":"pm","requireClearClosureChecklist":false,"memberResponsibilities":{},"milestones":[{"id":"m-a","name":"Build","targetDate":"2026-10-30","status":"Not Started"}]}'),
('pgtap-project-management','project','project-b','{"id":"project-b","clientName":"B","projectName":"B","createdBy":"boss","projectManagerIds":["pm-b"],"hodMemberIds":[],"staffMemberIds":[],"services":["Design"],"startDate":"2026-10-01","deadline":"2026-11-30","status":"Active","defaultApprovalMode":"none","requireClearClosureChecklist":false,"memberResponsibilities":{},"milestones":[]}'),
('pgtap-project-management','task','task-a','{"id":"task-a","projectId":"project-a","clientName":"A","projectName":"A","title":"Work","department":"Designer","assignedTo":"staff-a","createdBy":"pm-a","status":"In Progress","dueDate":"2026-10-01","isCompleted":false,"visibility":"internal","approvalMode":"inherit","milestoneId":"m-a"}');

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-project-management','project','project-empty','{"id":"project-empty","clientName":"C","projectName":"Empty assigned project","createdBy":"boss","projectManagerIds":["pm-a"],"hodMemberIds":[],"staffMemberIds":["staff-a"],"services":[],"startDate":"2026-10-01","deadline":"2026-11-30"}');

select is(private.aitask_effective_task_approval_mode('pgtap-project-management',(select data from public.aitask_entities where entity_type='task' and entity_id='task-a')),'pm','task explicitly inherits the project PM approval default');

create function pg_temp.patch_entity(p_type text,p_id text,p_patch jsonb) returns jsonb language sql as $$
  select public.aitask_execute_command('pgtap-project-management',gen_random_uuid(),p_type||'.update',jsonb_build_array(jsonb_build_object(
    'kind','entity','action','update','entityType',p_type,'entityId',p_id,
    'expectedVersion',(select version from public.aitask_entities where workspace_id='pgtap-project-management' and entity_type=p_type and entity_id=p_id),
    'data',(select data from public.aitask_entities where workspace_id='pgtap-project-management' and entity_type=p_type and entity_id=p_id)||p_patch)))
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001951',true);
set local role authenticated;
select is((pg_temp.patch_entity('project','project-a','{"status":"Completed"}') ->> 'ok')::boolean,true,'assigned PM can complete a project');
select is((select data->>'status' from public.aitask_entities where entity_type='project' and entity_id='project-a'),'Completed','assigned PM completes a project');
select is((pg_temp.patch_entity('project','project-a','{"status":"Closed"}') ->> 'ok')::boolean,true,'assigned PM can close a project with advisory warnings');
select ok((select data ? 'closureWarnings' from public.aitask_entities where entity_type='project' and entity_id='project-a'),'closure records the warning snapshot');
select is((pg_temp.patch_entity('task','task-a','{"title":"Changed"}') ->> 'ok')::boolean,false,'closed project tasks are immutable');
select is((pg_temp.patch_entity('task','task-a','{"projectId":"project-empty","milestoneId":null}') ->> 'ok')::boolean,false,'closed project work cannot bypass the guard by moving to another authorised project');
select is((pg_temp.patch_entity('project','project-a','{"status":"Active"}') ->> 'ok')::boolean,true,'assigned PM can reopen a project');
select is((select data->>'status' from public.aitask_entities where entity_type='project' and entity_id='project-a'),'Active','assigned PM reopens a project');
select is((pg_temp.patch_entity('project','project-b','{"status":"Completed"}') ->> 'ok')::boolean,false,'PM cannot mutate another PM project');
reset role;

select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is((public.aitask_pm_upsert_project_member('pm-a','00000000-0000-0000-0000-000000001954'::uuid,'Staff A','project-management-1954@aitask.local','Staff',array['Designer'],'employee',array['project-a'],'11111111-1111-4111-8111-111111111111'::uuid))->>'reused','true','PM invite reuses the central employee account');
reset role;
select ok((select data->'staffMemberIds' ? 'staff-a' from public.aitask_entities where entity_type='project' and entity_id='project-a'),'shared member is assigned to the authorised project');
set local role service_role;
select throws_ok($$select public.aitask_pm_upsert_project_member('pm-a','00000000-0000-0000-0000-000000001954'::uuid,'Staff A','project-management-1954@aitask.local','Staff',array['Designer'],'employee',array['project-b'],'22222222-2222-4222-8222-222222222222'::uuid)$$,'42501','A selected project is outside your authority.','PM cannot assign an employee to another PM project');
reset role;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001954',true);
set local role authenticated;
select ok(exists(select 1 from public.aitask_entities where workspace_id='pgtap-project-management' and entity_type='project' and entity_id='project-empty'),'explicit Staff member can see a project before its first task');
select ok(not exists(select 1 from public.aitask_entities where workspace_id='pgtap-project-management' and entity_type='project' and entity_id='project-b'),'Staff membership does not expose unrelated projects');
reset role;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);
select * from finish();
rollback;
