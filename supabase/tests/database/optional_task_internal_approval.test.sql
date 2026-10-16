begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006101','authenticated','authenticated','optional-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006102','authenticated','authenticated','optional-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006103','authenticated','authenticated','optional-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000006104','authenticated','authenticated','optional-other-pm@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('optional-approval-test','Optional approval test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('optional-pm','optional-approval-test','00000000-0000-0000-0000-000000006101','PM','optional-pm@aitask.local','Project Manager','Management',array['Management'],false),
('optional-hod','optional-approval-test','00000000-0000-0000-0000-000000006102','HOD','optional-hod@aitask.local','HOD','Designer',array['Designer'],false),
('optional-staff','optional-approval-test','00000000-0000-0000-0000-000000006103','Staff','optional-staff@aitask.local','Staff','Designer',array['Designer'],false),
('optional-other-pm','optional-approval-test','00000000-0000-0000-0000-000000006104','Other PM','optional-other-pm@aitask.local','Project Manager','Management',array['Management'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('optional-approval-test','task','optional-task','{"id":"optional-task","clientName":"Optional Company","title":"Output","department":"Designer","assignedTo":"optional-staff","createdBy":"optional-pm","assignedBy":"optional-pm","status":"Waiting Approval","isCompleted":false,"clientApprovalStatus":"Pending","attachmentLink":"https://example.com/output.pdf"}');

create function pg_temp.optional_update(p_id text,p_patch jsonb,p_omit_flag boolean default false) returns jsonb language sql as $$
 select public.aitask_execute_command('optional-approval-test',gen_random_uuid(),'task.update',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','update','entityType','task','entityId',p_id,
 'expectedVersion',(select version from public.aitask_entities where workspace_id='optional-approval-test' and entity_type='task' and entity_id=p_id),
 'data',(select case when p_omit_flag then data-'requiresInternalApproval' else data end from public.aitask_entities where workspace_id='optional-approval-test' and entity_type='task' and entity_id=p_id)||p_patch)))
$$;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006101',true);
set local role authenticated;
select is((pg_temp.optional_update('optional-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'approval is required by default');
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":false,"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'PM cannot opt out and complete in one write');
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":"false"}')->>'ok')::boolean,false,'approval flag must be a JSON boolean');
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":false}')->>'ok')::boolean,true,'responsible PM can opt out');
select is((pg_temp.optional_update('optional-task','{"notes":"Cached edit"}',true)->>'ok')::boolean,true,'cached client can save an unrelated edit without the new field');
select is((select data->>'requiresInternalApproval' from public.aitask_entities where workspace_id='optional-approval-test' and entity_id='optional-task'),'false','cached edit preserves the opt-out');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006102',true);
set local role authenticated;
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":true}')->>'ok')::boolean,false,'HOD cannot change approval requirement');
select is((pg_temp.optional_update('optional-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'HOD cannot complete opted-out task');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006103',true);
set local role authenticated;
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":true}')->>'ok')::boolean,false,'Staff cannot change approval requirement');
select is((pg_temp.optional_update('optional-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'Staff cannot complete opted-out task');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006104',true);
set local role authenticated;
select is((pg_temp.optional_update('optional-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,false,'foreign PM cannot complete opted-out task');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006101',true);
set local role authenticated;
select is((pg_temp.optional_update('optional-task','{"status":"Completed","isCompleted":true}')->>'ok')::boolean,true,'responsible PM completes from Waiting Approval');
select is((select (data->>'completionPercentage')::integer from public.aitask_entities where workspace_id='optional-approval-test' and entity_id='optional-task'),100,'direct completion reaches 100 percent');
select ok((select data->>'completedAt' is not null and not(data ? 'reviewDecision') from public.aitask_entities where workspace_id='optional-approval-test' and entity_id='optional-task'),'direct completion has timestamp without forged review signature');
select is((pg_temp.optional_update('optional-task','{"requiresInternalApproval":true}')->>'ok')::boolean,false,'closed task approval requirement cannot change');
reset role;
select * from finish();
rollback;
