begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000951','authenticated','authenticated','hod-delete@aitask.local','',now(),'{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000952','authenticated','authenticated','boss-delete@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-delete','HOD destructive permissions');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
 ('hod-delete','pgtap-hod-delete','00000000-0000-0000-0000-000000000951','HOD','hod-delete@aitask.local','HOD','Video Editor',array['Video Editor'],'{}',false),
 ('boss-delete','pgtap-hod-delete','00000000-0000-0000-0000-000000000952','Boss','boss-delete@aitask.local','Project Manager','Management',array['Management'],'{}',true),
 ('staff-delete','pgtap-hod-delete',null,'Editor','staff-delete@aitask.local','Staff','Video Editor',array['Video Editor'],'{}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-hod-delete','task',id,jsonb_build_object('id',id,'title',id,'clientName','Deletion Co','department',department,'createdBy',creator,'assignedTo',assignee,'status','Pending')
from (values
 ('oversight','Editor','boss-delete','staff-delete'),
 ('assigned','Video Editor','boss-delete','hod-delete'),
 ('created','Video Editor','hod-delete','staff-delete'),
 ('foreign-assigned','Designer','boss-delete','hod-delete'),
 ('delegated','Video Editor','boss-delete','staff-delete')
) fixtures(id,department,creator,assignee);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000951',true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(private.aitask_can_edit_task('pgtap-hod-delete','oversight'),'department oversight still permits edits');
select ok(not private.aitask_can_delete_task('pgtap-hod-delete','oversight'),'department oversight does not permit deletion');
select ok(private.aitask_can_delete_task('pgtap-hod-delete','assigned'),'current HOD assignment authorizes deletion');
select ok(private.aitask_can_delete_task('pgtap-hod-delete','created'),'HOD creator retains deletion after delegation');
select ok(not private.aitask_can_delete_task('pgtap-hod-delete','foreign-assigned'),'foreign assigned work remains editable but not deletable');
select ok(not private.aitask_can_delete_task('pgtap-hod-delete','delegated'),'past delegation attribution alone cannot authorize deletion');
select ok(not private.aitask_can_delete_task('pgtap-hod-delete','missing'),'missing tasks fail closed');
select ok(not has_function_privilege('authenticated','private.aitask_can_delete_task(text,text)','EXECUTE'),'new helper stays private');
select ok(not has_function_privilege('anon','private.aitask_can_delete_task(text,text)','EXECUTE'),'anonymous helper execution denied');

set local role authenticated;
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','oversight','expectedVersion',1)))->>'ok')::boolean,false,'authenticated command rejects oversight deletion');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-hod-delete' and entity_id='oversight'),1,'rejected deletion preserves task');
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.update',
 jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId','oversight','expectedVersion',version,'data',data||'{"status":"In Progress"}'::jsonb)))->>'ok')::boolean,true,'same oversight task can still save routine edits')
from public.aitask_entities where workspace_id='pgtap-hod-delete' and entity_id='oversight';
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','assigned','expectedVersion',1)))->>'ok')::boolean,true,'authenticated assigned-task deletion succeeds');
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','created','expectedVersion',1)))->>'ok')::boolean,true,'authenticated creator deletion succeeds');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000952',true);
update public.aitask_members set permissions='{"manageCreatedTasks":false}' where id='hod-delete';
update public.aitask_entities set data=data||'{"assignedTo":"hod-delete"}'::jsonb where workspace_id='pgtap-hod-delete' and entity_id='delegated';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000951',true);
select ok(private.aitask_can_edit_task('pgtap-hod-delete','delegated'),'permission revocation preserves routine editing');
select ok(not private.aitask_can_delete_task('pgtap-hod-delete','delegated'),'revoked management permission disables deletion');
set local role authenticated;
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','delegated','expectedVersion',version)))->>'ok')::boolean,false,'revoked permission is enforced at command time')
from public.aitask_entities where workspace_id='pgtap-hod-delete' and entity_id='delegated';
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000952',true);
select ok(private.aitask_can_delete_task('pgtap-hod-delete','oversight'),'Boss retains unrestricted deletion');
set local role authenticated;
select is((public.aitask_execute_command('pgtap-hod-delete',gen_random_uuid(),'task.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','task','entityId','oversight','expectedVersion',version)))->>'ok')::boolean,true,'Boss command deletes department work')
from public.aitask_entities where workspace_id='pgtap-hod-delete' and entity_id='oversight';
reset role;
select * from finish();
rollback;
