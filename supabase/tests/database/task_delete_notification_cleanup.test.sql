begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009401','authenticated','authenticated','task-cleanup@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values
('pgtap-task-cleanup','Task notice cleanup'),('pgtap-task-cleanup-other','Other workspace');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments) values
('cleanup-staff','pgtap-task-cleanup','00000000-0000-0000-0000-000000009401','Staff','task-cleanup@aitask.local','Staff','Designer',array['Designer']),
('cleanup-other','pgtap-task-cleanup',null,'Other','task-cleanup-other@aitask.local','Staff','Designer',array['Designer']);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-task-cleanup','task','owned-task','{"id":"owned-task","title":"Owned work","department":"Designer","assignedTo":"cleanup-staff","createdBy":"cleanup-staff","status":"Pending","isCompleted":false}'),
('pgtap-task-cleanup','task','other-task','{"id":"other-task","title":"Other work","department":"Designer","assignedTo":"cleanup-other","createdBy":"cleanup-other","status":"Pending","isCompleted":false}'),
('pgtap-task-cleanup','notification','linked-notice','{"id":"linked-notice","title":"Task Assigned","targetUserId":"cleanup-staff","route":{"page":"tasks","entityId":"owned-task"}}'),
('pgtap-task-cleanup','notification','unrelated-notice','{"id":"unrelated-notice","title":"Task Assigned","targetUserId":"cleanup-staff","route":{"page":"tasks","entityId":"other-task"}}'),
('pgtap-task-cleanup','notification','deletion-notice','{"id":"deletion-notice","title":"Task Deleted","targetUserId":"cleanup-staff","route":{"page":"tasks","entityId":"owned-task"}}'),
('pgtap-task-cleanup-other','notification','foreign-notice','{"id":"foreign-notice","title":"Task Assigned","targetUserId":"cleanup-staff","route":{"page":"tasks","entityId":"owned-task"}}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009401',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select ok(not has_table_privilege('authenticated','public.aitask_entities','DELETE'),'direct table deletion remains unavailable');
select is(public.aitask_execute_command('pgtap-task-cleanup',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','other-task','expectedVersion',1)))->>'ok','false','unrelated task deletion remains forbidden');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup' and entity_id='unrelated-notice'),1,'denied deletion does not clean unrelated notices');
set local role authenticated;
select is(public.aitask_execute_command('pgtap-task-cleanup',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','owned-task','expectedVersion',1)))->>'ok','true','Staff can delete authorized work without deleting notification rows in the command');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup' and entity_id='owned-task'),0,'authorized task is deleted');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup' and entity_id='linked-notice'),0,'stale task notification is cleaned atomically');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup' and entity_id='unrelated-notice'),1,'other task notification is retained');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup-other' and entity_id='foreign-notice'),1,'same task ID in another workspace is not affected');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-task-cleanup' and entity_id='deletion-notice'),1,'intentional deletion notice is retained');
select * from finish();
rollback;
