begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',auth_id::uuid,'authenticated','authenticated',actor||'@aitask.local','',now(),'{}','{}',now(),now()
from (values
 ('delete-staff','00000000-0000-0000-0000-000000006601'),
 ('delete-hod','00000000-0000-0000-0000-000000006602'),
 ('delete-pm','00000000-0000-0000-0000-000000006603'),
 ('delete-boss','00000000-0000-0000-0000-000000006604')
) actors(actor,auth_id);
insert into public.aitask_workspaces(id,name) values('submitted-delete-test','Submitted task deletion');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
select actor,'submitted-delete-test',auth_id::uuid,actor,actor||'@aitask.local',role,'Designer',array['Designer'],boss
from (values
 ('delete-staff','00000000-0000-0000-0000-000000006601','Staff',false),
 ('delete-hod','00000000-0000-0000-0000-000000006602','HOD',false),
 ('delete-pm','00000000-0000-0000-0000-000000006603','Project Manager',false),
 ('delete-boss','00000000-0000-0000-0000-000000006604','Project Manager',true)
) actors(actor,auth_id,role,boss);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'submitted-delete-test','task',actor||'-'||status,jsonb_build_object(
 'id',actor||'-'||status,'title',actor||'-'||status,'clientName','Deletion Company','department','Designer',
 'createdBy',actor,'assignedTo','delete-staff','status',status,'isCompleted',status='Completed','visibility','internal')
from (values('delete-staff'),('delete-hod'),('delete-pm'),('delete-boss')) actors(actor)
cross join (values('Pending'),('Waiting Approval'),('Approved'),('Completed'),('Revision')) stages(status);

create function pg_temp.delete_stage(p_id text) returns jsonb language sql as $$
 select public.aitask_execute_command('submitted-delete-test',gen_random_uuid(),'task.delete',jsonb_build_array(jsonb_build_object(
 'kind','entity','action','delete','entityType','task','entityId',p_id,'expectedVersion',
 (select version from public.aitask_entities where workspace_id='submitted-delete-test' and entity_type='task' and entity_id=p_id))))
$$;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006601',true);
select ok(not private.aitask_can_delete_task('submitted-delete-test','delete-staff-'||status),'Staff cannot erase '||status||' work')
from (values('Waiting Approval'),('Approved'),('Completed')) stages(status);
set local role authenticated;
select is(pg_temp.delete_stage('delete-staff-'||status)->>'code','FORBIDDEN','command rejects Staff deletion at '||status)
from (values('Waiting Approval'),('Approved'),('Completed')) stages(status);
select is((select count(*)::integer from public.aitask_entities where workspace_id='submitted-delete-test' and entity_id like 'delete-staff-%'),5,'rejected commands leave all task rows intact');
select throws_ok($$delete from public.aitask_entities where workspace_id='submitted-delete-test' and entity_type='task' and entity_id in ('delete-staff-Waiting Approval','delete-staff-Approved','delete-staff-Completed')$$,'42501','permission denied for table aitask_entities','direct table deletion is denied before reaching business records');
select is((select count(*)::integer from public.aitask_entities where workspace_id='submitted-delete-test' and entity_id like 'delete-staff-%'),5,'direct table deletion cannot bypass the command restriction');
select is((select count(*)::integer from public.aitask_entities where workspace_id='submitted-delete-test' and entity_type='notification'),0,'blocked deletion generates no misleading notices');
select is((pg_temp.delete_stage('delete-staff-'||status)->>'ok')::boolean,true,'Staff retains deletion for ordinary '||status||' work')
from (values('Pending'),('Revision')) stages(status);
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006602',true);
set local role authenticated;
select is((pg_temp.delete_stage('delete-hod-'||status)->>'ok')::boolean,true,'responsible HOD retains deletion at '||status)
from (values('Waiting Approval'),('Approved'),('Completed')) stages(status);
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006603',true);
set local role authenticated;
select is((pg_temp.delete_stage('delete-pm-'||status)->>'ok')::boolean,true,'portfolio PM retains deletion at '||status)
from (values('Waiting Approval'),('Approved'),('Completed')) stages(status);
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000006604',true);
set local role authenticated;
select is((pg_temp.delete_stage('delete-boss-'||status)->>'ok')::boolean,true,'Boss retains deletion at '||status)
from (values('Waiting Approval'),('Approved'),('Completed')) stages(status);
reset role;
select ok(not has_function_privilege('authenticated','private.aitask_can_delete_task(text,text)','EXECUTE'),'deletion helper stays private');
select * from finish();
rollback;
