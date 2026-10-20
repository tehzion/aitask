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
select no_plan();
create function pg_temp.audit_update(p_id text,p_patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('hod-handoff-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId',p_id,
 'expectedVersion',(select version from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id=p_id and entity_type='task'),
 'data',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id=p_id and entity_type='task') || p_patch)))
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005363',true);
set local role authenticated;
select is((pg_temp.audit_update('foreign-work','{"status":"Revision"}')->>'ok')::boolean,false,'foreign HOD cannot perform reviewer revision');
select is((pg_temp.audit_update('foreign-work','{"priority":"High"}')->>'ok')::boolean,true,'foreign assigned HOD retains routine editing');
reset role;
select jsonb_build_object('foreignTaskStatus',data->>'status','revisionCount',data->>'revisionCount') from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='foreign-work';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select is((pg_temp.audit_update('accepted-work','{"status":"Approved","priority":"High","clientApprovalStatus":"Pending"}')->>'ok')::boolean,true,'same-status priority update succeeds');
reset role;
select is((select data->>'clientApprovalStatus' from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='accepted-work'),'Approved','same-status update retains customer acceptance');
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005364','authenticated','authenticated','audit-pm@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('audit-pm','hod-handoff-test','00000000-0000-0000-0000-000000005364','Audit PM','audit-pm@aitask.local','Project Manager','Management',array['Management'],false),
('unlinked-hod','hod-handoff-test',null,'Unlinked HOD',null,'HOD','Management',array['Management'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','unlinked-review','{"id":"unlinked-review","clientName":"Company","title":"Work with an unlinked HOD","department":"Management","assignedTo":"audit-pm","createdBy":"audit-pm","status":"In Progress","isCompleted":false,"visibility":"internal","clientApprovalStatus":"Pending"}');
select jsonb_build_object('probe','unlinked HOD does not suppress responsible PM review','reviewers',(select jsonb_agg(id) from private.aitask_task_reviewers('hod-handoff-test',(select data from public.aitask_entities where workspace_id='hod-handoff-test' and entity_id='unlinked-review'))));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005364',true);
set local role authenticated;
select is((pg_temp.audit_update('unlinked-review','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'responsible PM may submit work when the department HOD is unavailable');
select is((pg_temp.audit_update('unlinked-review','{"status":"Approved"}')->>'ok')::boolean,true,'responsible PM may approve work they submitted');
reset role;

select set_config('request.jwt.claim.sub','',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','reachable-fallback','{"id":"reachable-fallback","clientName":"Company","title":"Independent fallback","department":"Management","assignedTo":"handoff-staff","createdBy":"audit-pm","status":"In Progress","visibility":"internal"}');
select is((select string_agg(id,',') from private.aitask_task_reviewers('hod-handoff-test',(select data from public.aitask_entities where entity_id='reachable-fallback'))),'audit-pm','unlinked HOD does not suppress reachable independent PM fallback');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005361',true);
set local role authenticated;
select is((pg_temp.audit_update('reachable-fallback','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'worker submits to reachable PM when department HOD has no login');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005364',true);
set local role authenticated;
select is((pg_temp.audit_update('reachable-fallback','{"status":"Approved"}')->>'ok')::boolean,true,'reachable independent PM approves fallback review');
select throws_ok($sql$update public.aitask_entities set data=data||'{"status":"Approved"}'::jsonb where entity_id='foreign-work'$sql$,'42501',null,'authenticated direct table write cannot bypass command guards');
reset role;

select set_config('request.jwt.claim.sub','',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000005365','authenticated','authenticated','audit-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('audit-boss','hod-handoff-test','00000000-0000-0000-0000-000000005365','Boss','audit-boss@aitask.local','Project Manager','Management',array['Management'],true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('hod-handoff-test','task','self-review','{"id":"self-review","clientName":"Company","title":"HOD output","department":"Designer","assignedTo":"handoff-hod","createdBy":"audit-pm","status":"In Progress","visibility":"internal"}'),
('hod-handoff-test','client','file-client','{"id":"file-client","clientName":"Company","createdBy":"audit-pm"}'),
('hod-handoff-test','service_cycle','file-cycle','{"id":"file-cycle","clientId":"file-client","clientName":"Company","status":"Published","serviceItems":[]}'),
('hod-handoff-test','deliverable','file-output','{"id":"file-output","clientId":"file-client","clientName":"Company","cycleId":"file-cycle","taskIds":["file-task"],"attachments":[],"status":"In Progress"}'),
('hod-handoff-test','task','file-task','{"id":"file-task","clientId":"file-client","clientName":"Company","serviceCycleId":"file-cycle","deliverableId":"file-output","title":"File output","department":"Designer","assignedTo":"handoff-staff","createdBy":"audit-pm","status":"In Progress","visibility":"client-visible"}');
insert into storage.objects(bucket_id,name,owner_id,metadata) values('client-service-files','hod-handoff-test/file-client/file-cycle/owned.pdf','00000000-0000-0000-0000-000000005361','{"mimetype":"application/pdf"}');
select ok((select array_agg(id) @> array['handoff-hod','audit-pm'] from private.aitask_task_reviewers('hod-handoff-test',(select data||jsonb_build_object('reviewCover',jsonb_build_object('reviewerId','audit-pm','expiresAt',now()-interval '1 second')) from public.aitask_entities where entity_id='file-task'))),'expired cover restores department review and preserves responsible PM authority');
update auth.users set banned_until=now()+interval '1 day' where id='00000000-0000-0000-0000-000000005362';
select ok(not exists(select 1 from private.aitask_task_reviewers('hod-handoff-test',(select data from public.aitask_entities where entity_id='file-task')) where id='handoff-hod'),'banned Auth account cannot receive review handoff');
update auth.users set banned_until=null where id='00000000-0000-0000-0000-000000005362';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select is((pg_temp.audit_update('self-review','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'HOD-owned work is submitted to independent PM');
select is((pg_temp.audit_update('self-review','{"status":"Approved"}')->>'ok')::boolean,false,'HOD cannot approve own output');
select is((pg_temp.audit_update('self-review','{"reviewCover":{"reviewerId":"audit-pm","expiresAt":"2099-01-01T00:00:00Z"}}')->>'ok')::boolean,false,'HOD cannot appoint cover through crafted commands');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005364',true);
set local role authenticated;
select is((pg_temp.audit_update('self-review',jsonb_build_object('accountableLeadId','handoff-hod','reviewCover',jsonb_build_object('reviewerId','audit-pm','expiresAt',now()+interval '1 day')))->>'ok')::boolean,true,'responsible PM appoints independent temporary cover and named lead');
select is((pg_temp.audit_update('self-review','{"status":"Approved"}')->>'ok')::boolean,true,'independent PM cover signs HOD output');
select is((select data->'reviewDecision'->>'reviewedBy' from public.aitask_entities where entity_id='self-review'),'audit-pm','ordinary approval has server-owned reviewer provenance');
select is((pg_temp.audit_update('self-review','{"reviewDecision":{"reviewedBy":"handoff-hod"}}')->>'ok')::boolean,false,'crafted approval provenance is rejected');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005361',true);
set local role authenticated;
select is((pg_temp.audit_update('file-task','{"outputAttachments":[{"id":"file","bucket":"client-service-files","path":"hod-handoff-test/file-client/file-cycle/owned.pdf","fileName":"Artwork.pdf","uploadedBy":"handoff-staff"}]}')->>'ok')::boolean,true,'assigned worker saves an owned task-output reference');
select is((pg_temp.audit_update('file-task','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'task-owned file supplies submission evidence');
select is((pg_temp.audit_update('file-task','{"outputAttachments":[]}')->>'ok')::boolean,false,'submitted output cannot be replaced or removed');
reset role;
select is(private.aitask_client_task_projection((select data from public.aitask_entities where entity_id='file-task')) ? 'outputAttachments',false,'client projection hides files before HOD approval');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005362',true);
set local role authenticated;
select is((pg_temp.audit_update('file-task','{"status":"Approved"}')->>'ok')::boolean,true,'independent HOD signs file-only task output');
reset role;
select ok(private.aitask_client_task_projection((select data from public.aitask_entities where entity_id='file-task')) ? 'outputAttachments','client receives internally approved public output');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000005365',true);
set local role authenticated;
select is((pg_temp.audit_update('unlinked-review','{"assignedTo":"audit-boss","status":"Waiting Approval"}')->>'ok')::boolean,true,'Boss can submit work while requiring explicit self-review override');
select is((pg_temp.audit_update('unlinked-review','{"status":"Approved"}')->>'ok')::boolean,false,'Boss self-review without a reason is denied');
select is((pg_temp.audit_update('unlinked-review','{"status":"Approved","reviewOverrideReason":"Emergency review cover unavailable"}')->>'ok')::boolean,true,'Boss explicit override with a reason persists');
reset role;
select is((select data->'reviewDecision'->>'overrideReason' from public.aitask_entities where entity_id='unlinked-review'),'Emergency review cover unavailable','override reason is retained with authenticated decision');
select ok((select not(data ? 'reviewOverrideReason') from public.aitask_entities where entity_id='unlinked-review'),'one-shot override input is removed');
select * from finish();
rollback;
