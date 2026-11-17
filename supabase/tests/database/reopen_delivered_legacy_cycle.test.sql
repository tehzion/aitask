begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-000000009711','reopen-legacy-pm@aitask.local');
insert into public.aitask_workspaces(id,name) values ('pgtap-reopen-legacy','Reopen delivered legacy work');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('reopen-legacy-pm','pgtap-reopen-legacy','00000000-0000-0000-0000-000000009711','PM','reopen-legacy-pm@aitask.local','Project Manager','Management',array['Management'],'{}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-reopen-legacy','client','legacy-company','{"id":"legacy-company","clientName":"Legacy Co","createdBy":"reopen-legacy-pm"}'),
  ('pgtap-reopen-legacy','project','legacy-project','{"id":"legacy-project","projectName":"Legacy Project","clientId":"legacy-company","clientName":"Legacy Co","createdBy":"reopen-legacy-pm","projectManagerIds":["reopen-legacy-pm"],"hodMemberIds":[]}'),
  ('pgtap-reopen-legacy','service_cycle','legacy-cycle','{"id":"legacy-cycle","clientId":"legacy-company","clientName":"Legacy Co","status":"Completed","publishedAt":"2026-11-01T00:00:00Z","serviceItems":[],"addonSnapshots":[{"id":"legacy-addon","unitPriceMinor":0}],"periodStart":"2026-11-01","periodEnd":"2026-11-30"}'),
  ('pgtap-reopen-legacy','deliverable','legacy-output','{"id":"legacy-output","title":"Design","status":"Delivered","clientId":"legacy-company","clientName":"Legacy Co","cycleId":"legacy-cycle","serviceItemId":"legacy-item","taskIds":[],"attachments":[],"sequence":1}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009711',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Match the browser batch: reopen the deliverable and send the derived cycle
-- status in the same command, omitting the add-on field removed from the app.
create temp table reopen_legacy_result as
  select public.aitask_execute_service_command('pgtap-reopen-legacy',gen_random_uuid(),'deliverable.manage',
    jsonb_build_array(
      jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','legacy-output',
        'expectedVersion',output.version,'data',(output.data || '{"status":"Ready"}') - 'deliveredAt'),
      jsonb_build_object('kind','entity','action','update','entityType','service_cycle','entityId','legacy-cycle',
        'expectedVersion',cycle.version,'data',(cycle.data || '{"status":"Published"}') - 'addonSnapshots')
    ), workspace.version) as response
  from public.aitask_workspaces workspace
  join public.aitask_entities output on output.workspace_id=workspace.id and output.entity_id='legacy-output'
  join public.aitask_entities cycle on cycle.workspace_id=workspace.id and cycle.entity_id='legacy-cycle'
  where workspace.id='pgtap-reopen-legacy';

select is((select response->>'ok' from reopen_legacy_result),'true','PM can reopen an older deliverable and its cycle in one save');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output'),'Ready','the deliverable stays reopened');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-cycle'),'Published','the month returns to Published');
select is((select data->'addonSnapshots' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-cycle'),
  '[{"id":"legacy-addon","unitPriceMinor":0}]'::jsonb,'the save preserves the frozen add-on data');

create temp table create_legacy_task_result as
  select public.aitask_execute_command('pgtap-reopen-legacy',gen_random_uuid(),'task.create',
    jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','task','entityId','legacy-task','parentId','legacy-project',
      'expectedVersion',0,'data','{"id":"legacy-task","title":"New design task","clientId":"legacy-company","clientName":"Legacy Co","projectId":"legacy-project","createdBy":"reopen-legacy-pm","assignedTo":"","department":"Designer","status":"Pending","visibility":"internal","serviceCycleId":"legacy-cycle","deliverableId":"legacy-output"}'::jsonb)),
    version) as response
  from public.aitask_workspaces where id='pgtap-reopen-legacy';

select is((select response->>'ok' from create_legacy_task_result),'true','PM can save a task under the reopened deliverable');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-task'),'Pending','new work starts as Pending');
select is((select data->>'status' from public.aitask_entities where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-output'),'Planned','the deliverable stays open while the new task is Pending');

select throws_ok($$update public.aitask_entities set data=data || '{"addonSnapshots":[]}'
  where workspace_id='pgtap-reopen-legacy' and entity_id='legacy-cycle'$$,
  '23514','A published service cycle keeps its frozen price terms.','an explicit change to the frozen add-ons is rejected');

select * from finish();
rollback;
