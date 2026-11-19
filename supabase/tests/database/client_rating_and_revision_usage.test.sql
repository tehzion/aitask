begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008201','authenticated','authenticated','rating-client@aitask.local','','{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-client-rating','Client rating');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,client_name,department,departments,permissions)
values ('rating-client','pgtap-client-rating','00000000-0000-0000-0000-000000008201','Customer','rating-client@aitask.local','Client','Rating Co','Client',array['Client'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-client-rating','client','rating-co','{"id":"rating-co","clientName":"Rating Co"}'),
('pgtap-client-rating','project','rating-project','{"id":"rating-project","clientId":"rating-co","clientName":"Rating Co","projectName":"Campaign","includedRevisions":2,"internalNote":"secret"}'),
('pgtap-client-rating','task','rating-task','{"id":"rating-task","clientId":"rating-co","clientName":"Rating Co","projectId":"rating-project","title":"Banner","assignedTo":"nobody","visibility":"client-visible","status":"Approved","isCompleted":false,"revisionCount":1,"completionPercentage":80,"clientApprovalStatus":"Pending","notes":"internal"}');

select is(private.aitask_client_task_projection('{"id":"T1","title":"Visible","revisionCount":2,"clientRating":{"stars":4},"notes":"secret"}'::jsonb),
  '{"id":"T1","title":"Visible","revisionCount":2,"clientRating":{"stars":4}}'::jsonb, 'the task projection shows revisions used and the rating, nothing internal');
select is(private.aitask_client_project_projection('{"id":"P1","projectName":"X","includedRevisions":2,"internalNote":"secret"}'::jsonb),
  '{"id":"P1","projectName":"X","includedRevisions":2}'::jsonb, 'the project projection shows the included revisions, nothing internal');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008201',true);
select is((public.aitask_read_client_portal('pgtap-client-rating')->'projects'->0->>'includedRevisions'),'2','the portal read returns the project allowance');
select is((public.aitask_read_client_portal('pgtap-client-rating')->'tasks'->0->>'revisionCount'),'1','the portal read returns the revision count');

create function pg_temp.ops(p_status text, p_rating jsonb) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId','rating-task','expectedVersion',version,
      'data',private.aitask_client_task_projection(data)
        ||case when p_status='Approved' then '{"status":"Approved","isCompleted":false,"completionPercentage":80,"clientApprovalStatus":"Approved"}'::jsonb
               else '{"status":"In Progress","isCompleted":false,"completionPercentage":50,"clientApprovalStatus":"Rejected"}'::jsonb end
        ||case when p_rating is null then '{}'::jsonb else jsonb_build_object('clientRating',p_rating) end),
    jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId','rating-event','parentId','rating-task',
      'data',jsonb_build_object('id','rating-event','taskId','rating-task','userId','rating-client','status',p_status,'note','ok')))
  from public.aitask_entities where workspace_id='pgtap-client-rating' and entity_id='rating-task';
$$;

select ok(private.aitask_client_command_allowed('pgtap-client-rating','approval.review',pg_temp.ops('Approved','{"stars":5,"comment":"Lovely"}')),'an approval may carry a 1-5 rating');
select ok(not private.aitask_client_command_allowed('pgtap-client-rating','approval.review',pg_temp.ops('Approved','{"stars":9}')),'stars above 5 are refused');
select ok(not private.aitask_client_command_allowed('pgtap-client-rating','approval.review',pg_temp.ops('Approved','{"stars":0}')),'stars below 1 are refused');
select ok(not private.aitask_client_command_allowed('pgtap-client-rating','approval.review',pg_temp.ops('Rejected','{"stars":5}')),'a rating cannot ride on a revision request');
select ok(private.aitask_client_command_allowed('pgtap-client-rating','approval.review',pg_temp.ops('Approved',null)),'an approval without a rating still works');

select set_config('pgtap.rating_ops',pg_temp.ops('Approved','{"stars":5,"comment":"  Lovely work  ","ratedBy":"someone-else","ratedAt":"1900-01-01T00:00:00.000Z"}')::text,true);
set local role authenticated;
select is((public.aitask_execute_command('pgtap-client-rating',gen_random_uuid(),'approval.review',current_setting('pgtap.rating_ops')::jsonb)->>'ok')::boolean,true,'the approval with a rating saves through the authenticated RPC');
reset role;
select is((select data->'clientRating' from public.aitask_entities where workspace_id='pgtap-client-rating' and entity_id='rating-task')->>'ratedBy','rating-client','who rated is stamped by the server, not taken from the client');
select * from finish();
rollback;
