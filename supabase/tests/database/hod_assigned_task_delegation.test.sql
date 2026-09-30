begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000991','authenticated','authenticated','delegation-hod@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-delegation','HOD delegation QA');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,custom_role_id,permissions) values
('delegation-hod','pgtap-hod-delegation','00000000-0000-0000-0000-000000000991','HOD','delegation-hod@aitask.local','HOD','Designer',array['Designer'],null,'{}'),
('delegation-designer','pgtap-hod-delegation',null,'Designer','delegation-designer@aitask.local','Staff','Designer',array['Designer'],null,'{}'),
('delegation-video','pgtap-hod-delegation',null,'Video','delegation-video@aitask.local','Staff','Video Editor',array['Video Editor'],null,'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-hod-delegation','task',id,jsonb_build_object('id',id,'title',id,'clientName','Delegation client','department','Designer','assignedTo',case when id='unrelated' then 'delegation-designer' else 'delegation-hod' end,'createdBy','delegation-designer','status','Pending','visibility','internal')
from unnest(array['allowed','unrelated','wrong-department','changed-creator','missing']) id;
create function pg_temp.delegate_task(p_id text, p_target text, p_creator text default 'delegation-designer') returns jsonb language sql as $$
  select public.aitask_execute_command('pgtap-hod-delegation',gen_random_uuid(),'task.update',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_id,'expectedVersion',version,'data',data || jsonb_build_object('assignedTo',p_target,'createdBy',p_creator))))
  from public.aitask_entities where workspace_id='pgtap-hod-delegation' and entity_type='task' and entity_id=p_id;
$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000991',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((pg_temp.delegate_task('allowed','delegation-designer')->>'ok')::boolean,true,'HOD can delegate an assigned task within the department through the public RPC');
select is((pg_temp.delegate_task('unrelated','delegation-video')->>'ok')::boolean,false,'unrelated work cannot be delegated');
select is((pg_temp.delegate_task('wrong-department','delegation-video')->>'ok')::boolean,false,'target department membership is enforced');
select is((pg_temp.delegate_task('changed-creator','delegation-designer','delegation-hod')->>'ok')::boolean,false,'delegation never transfers creator ownership');
select is((pg_temp.delegate_task('missing','missing-member')->>'ok')::boolean,false,'missing assignees are denied');
reset role;
select * from finish();
rollback;
