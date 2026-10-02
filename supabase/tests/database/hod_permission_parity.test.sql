begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Every internal alias accepted by the frontend must resolve identically here.
select is(private.aitask_task_department(alias), canonical, 'canonical department: ' || alias)
from (values
 ('operations','Operation'),('operation','Operation'),('management','Management'),
 ('videoshooting','Video Shooting'),('video shooting','Video Shooting'),('shooting','Video Shooting'),('videography','Video Shooting'),
 ('editor','Video Editor'),('video editor','Video Editor'),('video editing','Video Editor'),('editing','Video Editor'),
 ('ads management','Ads Management'),('ads','Ads Management'),('advertising','Ads Management'),
 ('account & finance','Account & Finance'),('account','Account & Finance'),('finance','Account & Finance'),('account and finance','Account & Finance'),
 ('designer','Designer'),('design','Designer'),('graphic','Designer'),(' VIDEO_EDITOR ','Video Editor')
) departments(alias,canonical);
select is(private.aitask_task_department('Unknown department'),null::text,'unknown departments do not widen access');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000928','authenticated','authenticated','hod-parity@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-parity','HOD parity QA');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions) values
 ('hod-parity','pgtap-hod-parity','00000000-0000-0000-0000-000000000928','HOD','hod-parity@aitask.local','HOD','Video Editor',array['Video Shooting','Video Editor'],'{}'),
 ('editor-parity','pgtap-hod-parity',null,'Editor','editor-parity@aitask.local','Staff','Video Editor',array['Video Editor'],'{}'),
 ('designer-parity','pgtap-hod-parity',null,'Designer','designer-parity@aitask.local','Staff','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
 ('pgtap-hod-parity','task','alias-work','{"id":"alias-work","title":"Legacy Editor work","clientName":"Parity Co","department":"Editor","assignedTo":"editor-parity","createdBy":"editor-parity","status":"Pending"}'),
 ('pgtap-hod-parity','task','foreign-work','{"id":"foreign-work","title":"Foreign work","clientName":"Hidden Co","department":"Designer","assignedTo":"designer-parity","createdBy":"designer-parity","status":"Pending"}'),
 ('pgtap-hod-parity','notification','hod-notice','{"id":"hod-notice","targetRole":"HOD","title":"HOD notice","readByUserIds":[],"isRead":false}'),
 ('pgtap-hod-parity','notification','pm-notice','{"id":"pm-notice","targetRole":"Project Manager","title":"PM notice","readByUserIds":[],"isRead":false}'),
 ('pgtap-hod-parity','client','hidden-company','{"id":"hidden-company","clientName":"Hidden Company","createdBy":"designer-parity"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000928',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(private.aitask_member_role('pgtap-hod-parity'),'Staff','HOD normalized backend role remains deliberate');
select ok(private.aitask_is_hod('pgtap-hod-parity'),'HOD identity remains available to authorization');
select ok(private.aitask_can_view_task('pgtap-hod-parity','alias-work'),'HOD can view legacy Editor work');
select ok(private.aitask_can_edit_task('pgtap-hod-parity','alias-work'),'HOD can edit legacy Editor work');
select ok(private.aitask_can_comment_task('pgtap-hod-parity','alias-work'),'HOD can comment on legacy department work');
select ok(not private.aitask_can_edit_task('pgtap-hod-parity','foreign-work'),'foreign department work remains denied');
select ok(not private.aitask_has_permission('pgtap-hod-parity',permission),'restricted HOD permission: '||permission)
from unnest(array['viewApprovals','manageUsers','viewAllTasks','viewAllClients','manageClientPlans','manageServiceCycles','viewServicePrices','manageServiceCatalog']) permission;
select ok(not private.aitask_can_access_service_client('pgtap-hod-parity','hidden-company'),'foreign service client denied');

select ok(not private.aitask_task_assignment_is_valid('pgtap-hod-parity','update',
 jsonb_build_object('assignedTo','hod-parity','createdBy','designer-parity','department','Designer'),
 jsonb_build_object('assignedTo','designer-parity','createdBy','designer-parity','department','Designer')),
 'HOD cannot reassign an assigned task outside their departments');

set local role authenticated;
select is((public.aitask_execute_command('pgtap-hod-parity',gen_random_uuid(),'task.update',
 jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId','alias-work','expectedVersion',version,'data',data||'{"status":"In Progress"}'::jsonb)))->>'ok')::boolean,true,'legacy department work saves through the authenticated command RPC')
from public.aitask_entities where workspace_id='pgtap-hod-parity' and entity_type='task' and entity_id='alias-work';
select is((public.aitask_execute_command('pgtap-hod-parity',gen_random_uuid(),'workspace.patch',
 jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','notification','entityId','hod-notice','expectedVersion',version,'data',data||'{"readByUserIds":["hod-parity"]}'::jsonb)))->>'ok')::boolean,true,'HOD-targeted notice saves through generic command without extra privileges')
from public.aitask_entities where workspace_id='pgtap-hod-parity' and entity_type='notification' and entity_id='hod-notice';
select is((public.aitask_set_notifications_read('pgtap-hod-parity',gen_random_uuid(),array['hod-notice'],false,false)->>'ok')::boolean,true,'dedicated notification RPC agrees with generic update');
select is((public.aitask_set_notifications_read('pgtap-hod-parity',gen_random_uuid(),array['pm-notice'],true,false)->>'ok')::boolean,false,'Project Manager notice remains denied');
select is((public.aitask_execute_command('pgtap-hod-parity',gen_random_uuid(),'client.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','client','entityId','hidden-company','expectedVersion',1)))->>'ok')::boolean,false,'hidden company deletion remains denied');
select is((public.aitask_execute_command('pgtap-hod-parity',gen_random_uuid(),'workspace.patch',
 jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','client','entityId','owned-company','expectedVersion',0,'data',jsonb_build_object('id','owned-company','clientName','Owned Company','createdBy','hod-parity'))))->>'ok')::boolean,true,'default HOD can create a company');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-hod-parity' and entity_type='client' and entity_id='owned-company'),1,'created company is readable to HOD owner');
select is((public.aitask_execute_command('pgtap-hod-parity',gen_random_uuid(),'client.delete',
 jsonb_build_array(jsonb_build_object('kind','entity','action','delete','entityType','client','entityId','owned-company','expectedVersion',1)))->>'ok')::boolean,true,'default HOD can delete their own company');
reset role;
select ok(not has_function_privilege('authenticated','private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)','EXECUTE'),'private mutation validator remains inaccessible directly');
select * from finish();
rollback;
