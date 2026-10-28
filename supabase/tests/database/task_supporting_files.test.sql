begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006001','authenticated','authenticated','support-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006002','authenticated','authenticated','support-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006003','authenticated','authenticated','support-client@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006004','authenticated','authenticated','support-other@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values ('pgtap-task-files','Task supporting files');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,client_name) values
('support-pm','pgtap-task-files','00000000-0000-0000-0000-000000006001','Support PM','support-pm@aitask.local','Project Manager','Management',array['Management'],false,null),
('support-staff','pgtap-task-files','00000000-0000-0000-0000-000000006002','Support Staff','support-staff@aitask.local','Staff','Designer',array['Designer'],false,null),
('support-client','pgtap-task-files','00000000-0000-0000-0000-000000006003','Support Client','support-client@aitask.local','Client','Client',array['Client'],false,'Supporting Co'),
('support-other','pgtap-task-files','00000000-0000-0000-0000-000000006004','Other Staff','support-other@aitask.local','Staff','Designer',array['Designer'],false,null);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-task-files','client','support-client-company','{"id":"support-client-company","clientName":"Supporting Co","createdBy":"support-pm"}'),
('pgtap-task-files','task','support-task','{"id":"support-task","clientId":"support-client-company","clientName":"Supporting Co","title":"Prepare internal notes","department":"Designer","assignedTo":"support-staff","createdBy":"support-pm","status":"In Progress","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"client-visible"}'),
('pgtap-task-files','task','support-other-task','{"id":"support-other-task","clientId":"support-client-company","clientName":"Supporting Co","title":"Other staff task","department":"Designer","assignedTo":"support-other","createdBy":"support-pm","status":"In Progress","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"internal"}');

select is((select public from storage.buckets where id='task-supporting-files'),false,'supporting files use a private bucket');
select is((select file_size_limit from storage.buckets where id='task-supporting-files'),104857600::bigint,'supporting files are limited to 100 MB');
select is((select allowed_mime_types from storage.buckets where id='task-supporting-files'),array['application/pdf','image/jpeg','image/png','image/webp','image/gif']::text[],'supporting files allow only PDF and image formats');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006002',true);
set local role authenticated;
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('task-supporting-files','pgtap-task-files/support-task/support-file-notes.pdf','00000000-0000-0000-0000-000000006002','{"mimetype":"application/pdf","size":"1200"}')$$,'assigned Staff can upload a private task file');

select is((public.aitask_execute_command('pgtap-task-files',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','update','entityType','task','entityId','support-task',
  'expectedVersion',(select version from public.aitask_entities where workspace_id='pgtap-task-files' and entity_type='task' and entity_id='support-task'),
  'data',(select data from public.aitask_entities where workspace_id='pgtap-task-files' and entity_type='task' and entity_id='support-task') ||
    '{"supportingAttachments":[{"id":"support-file","bucket":"task-supporting-files","path":"pgtap-task-files/support-task/support-file-notes.pdf","fileName":"notes.pdf","mimeType":"application/pdf","sizeBytes":1200,"uploadedBy":"support-staff","uploadedAt":"2026-10-26T00:00:00.000Z"}]}'::jsonb
)))->>'ok')::boolean,true,'assigned Staff can save an owned supporting-file reference');
select is((select count(*)::integer from storage.objects where bucket_id='task-supporting-files' and name='pgtap-task-files/support-task/support-file-notes.pdf'),1,'assigned Staff can read the referenced supporting file');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('task-supporting-files','pgtap-task-files/support-other-task/not-my-task.pdf','00000000-0000-0000-0000-000000006002','{"mimetype":"application/pdf","size":"10"}')$$,'42501',null,'Staff cannot upload into another Staff member task');
reset role;

select is((select private.aitask_client_task_projection(data) ? 'supportingAttachments' from public.aitask_entities where workspace_id='pgtap-task-files' and entity_type='task' and entity_id='support-task'),false,'Client task projections omit internal supporting files');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006003',true);
set local role authenticated;
select is((select count(*)::integer from storage.objects where bucket_id='task-supporting-files' and name='pgtap-task-files/support-task/support-file-notes.pdf'),0,'Client cannot read an internal supporting file');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values('task-supporting-files','pgtap-task-files/support-task/client-upload.pdf','00000000-0000-0000-0000-000000006003','{"mimetype":"application/pdf","size":"10"}')$$,'42501',null,'Client cannot upload task supporting files');

reset role;
select * from finish();
rollback;
