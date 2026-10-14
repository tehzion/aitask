begin;
create extension if not exists pgtap with schema extensions;
select plan(28);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005501','authenticated','authenticated','stage-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005502','authenticated','authenticated','stage-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005503','authenticated','authenticated','stage-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005504','authenticated','authenticated','stage-client@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('stage-readiness-test','Stage progress test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name) values
('stage-pm','stage-readiness-test','00000000-0000-0000-0000-000000005501','PM','stage-pm@aitask.local','Project Manager','Management',array['Management'],false,null),
('stage-hod','stage-readiness-test','00000000-0000-0000-0000-000000005502','HOD','stage-hod@aitask.local','HOD','Video Shooting',array['Video Shooting'],false,null),
('stage-staff','stage-readiness-test','00000000-0000-0000-0000-000000005503','Staff','stage-staff@aitask.local','Staff','Video Shooting',array['Video Shooting'],false,null),
('stage-client','stage-readiness-test','00000000-0000-0000-0000-000000005504','Client','stage-client@aitask.local','Client','Client',array['Client'],false,'Stage Company');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('stage-readiness-test','task','stage-task','{"id":"stage-task","clientName":"Stage Company","title":"Artwork","department":"Video Shooting","assignedTo":"stage-staff","createdBy":"stage-pm","assignedBy":"stage-pm","status":"Pending","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"client-visible"}');
create function pg_temp.stage_update(p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('stage-readiness-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId','stage-task',
 'expectedVersion',(select version from public.aitask_entities where workspace_id='stage-readiness-test' and entity_id='stage-task' and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='stage-readiness-test' and entity_id='stage-task' and entity_type='task') || p_patch)))
$$;

update public.aitask_members set departments=array['Video Editor'] where workspace_id='stage-readiness-test' and id='stage-hod';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"Waiting Approval"}')->>'ok')::boolean,false,'missing HOD rejects submission rather than silently saving an orphan');
select is((select data->>'status' from public.aitask_entities where entity_id='stage-task'),'Pending','failed handoff leaves status unchanged');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='stage-readiness-test' and entity_type='notification'),0,'failed submission is atomic');
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set departments=array['Video Shooting'] where workspace_id='stage-readiness-test' and id='stage-hod';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select is((pg_temp.stage_update('{"workState":{"acceptedBy":"stage-staff"}}')->>'ok')::boolean,true,'Staff accepts work');
select is((pg_temp.stage_update('{"status":"Waiting Approval"}')->>'ok')::boolean,true,'configured HOD receives a successful submission');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"Revision"}')->>'ok')::boolean,true,'HOD can use explicit Revision status');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),50,'explicit Revision is 50 percent');
select is((select (data->>'revisionCount')::integer from public.aitask_entities where entity_id='stage-task'),1,'explicit Revision records one return');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select pg_temp.stage_update('{"status":"Waiting Approval","clientApprovalStatus":"Pending"}');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005501',true);
set local role authenticated;
select is((pg_temp.stage_update('{"assignedTo":"stage-hod"}')->>'ok')::boolean,true,'PM can reassign submitted work');
select is((select data->>'status' from public.aitask_entities where entity_id='stage-task'),'Pending','cached same-status reassignment resets to Pending');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),10,'reassignment to HOD is 10 percent');
select ok((select not (data->'workState' ? 'acceptedBy') and not (data->'workState' ? 'reviewRequestedBy') from public.aitask_entities where entity_id='stage-task'),'reassignment clears acceptance and review metadata');
select ok((select data->'workHistory'->-1->'fields' ? 'status' from public.aitask_entities where entity_id='stage-task'),'normalized reassignment is included in the attributed history');
select is((public.aitask_execute_command('stage-readiness-test',gen_random_uuid(),'task.create',jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','task','entityId','created-review','expectedVersion',0,'data',jsonb_build_object('id','created-review','title','Immediate review','clientName','Stage Company','department','Video Shooting','createdBy','stage-pm','assignedTo','stage-staff','status','Waiting Approval','visibility','internal','isCompleted',false,'clientApprovalStatus','Pending'))))->>'ok')::boolean,true,'a task created directly in review saves');
reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='stage-readiness-test' and entity_type='notification' and data->'route'->>'entityId'='created-review' and data->>'targetUserId'='stage-hod'),1,'INSERT submission generates exactly one HOD handoff');
select set_config('request.jwt.claim.sub','',true);
-- Restore a historic legacy row for compatibility testing only; normal role assignments stay guarded.
alter table public.aitask_members disable trigger aitask_00_guard_member_role_scope;
update public.aitask_members set role='Staff',custom_role_id='builtin-hod' where workspace_id='stage-readiness-test' and id='stage-hod';
alter table public.aitask_members enable trigger aitask_00_guard_member_role_scope;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select ok(private.aitask_role_is_department_scoped('stage-readiness-test'),'legacy HOD is department scoped');
select is(private.aitask_has_permission('stage-readiness-test','manageCreatedTasks'),true,'legacy HOD retains delegation permission without a role record');
select is(private.aitask_has_permission('stage-readiness-test','manageServiceCycles'),false,'legacy HOD cannot acquire PM service management');
select is((pg_temp.stage_update('{"assignedTo":"stage-staff"}')->>'ok')::boolean,true,'legacy Staff HOD delegates assigned work');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005503',true);
set local role authenticated;
select pg_temp.stage_update('{"status":"Waiting Approval"}');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005502',true);
set local role authenticated;
select is((pg_temp.stage_update('{"status":"Approved"}')->>'ok')::boolean,true,'legacy Staff HOD approves submitted work');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where entity_id='stage-task'),80,'legacy HOD approval persists at 80 percent');
select is((pg_temp.stage_update('{"status":"Completed"}')->>'ok')::boolean,false,'legacy HOD still cannot finalize for the PM');
select is((pg_temp.stage_update('{"title":"Unaudited replacement"}')->>'ok')::boolean,false,'approved output cannot be replaced without revision');
select is((pg_temp.stage_update('{"status":"Completed","title":"Unaudited replacement"}')->>'ok')::boolean,false,'changing output and finalizing in one request cannot bypass review');
select is((pg_temp.stage_update('{"dueDate":"2026-10-30"}')->>'ok')::boolean,true,'routine scheduling can change while output approval stays valid');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values('stage-readiness-test','task','legacy-review','{"id":"legacy-review","title":"Historical submitted task","clientName":"Stage Company","department":"Video Shooting","assignedTo":"stage-staff","createdBy":"stage-pm","status":"Waiting Approval","isCompleted":false,"visibility":"internal","clientApprovalStatus":"Pending"}');
select is(private.aitask_backfill_pending_hod_reviews(),1,'rollout supplies the missing handoff for historical submissions');
select is((select count(*)::integer from public.aitask_entities where workspace_id='stage-readiness-test' and entity_type='notification' and data->'route'->>'entityId'='legacy-review' and data->>'targetUserId'='stage-hod'),1,'historic review reaches its configured HOD');
select is(private.aitask_backfill_pending_hod_reviews(),0,'review backfill is idempotent');
select * from finish();
rollback;
