begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000007a1','authenticated','authenticated','visible-pm@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values('visible-completion-test','Visible completion test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values('visible-pm','visible-completion-test','00000000-0000-0000-0000-0000000007a1','PM','visible-pm@aitask.local','Project Manager','Management',array['Management'],false);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('visible-completion-test','task','visible-task','{"id":"visible-task","clientName":"Acme","title":"Visible artwork","department":"Designer","assignedTo":"visible-pm","createdBy":"visible-pm","status":"Approved","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"client-visible","attachmentLink":"https://example.com/output.pdf"}'),
('visible-completion-test','task','internal-task','{"id":"internal-task","clientName":"Acme","title":"Internal artwork","department":"Designer","assignedTo":"visible-pm","createdBy":"visible-pm","status":"Approved","isCompleted":false,"clientApprovalStatus":"Pending","visibility":"internal"}');

create function pg_temp.complete_task(p_id text) returns jsonb language sql as $$
  select public.aitask_execute_command('visible-completion-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
    'kind','entity','action','update','entityType','task','entityId',p_id,
    'expectedVersion',(select version from public.aitask_entities where workspace_id='visible-completion-test' and entity_type='task' and entity_id=p_id),
    'data',(select data from public.aitask_entities where workspace_id='visible-completion-test' and entity_type='task' and entity_id=p_id)||'{"status":"Completed","isCompleted":true}'
  )));
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000007a1',true);
set local role authenticated;

select is((pg_temp.complete_task('visible-task')->>'ok')::boolean,true,'a project manager can complete client-visible approved work');
select is((select data->>'clientApprovalStatus' from public.aitask_entities where workspace_id='visible-completion-test' and entity_id='visible-task'),'Pending','client-visible completion keeps client review pending');
select is((select (data->>'isCompleted')::boolean and (data->>'completionPercentage')::integer=100 from public.aitask_entities where workspace_id='visible-completion-test' and entity_id='visible-task'),true,'client-visible completion is recorded at 100 percent');

select is((pg_temp.complete_task('internal-task')->>'ok')::boolean,true,'a project manager can complete internal approved work');
select is((select data->>'clientApprovalStatus' from public.aitask_entities where workspace_id='visible-completion-test' and entity_id='internal-task'),'Approved','internal completion keeps immediate acceptance');

reset role;
select * from finish();
rollback;
