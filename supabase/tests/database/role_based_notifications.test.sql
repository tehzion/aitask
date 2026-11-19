begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008301','authenticated','authenticated','notif-client@aitask.local','','{}','{}',now(),now());
insert into public.aitask_workspaces(id,name,reminder_timezone) values ('pgtap-role-notif','Role notifications','UTC');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,client_name,department,departments,permissions,is_super_admin) values
('n-boss','pgtap-role-notif',null,'Boss','n-boss@aitask.local','Project Manager',null,'Management',array['Management'],'{}',true),
('n-pm','pgtap-role-notif',null,'Owner PM','n-pm@aitask.local','Project Manager',null,'Management',array['Management'],'{}',false),
('n-pm-other','pgtap-role-notif',null,'Other PM','n-pm-other@aitask.local','Project Manager',null,'Management',array['Management'],'{}',false),
('n-hod','pgtap-role-notif',null,'HOD','n-hod@aitask.local','HOD',null,'Designer',array['Designer'],'{}',false),
('n-staff','pgtap-role-notif',null,'Staff','n-staff@aitask.local','Staff',null,'Designer',array['Designer'],'{}',false),
('n-client','pgtap-role-notif','00000000-0000-0000-0000-000000008301','Customer','n-client@aitask.local','Client','Notif Co','Client',array['Client'],'{}',false);

create function pg_temp.task(p_id text, p_due_offset integer, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id',p_id,'clientName','Notif Co','title','Job '||p_id,'status','In Progress','isCompleted',false,
    'assignedTo','n-staff','responsibleHodId','n-hod','createdBy','n-pm','assignedBy','n-pm','visibility','internal',
    'dueDate',to_char((now() at time zone 'UTC')::date + p_due_offset,'YYYY-MM-DD')) || p_extra;
$$;

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-role-notif','client','notif-co','{"id":"notif-co","clientName":"Notif Co","createdBy":"n-pm"}'),
('pgtap-role-notif','task','late',pg_temp.task('late',-3)),
('pgtap-role-notif','task','stale',pg_temp.task('stale',-20)),
('pgtap-role-notif','task','done',pg_temp.task('done',-3,'{"status":"Completed","isCompleted":true}')),
('pgtap-role-notif','task','future',pg_temp.task('future',5)),
('pgtap-role-notif','task','today',pg_temp.task('today',0,'{"assignedTo":"n-staff"}'));

-- Who is accountable for a task.
select is((select array_agg(member_id order by member_id) from private.aitask_task_notification_recipients('pgtap-role-notif', pg_temp.task('x',0))),
  array['n-boss','n-hod','n-pm','n-staff'],
  'accountable people are Boss Koo, the assignee, the responsible HOD and the owning PM, not another PM');
select is((select is_boss from private.aitask_task_notification_recipients('pgtap-role-notif', pg_temp.task('x',0)) where member_id='n-boss'), true,
  'Boss Koo is flagged so callers can leave them out of routine notices');

-- Overdue notices.
select is(private.aitask_generate_overdue_task_notices('pgtap-role-notif', now()), 3,
  'one overdue notice each for the assignee, the responsible HOD and the owning PM');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->'route'->>'entityId'='late'), 3,
  'the overdue task was announced');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->>'targetUserId'='n-boss'), 0,
  'Boss Koo is not messaged for each overdue task');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->>'targetUserId'='n-pm-other'), 0,
  'a PM who does not own the work is not told');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->'route'->>'entityId' in ('stale','done','future','today')), 0,
  'old, finished, future and due-today work is not announced');
select matches((select data->>'message' from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->>'targetUserId'='n-staff'),
  '^"Job late" is overdue \(was due .*\)\.$'::text, 'the assignee gets a short message'::text);
select matches((select data->>'message' from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Overdue' and data->>'targetUserId'='n-pm'),
  '^"Job late" for Notif Co is overdue'::text, 'a manager also sees which client it is for'::text);
select is(private.aitask_generate_overdue_task_notices('pgtap-role-notif', now()), 0, 'a second run announces nothing again');

-- Reminders now include the responsible HOD.
select private.aitask_generate_due_task_reminders('pgtap-role-notif', now());
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and data->>'title'='Task Deadline Approaching' and data->>'targetUserId'='n-hod' and data->'route'->>'entityId'='today'), 1,
  'the responsible HOD is reminded of work due today even when they are not the assignee');

