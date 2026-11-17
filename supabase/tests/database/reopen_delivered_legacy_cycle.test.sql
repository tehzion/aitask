begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009711','reopen-legacy-pm@aitask.local'),
  ('00000000-0000-0000-0000-000000009712','reopen-legacy-staff@aitask.local'),
  ('00000000-0000-0000-0000-000000009713','reopen-legacy-hod@aitask.local');
insert into public.aitask_workspaces(id,name) values ('pgtap-reopen-legacy','Reopen delivered legacy work');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('reopen-legacy-pm','pgtap-reopen-legacy','00000000-0000-0000-0000-000000009711','PM','reopen-legacy-pm@aitask.local','Project Manager','Management',array['Management'],'{}',false),
  ('reopen-legacy-staff','pgtap-reopen-legacy','00000000-0000-0000-0000-000000009712','Staff','reopen-legacy-staff@aitask.local','Staff','Designer',array['Designer'],'{}',false),
  ('reopen-legacy-hod','pgtap-reopen-legacy','00000000-0000-0000-0000-000000009713','HOD','reopen-legacy-hod@aitask.local','HOD','Designer',array['Designer'],'{}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-reopen-legacy','client','legacy-company','{"id":"legacy-company","clientName":"Legacy Co","createdBy":"reopen-legacy-pm"}'),
  ('pgtap-reopen-legacy','project','legacy-project','{"id":"legacy-project","projectName":"Legacy Project","clientId":"legacy-company","clientName":"Legacy Co","createdBy":"reopen-legacy-pm","projectManagerIds":["reopen-legacy-pm"],"hodMemberIds":["reopen-legacy-hod"]}'),
  ('pgtap-reopen-legacy','service_cycle','legacy-cycle','{"id":"legacy-cycle","clientId":"legacy-company","clientName":"Legacy Co","status":"Published","publishedAt":"2026-11-01T00:00:00Z","serviceItems":[],"addonSnapshots":[{"id":"legacy-addon","unitPriceMinor":0}],"periodStart":"2026-11-01","periodEnd":"2026-11-30"}'),
  ('pgtap-reopen-legacy','deliverable','legacy-output','{"id":"legacy-output","title":"Design","status":"Ready","clientId":"legacy-company","clientName":"Legacy Co","cycleId":"legacy-cycle","serviceItemId":"legacy-item","taskIds":[],"attachments":[],"sequence":1}'),
  ('pgtap-reopen-legacy','task','legacy-standalone','{"id":"legacy-standalone","title":"Existing design task","clientId":"legacy-company","clientName":"Legacy Co","projectId":"legacy-project","createdBy":"reopen-legacy-pm","department":"Designer","status":"Pending","visibility":"internal"}');

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-reopen-legacy','task',id,jsonb_build_object('id',id,'title',id,'clientId','legacy-company','clientName','Legacy Co',
  'projectId','legacy-project','createdBy','reopen-legacy-pm','assignedTo',assignee,'department','Designer','status','Completed',
  'isCompleted',true,'visibility','internal','serviceCycleId','legacy-cycle','deliverableId','legacy-output')
from (values ('legacy-staff-task','reopen-legacy-staff'), ('legacy-hod-task','reopen-legacy-hod')) as assigned(id,assignee);
update public.aitask_entities set data=data || '{"status":"Delivered"}' where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output';

-- Build the same paired update as the app, including its omission of legacy add-ons.
create function pg_temp.reopen_operations(cycle_patch jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','legacy-output',
      'expectedVersion',output.version,'data',(output.data || '{"status":"Ready"}') - 'deliveredAt'),
    jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','legacy-cycle',
      'expectedVersion',cycle.version,'data',((cycle.data || '{"status":"Published"}') - 'addonSnapshots') || cycle_patch)
  )
  from public.aitask_entities output
  join public.aitask_entities cycle on cycle.workspace_id=output.workspace_id and cycle.entity_id='legacy-cycle'
  where output.workspace_id='pgtap-reopen-legacy' and output.entity_id='legacy-output';
