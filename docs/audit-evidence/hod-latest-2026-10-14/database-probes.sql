begin;
create extension if not exists pgtap with schema extensions;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005361','authenticated','authenticated','handoff-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005362','authenticated','authenticated','handoff-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005363','authenticated','authenticated','handoff-other@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('hod-handoff-test','HOD handoff test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('handoff-staff','hod-handoff-test','00000000-0000-0000-0000-000000005361','Staff','handoff-staff@aitask.local','Staff','Designer',array['Designer'],false),
('handoff-hod','hod-handoff-test','00000000-0000-0000-0000-000000005362','HOD','handoff-hod@aitask.local','HOD','Designer',array['Designer'],false),
('handoff-other','hod-handoff-test','00000000-0000-0000-0000-000000005363','Other HOD','handoff-other@aitask.local','HOD','Video Editor',array['Video Editor'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','handoff-task','{"id":"handoff-task","clientName":"Company","title":"Artwork","department":"Designer","assignedTo":"handoff-staff","createdBy":"handoff-hod","assignedBy":"handoff-hod","status":"In Progress","isCompleted":false,"visibility":"internal"}');
create function pg_temp.submit_work(p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('hod-handoff-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId','handoff-task',
 'expectedVersion',(select version from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='handoff-task' and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='handoff-task' and entity_type='task') || p_patch)))
$$;

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','foreign-work','{"id":"foreign-work","clientName":"Company","title":"Designer legacy assignment","department":"Designer","assignedTo":"handoff-other","createdBy":"handoff-hod","status":"Waiting Approval","isCompleted":false,"visibility":"internal","clientApprovalStatus":"Pending"}'),
('hod-handoff-test','task','accepted-work','{"id":"accepted-work","clientName":"Company","title":"Accepted output","department":"Designer","assignedTo":"handoff-staff","createdBy":"handoff-hod","status":"Approved","isCompleted":false,"visibility":"client-visible","clientApprovalStatus":"Approved","priority":"Medium"}');
create function pg_temp.audit_update(p_id text,p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('hod-handoff-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId',p_id,
 'expectedVersion',(select version from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id=p_id and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id=p_id and entity_type='task') || p_patch)))
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005363',true);
set local role authenticated;
select jsonb_build_object('probe','foreign-department HOD revision','result',pg_temp.audit_update('foreign-work','{"status":"Revision"}'));
reset role;
select jsonb_build_object('foreignTaskStatus',data->>'status','revisionCount',data->>'revisionCount') from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='foreign-work';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select jsonb_build_object('probe','explicit unchanged-status update clears customer acceptance','result',pg_temp.audit_update('accepted-work','{"status":"Approved","priority":"High","clientApprovalStatus":"Pending"}'));
reset role;
select jsonb_build_object('acceptedTaskStatus',data->>'status','customerAcceptance',data->>'clientApprovalStatus','priority',data->>'priority') from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='accepted-work';
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005364','authenticated','authenticated','audit-pm@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('audit-pm','hod-handoff-test','00000000-0000-0000-0000-000000005364','Audit PM','audit-pm@aitask.local','Project Manager','Management',array['Management'],false),
('unlinked-hod','hod-handoff-test',null,'Unlinked HOD',null,'HOD','Management',array['Management'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','unlinked-review','{"id":"unlinked-review","clientName":"Company","title":"Work with an unlinked HOD","department":"Management","assignedTo":"audit-pm","createdBy":"audit-pm","status":"In Progress","isCompleted":false,"visibility":"internal","clientApprovalStatus":"Pending"}');
select jsonb_build_object('probe','reviewer without login suppresses PM fallback','reviewers',(select jsonb_agg(id) from private.aitask_task_reviewers('hod-handoff-test',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='unlinked-review'))));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005364',true);
set local role authenticated;
select jsonb_build_object('probe','submission to unlinked reviewer','result',pg_temp.audit_update('unlinked-review','{"status":"Waiting Approval"}'));
select jsonb_build_object('probe','responsible PM fallback approval','result',pg_temp.audit_update('unlinked-review','{"status":"Approved"}'));
reset role;
rollback;
