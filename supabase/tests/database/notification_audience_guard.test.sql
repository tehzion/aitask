begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('private', 'aitask_guard_notification_audience', array[]::text[], 'universal notification audience guard exists');
select has_trigger('public', 'aitask_entities', 'aitask_0_guard_notification_audience', 'universal notification trigger exists');
select ok((select prosecdef from pg_proc where oid = 'private.aitask_guard_notification_audience()'::regprocedure), 'universal guard runs as a definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid = 'private.aitask_guard_notification_audience()'::regprocedure), 'universal guard fixes its search path');
select ok(not has_function_privilege('anon', 'private.aitask_guard_notification_audience()', 'EXECUTE'), 'anonymous callers cannot execute the private guard');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000971','authenticated','authenticated','notification-guard@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-notification-guard','Notification guard');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin)
values ('notification-boss','pgtap-notification-guard','00000000-0000-0000-0000-000000000971','Boss','notification-guard@aitask.local','Project Manager','Management',array['Management'],true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-notification-guard','task','internal-task','{"id":"internal-task","title":"Private","clientName":"Guard Client","visibility":"internal","status":"Pending","createdBy":"notification-boss"}'),
('pgtap-notification-guard','task','visible-task','{"id":"visible-task","title":"Visible","clientName":"Guard Client","visibility":"client-visible","status":"Pending","createdBy":"notification-boss"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000971',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is((public.aitask_execute_command('pgtap-notification-guard',gen_random_uuid(),'workspace.patch',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','insert','entityType','notification','entityId','internal-notice','expectedVersion',0,
  'data',jsonb_build_object('id','internal-notice','targetClient','Guard Client','title','Task Completed','route',jsonb_build_object('page','tasks','entityId','internal-task'))
)))) ->> 'code','VALIDATION','internal client notifications are rejected for Boss');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-notification-guard' and entity_type='notification'),0,'rejected internal notice leaves no row');
select is((public.aitask_execute_command('pgtap-notification-guard',gen_random_uuid(),'workspace.patch',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','insert','entityType','notification','entityId','visible-notice','expectedVersion',0,
  'data',jsonb_build_object('id','visible-notice','targetClient','Guard Client','title','Task Completed','route',jsonb_build_object('page','tasks','entityId','visible-task'))
)))) ->> 'ok','true','client-visible client notification is accepted');
select is((public.aitask_execute_command('pgtap-notification-guard',gen_random_uuid(),'workspace.patch',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','insert','entityType','notification','entityId','mismatch-notice','expectedVersion',0,
  'data',jsonb_build_object('id','mismatch-notice','targetClient','Other Client','title','Task Completed','route',jsonb_build_object('page','tasks','entityId','visible-task'))
)))) ->> 'code','VALIDATION','mismatched client audience is rejected');
select is((public.aitask_execute_command('pgtap-notification-guard',gen_random_uuid(),'workspace.patch',jsonb_build_array(jsonb_build_object(
  'kind','entity','action','insert','entityType','notification','entityId','missing-notice','expectedVersion',0,
  'data',jsonb_build_object('id','missing-notice','targetClient','Guard Client','title','Task Completed','route',jsonb_build_object('page','tasks','entityId','missing-task'))
)))) ->> 'code','VALIDATION','missing task audience is rejected');
select is((public.aitask_execute_command(
  'pgtap-notification-guard', gen_random_uuid(), 'workspace.patch',
  jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId','internal-task','expectedVersion',1,
      'data',jsonb_build_object('id','internal-task','title','Private','clientName','Guard Client','visibility','internal','status','Completed','createdBy','notification-boss')),
    jsonb_build_object('kind','entity','action','insert','entityType','notification','entityId','atomic-bad','expectedVersion',0,
      'data',jsonb_build_object('id','atomic-bad','targetClient','Guard Client','title','Task Completed','route',jsonb_build_object('page','tasks','entityId','internal-task')))
  )
)) ->> 'code','VALIDATION','invalid notification rejects the combined command');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-notification-guard' and entity_type='task' and entity_id='internal-task'),'Pending','combined rejection leaves task unchanged');

reset role;
select * from finish();
rollback;
