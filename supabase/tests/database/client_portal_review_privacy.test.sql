begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000001301','authenticated','authenticated','review-client@aitask.local','','{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-review-privacy','Review privacy');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,client_name,department,departments,permissions)
values ('review-client','pgtap-review-privacy','00000000-0000-0000-0000-000000001301','Customer','review-client@aitask.local','Client','Review Co','Client',array['Client'],'{}');
insert into public.aitask_members(id,workspace_id,name,email,role,department,departments,permissions)
values ('review-staff','pgtap-review-privacy','INTERNAL STAFF NAME','review-staff@aitask.local','Staff','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-review-privacy','client','review-co','{"id":"review-co","clientName":"Review Co"}'),
('pgtap-review-privacy','client_plan','review-plan','{"id":"review-plan","clientId":"review-co","clientName":"Review Co","status":"Active","revision":1}'),
('pgtap-review-privacy','task','review-task','{"id":"review-task","clientId":"review-co","clientName":"Review Co","title":"Shared task","assignedTo":"review-staff","visibility":"client-visible","status":"Pending"}'),
('pgtap-review-privacy','service_cycle','review-draft',jsonb_build_object('id','review-draft','clientId','review-co','clientName','Review Co','planId','review-plan','status','Draft','periodStart',to_char(timezone('Asia/Kuala_Lumpur',now())::date-1,'YYYY-MM-DD'),'periodEnd',to_char(timezone('Asia/Kuala_Lumpur',now())::date+1,'YYYY-MM-DD')));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'contacts','[]'::jsonb,'Client receives no internal contact directory');
select ok(position('INTERNAL STAFF NAME' in public.aitask_read_client_portal('pgtap-review-privacy')::text)=0,'Staff name does not enter Client payload');
select ok(not ((public.aitask_read_client_portal('pgtap-review-privacy')->'tasks'->0) ? 'assignedTo'),'Task projection excludes internal assignee identity');
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'clients'->0->'awaitingPublication','true'::jsonb,'Current active-plan draft produces a publication flag');
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'serviceCycles','[]'::jsonb,'Publication flag never exposes draft records');

select set_config('request.jwt.claim.sub','',true);
update public.aitask_entities set data=data||jsonb_build_object('periodStart',to_char(timezone('Asia/Kuala_Lumpur',now())::date-3,'YYYY-MM-DD'),'periodEnd',to_char(timezone('Asia/Kuala_Lumpur',now())::date-1,'YYYY-MM-DD')) where workspace_id='pgtap-review-privacy' and entity_id='review-draft';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'clients'->0->'awaitingPublication','false'::jsonb,'Expired draft does not imply awaiting publication');

select set_config('request.jwt.claim.sub','',true);
update public.aitask_entities set data=data||jsonb_build_object('periodStart',to_char(timezone('Asia/Kuala_Lumpur',now())::date+1,'YYYY-MM-DD'),'periodEnd',to_char(timezone('Asia/Kuala_Lumpur',now())::date+3,'YYYY-MM-DD')) where workspace_id='pgtap-review-privacy' and entity_id='review-draft';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'clients'->0->'awaitingPublication','false'::jsonb,'Future draft does not imply awaiting publication');

select set_config('request.jwt.claim.sub','',true);
update public.aitask_entities set data=data||jsonb_build_object('periodStart',to_char(timezone('Asia/Kuala_Lumpur',now())::date-1,'YYYY-MM-DD'),'periodEnd',to_char(timezone('Asia/Kuala_Lumpur',now())::date+1,'YYYY-MM-DD'),'planId','another-plan') where workspace_id='pgtap-review-privacy' and entity_id='review-draft';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select is(public.aitask_read_client_portal('pgtap-review-privacy')->'clients'->0->'awaitingPublication','false'::jsonb,'Unrelated plan draft does not influence publication state');
select throws_ok($$select public.aitask_read_client_portal('other-workspace')$$,'42501','Client workspace membership required.','Client cannot read another workspace');

select set_config('request.jwt.claim.sub','',true);
update public.aitask_entities set data=data||'{"status":"Waiting Approval","isCompleted":true,"revisionCount":7,"completionPercentage":100,"clientApprovalStatus":"Pending"}'::jsonb where workspace_id='pgtap-review-privacy' and entity_id='review-task';
create function pg_temp.review_operations(overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId','review-task','data',private.aitask_client_task_projection(data)||'{"status":"Completed","isCompleted":true,"completionPercentage":100,"clientApprovalStatus":"Approved"}'::jsonb||overrides),
    jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId','review-event','parentId','review-task','data','{"id":"review-event","taskId":"review-task","userId":"review-client","status":"Approved","note":"Approved"}'::jsonb))
  from public.aitask_entities where workspace_id='pgtap-review-privacy' and entity_id='review-task';
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001301',true);
select ok(private.aitask_client_command_allowed('pgtap-review-privacy','approval.review',pg_temp.review_operations('{}')),'Projected approval can omit internal revision and assignment fields');
select ok(private.aitask_client_command_allowed('pgtap-review-privacy','approval.review',pg_temp.review_operations('{"assignedTo":""}')),'Older masked clients may submit a blank assignee without changing canonical assignment');
select ok(not private.aitask_client_command_allowed('pgtap-review-privacy','approval.review',pg_temp.review_operations('{"assignedTo":"attacker"}')),'Client cannot replace the canonical assignee');
select ok(not private.aitask_client_command_allowed('pgtap-review-privacy','approval.review',pg_temp.review_operations('{"revisionCount":99}')),'Client cannot forge an internal revision count');

select * from finish();
rollback;
