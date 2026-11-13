begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(id,email,banned_until) values
 ('00000000-0000-0000-0000-000000008801','policy-pm@aitask.local',null),
 ('00000000-0000-0000-0000-000000008802','policy-hod@aitask.local',null),
 ('00000000-0000-0000-0000-000000008803','policy-staff@aitask.local',null),
 ('00000000-0000-0000-0000-000000008804','policy-client@aitask.local',null),
 ('00000000-0000-0000-0000-000000008805','policy-banned@aitask.local',now()+interval '1 day');
insert into public.aitask_workspaces(id,name) values ('direct-policy-test','Direct assignment policy');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions) values
 ('policy-pm','direct-policy-test','00000000-0000-0000-0000-000000008801','PM','policy-pm@aitask.local','Project Manager','Management',array['Management'],'{}'),
 ('policy-hod','direct-policy-test','00000000-0000-0000-0000-000000008802','HOD','policy-hod@aitask.local','HOD','Designer',array['Designer'],'{}'),
 ('policy-staff','direct-policy-test','00000000-0000-0000-0000-000000008803','Staff','policy-staff@aitask.local','Staff','Video Editor',array['Video Editor'],'{"createTasks":true}'),
 ('policy-client','direct-policy-test','00000000-0000-0000-0000-000000008804','Client','policy-client@aitask.local','Client','Client',array['Client'],'{}'),
 ('policy-banned','direct-policy-test','00000000-0000-0000-0000-000000008805','Banned','policy-banned@aitask.local','Staff','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('direct-policy-test','project','policy-own-project','{"id":"policy-own-project","projectName":"Own","clientName":"Policy Co","projectManagerIds":["policy-pm"],"hodMemberIds":[],"staffMemberIds":[]}'),
 ('direct-policy-test','project','policy-other-project','{"id":"policy-other-project","projectName":"Other","clientName":"Other Co","projectManagerIds":[],"hodMemberIds":[],"staffMemberIds":[]}'),
 ('direct-policy-test','task','policy-assigned-task','{"id":"policy-assigned-task","title":"Assigned","clientName":"Other Co","department":"Video Editor","assignedTo":"policy-hod","createdBy":"policy-pm","projectId":"policy-other-project","status":"Pending"}'),
 ('direct-policy-test','task','policy-private-task','{"id":"policy-private-task","title":"Private","clientName":"Other Co","department":"Video Editor","assignedTo":"policy-staff","createdBy":"policy-pm","projectId":"policy-other-project","status":"Pending"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008801',true);
select ok(private.aitask_task_assignment_is_valid('direct-policy-test','insert','{}','{"department":"Designer","assignedTo":"policy-staff","projectId":"policy-own-project"}'),'PM assigns outside department and project Staff membership');
select ok(private.aitask_task_assignment_is_valid('direct-policy-test','insert','{}','{"department":"Video Editor","assignedTo":"policy-hod","projectId":"policy-own-project"}'),'PM assigns an HOD outside their department');
select ok(not private.aitask_task_assignment_is_valid('direct-policy-test','insert','{}','{"department":"Designer","assignedTo":"policy-client","projectId":"policy-own-project"}'),'Clients are not internal assignees');
select ok(not private.aitask_task_assignment_is_valid('direct-policy-test','insert','{}','{"department":"Designer","assignedTo":"policy-banned","projectId":"policy-own-project"}'),'Banned accounts cannot receive assignments');
select ok(not private.aitask_task_assignment_is_valid('direct-policy-test','insert','{}','{"department":"Designer","assignedTo":"policy-staff","projectId":"policy-other-project"}'),'PM cannot assign outside their project scope');
update public.aitask_entities set data=jsonb_set(data,'{assignedTo}','"policy-pm"') where workspace_id='direct-policy-test' and entity_id='policy-assigned-task';
select ok(private.aitask_can_view_task('direct-policy-test','policy-assigned-task'),'Assigned PM can see task outside their project');
select ok(private.aitask_can_edit_task('direct-policy-test','policy-assigned-task'),'Assigned PM can work on task outside their project');
select ok(not private.aitask_task_assignment_is_valid('direct-policy-test','update','{"department":"Video Editor","assignedTo":"policy-pm","projectId":"policy-other-project"}','{"department":"Video Editor","assignedTo":"policy-staff","projectId":"policy-other-project"}'),'Assigned outsider PM cannot reassign outside their managed projects');
select ok(private.aitask_can_mutate_entity_legacy('direct-policy-test','update','task','policy-assigned-task','policy-other-project',
  (select data from public.aitask_entities where workspace_id='direct-policy-test' and entity_id='policy-assigned-task'),
  (select data || '{"notes":"Assigned PM routine edit"}'::jsonb from public.aitask_entities where workspace_id='direct-policy-test' and entity_id='policy-assigned-task')),'Assigned outsider PM can save execution edits without project visibility');
select ok(not private.aitask_can_mutate_entity_legacy('direct-policy-test','update','task','policy-assigned-task','policy-own-project',
  (select data from public.aitask_entities where workspace_id='direct-policy-test' and entity_id='policy-assigned-task'),
  (select data || '{"projectId":"policy-own-project","clientName":"Policy Co"}'::jsonb from public.aitask_entities where workspace_id='direct-policy-test' and entity_id='policy-assigned-task')),'Assigned outsider PM cannot move another project task');
update public.aitask_entities set data=jsonb_set(data,'{assignedTo}','"policy-hod"') where workspace_id='direct-policy-test' and entity_id='policy-assigned-task';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008802',true);
select ok(private.aitask_can_view_task('direct-policy-test','policy-assigned-task'),'Assigned HOD can see task outside project and department');
select ok(private.aitask_can_edit_task('direct-policy-test','policy-assigned-task'),'Assigned HOD can work on assigned task');
select ok(not private.aitask_can_view_task('direct-policy-test','policy-private-task'),'Assignment does not expose unrelated project tasks');
select ok(private.aitask_has_permission('direct-policy-test','createTasks'),'HOD task creation remains available');
select set_config('request.jwt.claim.sub','',true);
update public.aitask_entities set data=jsonb_set(data,'{hodMemberIds}','["policy-hod"]') where workspace_id='direct-policy-test' and entity_id='policy-own-project';
update public.aitask_members set departments=array['Designer'] where workspace_id='direct-policy-test' and id='policy-staff';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008802',true);
select ok(private.aitask_task_assignment_is_valid('direct-policy-test','update','{"department":"Designer","assignedTo":"policy-hod","responsibleHodId":"policy-hod","assignmentState":"pending_hod","projectId":"policy-own-project","createdBy":"policy-pm"}','{"department":"Designer","assignedTo":"policy-staff","responsibleHodId":"policy-hod","assignmentState":"assigned_staff","projectId":"policy-own-project","createdBy":"policy-pm"}'),'HOD delegates to department Staff absent from project Staff membership');
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set departments=array['Video Editor'] where workspace_id='direct-policy-test' and id='policy-staff';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008802',true);
select ok(private.aitask_task_assignment_is_valid('direct-policy-test','update','{"department":"Designer","assignedTo":"policy-hod","responsibleHodId":"policy-hod","assignmentState":"pending_hod","projectId":"policy-own-project","createdBy":"policy-pm"}','{"department":"Designer","assignedTo":"policy-staff","responsibleHodId":"policy-hod","assignmentState":"assigned_staff","projectId":"policy-own-project","createdBy":"policy-pm"}'),'HOD can delegate outside department');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008803',true);
select ok(not private.aitask_has_permission('direct-policy-test','createTasks'),'Staff cannot create tasks even through an override');
select * from finish();
rollback;