-- A client's decision reaches the team.
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-role-notif','task',id,pg_temp.task(id,9,'{"clientId":"notif-co","visibility":"client-visible","status":"Approved","revisionCount":0,"completionPercentage":80,"clientApprovalStatus":"Pending"}')
from (values ('dec-good'),('dec-low'),('dec-change')) as v(id);

create function pg_temp.ops(p_task text, p_status text, p_rating jsonb) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_task,'expectedVersion',version,
      'data',private.aitask_client_task_projection(data)
        ||case when p_status='Approved' then '{"status":"Approved","isCompleted":false,"completionPercentage":80,"clientApprovalStatus":"Approved"}'::jsonb
               else '{"status":"In Progress","isCompleted":false,"completionPercentage":50,"revisionCount":1,"clientApprovalStatus":"Rejected"}'::jsonb end
        ||case when p_rating is null then '{}'::jsonb else jsonb_build_object('clientRating',p_rating) end),
    jsonb_build_object('kind','entity','action','insert','entityType','approval','entityId',p_task||'-event','parentId',p_task,
      'data',jsonb_build_object('id',p_task||'-event','taskId',p_task,'userId','n-client','status',p_status,'note','ok')))
  from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_id=p_task;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008301',true);
select set_config('pgtap.ops_good',pg_temp.ops('dec-good','Approved','{"stars":5,"comment":"Lovely"}')::text,true);
select set_config('pgtap.ops_low',pg_temp.ops('dec-low','Approved','{"stars":2,"comment":"Meh"}')::text,true);
select set_config('pgtap.ops_change',pg_temp.ops('dec-change','Rejected',null)::text,true);
set local role authenticated;
select is((public.aitask_execute_command('pgtap-role-notif',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_good')::jsonb)->>'ok')::boolean,true,'a good approval with a rating saves');
select is((public.aitask_execute_command('pgtap-role-notif',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_low')::jsonb)->>'ok')::boolean,true,'a low-rated approval saves');
select is((public.aitask_execute_command('pgtap-role-notif',gen_random_uuid(),'approval.review',current_setting('pgtap.ops_change')::jsonb)->>'ok')::boolean,true,'a change request saves');
reset role;

select is((select array_agg(data->>'targetUserId' order by data->>'targetUserId') from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and entity_id like 'N-clientdecision-%' and data->>'title'='Client Approved Task' and data->'route'->>'entityId'='dec-good'),
  array['n-hod','n-pm'],
  'a plain approval also tells the responsible HOD and owning PM (Boss Koo and the assignee already hear from the command)');
select matches((select data->>'message' from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and entity_id like 'N-clientdecision-%' and data->>'title'='Client Approved Task' and data->>'targetUserId'='n-pm'),
  'rated 5/5'::text, 'the approval message carries the rating'::text);
select is((select array_agg(data->>'targetUserId' order by data->>'targetUserId') from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and entity_id like 'N-clientdecision-%' and data->>'title'='Low Client Rating' and data->'route'->>'entityId'='dec-low'),
  array['n-boss','n-hod','n-pm','n-staff'],
  'a low rating needs action, so everyone accountable is told, Boss Koo included');
select is((select array_agg(distinct data->>'importance') from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and entity_id like 'N-clientdecision-%' and data->>'title' in ('Low Client Rating','Client Requested Revision')),
  array['action'], 'low ratings and change requests are action items');
select is((select array_agg(data->>'targetUserId' order by data->>'targetUserId') from public.aitask_entities where workspace_id='pgtap-role-notif' and entity_type='notification' and entity_id like 'N-clientdecision-%' and data->>'title'='Client Requested Revision' and data->'route'->>'entityId'='dec-change'),
  array['n-hod','n-pm'], 'a change request also tells the HOD and owning PM');

select * from finish();
rollback;