$$;

create function pg_temp.link_legacy_task(task_id text, patch jsonb, existing boolean default false) returns jsonb
language sql as $$
  select public.aitask_execute_command('pgtap-reopen-legacy',gen_random_uuid(),case when existing then 'task.update' else 'task.create' end,
    jsonb_build_array(jsonb_build_object('kind','entity','action',case when existing then 'update' else 'insert' end,
      'entityType','task','entityId',task_id,'parentId','legacy-project','expectedVersion',coalesce(task.version,0),
      'data',coalesce(task.data,jsonb_build_object('id',task_id,'title','New design task','clientId','legacy-company',
        'clientName','Legacy Co','projectId','legacy-project','createdBy','reopen-legacy-pm','assignedTo','','department','Designer',
        'status','Pending','visibility','internal')) || patch)), workspace.version)
  from public.aitask_workspaces workspace
  left join public.aitask_entities task on task.workspace_id=workspace.id and task.entity_type='task' and task.entity_id=task_id
  where workspace.id='pgtap-reopen-legacy';
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009711',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(pg_temp.link_legacy_task('legacy-task','{"serviceCycleId":"legacy-cycle","deliverableId":"legacy-output"}')->>'ok',
  'false','PM cannot create a task linked to a delivered output');
select is(pg_temp.link_legacy_task('legacy-standalone','{"serviceCycleId":"legacy-cycle","deliverableId":"legacy-output"}',true)->>'ok',
  'false','PM cannot attach existing work to a delivered output');
select is(pg_temp.link_legacy_task('legacy-staff-task','{"priority":"High"}',true)->>'ok',
  'true','PM can still edit a task already linked to the delivered output');
select is(public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','legacy-output',
      'expectedVersion',version,'data',(data || '{"status":"Ready","taskIds":["legacy-standalone"]}') - 'deliveredAt')))->>'ok',
  'false','PM cannot simultaneously reopen and add a new reverse link in one deliverable update')
from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output';
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output'),
  'Delivered','rejected linking attempts keep the confirmed delivery intact');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009712',true);
with attempt as materialized (
  select public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
    pg_temp.reopen_operations(),version) as response
  from public.aitask_workspaces where id='pgtap-reopen-legacy'
)
select is(coalesce(response->>'error',response->>'ok'),'true','assigned Staff can reopen a legacy delivery using the versioned RPC') from attempt;
update public.aitask_entities set data=data || '{"status":"Delivered"}' where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009713',true);
select is(public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
  pg_temp.reopen_operations('{"addonSnapshots":[]}'))->>'code','FORBIDDEN','assigned HOD cannot explicitly remove frozen add-ons');
select is(public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
  pg_temp.reopen_operations('{"periodEnd":"2026-12-31"}'))->>'code','FORBIDDEN','assigned HOD cannot use omission to change the cycle dates');
with attempt as materialized (
  select public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',pg_temp.reopen_operations()) as response
)
select is(coalesce(response->>'error',response->>'ok'),'true','assigned HOD can reopen a legacy delivery using the older RPC') from attempt;
update public.aitask_entities set data=data || '{"status":"Delivered"}' where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009711',true);
select is(public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
  pg_temp.reopen_operations(),version)->>'ok','true','PM can reopen an older deliverable and its cycle in one save')
from public.aitask_workspaces where id='pgtap-reopen-legacy';
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output'),'Ready','the deliverable stays reopened');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-cycle'),'Published','the month returns to Published');
select is((select data->'addonSnapshots' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-cycle'),
  '[{"id":"legacy-addon","unitPriceMinor":0}]'::jsonb,'the save preserves the frozen add-on data');
select is(pg_temp.link_legacy_task('legacy-task','{"serviceCycleId":"legacy-cycle","deliverableId":"legacy-output"}')->>'ok',
  'true','PM can save a task under the reopened deliverable');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-task'),'Pending','new work starts as Pending');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output'),
  'In Progress','existing completed work and the new pending task keep the delivery open');

select * from finish();
rollback;
