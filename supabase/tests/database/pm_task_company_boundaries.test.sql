begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008201','authenticated','authenticated','pm-task-one@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008202','authenticated','authenticated','pm-task-two@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008203','authenticated','authenticated','pm-task-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-pm-task-company','PM task company boundaries');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('pm-one','pgtap-pm-task-company','00000000-0000-0000-0000-000000008201','One','pm-task-one@aitask.local','Project Manager','Management','{}',false),
('pm-two','pgtap-pm-task-company','00000000-0000-0000-0000-000000008202','Two','pm-task-two@aitask.local','Project Manager','Management','{}',false),
('boss','pgtap-pm-task-company','00000000-0000-0000-0000-000000008203','Boss','pm-task-boss@aitask.local','Project Manager','Management','{}',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-pm-task-company','client','own','{"id":"own","clientName":"Own","createdBy":"pm-one"}'),
('pgtap-pm-task-company','client','second','{"id":"second","clientName":"Second","createdBy":"pm-one"}'),
('pgtap-pm-task-company','client','foreign','{"id":"foreign","clientName":"Foreign","createdBy":"pm-two"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-pm-task-company','task',id,jsonb_build_object('id',id,'title','Task','clientId','own','clientName','Own','createdBy','pm-one','department','Designer','assignedTo','','status','Pending','isCompleted',false)
from unnest(array['rpc-attack','direct-attack','mismatch','move','revoked-create']) id;
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-pm-task-company','task','legacy','{"id":"legacy","title":"Legacy","clientId":"missing-legacy-id","clientName":"Legacy","createdBy":"pm-one","department":"Designer","assignedTo":"","status":"Pending"}'),
('pgtap-pm-task-company','task','assigned','{"id":"assigned","title":"Assigned","clientName":"Assigned company","createdBy":"boss","department":"Designer","assignedTo":"pm-one","status":"Pending"}');

create function pg_temp.pm_task(action text,id text,patch jsonb) returns jsonb language sql as $$
 select public.aitask_execute_command('pgtap-pm-task-company',gen_random_uuid(),case when action='insert' then 'task.create' else 'task.update' end,
 jsonb_build_array(jsonb_build_object('kind','entity','action',action,'entityType','task','entityId',id,
 'expectedVersion',case when action='insert' then 0 else (select version from public.aitask_entities where workspace_id='pgtap-pm-task-company' and entity_type='task' and entity_id=id) end,
 'data',case when action='insert' then jsonb_build_object('id',id,'title','Task','clientId','own','clientName','Own','createdBy','pm-one','department','Designer','assignedTo','','status','Pending','isCompleted',false)||patch
 else (select data from public.aitask_entities where workspace_id='pgtap-pm-task-company' and entity_type='task' and entity_id=id)||patch end)));
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008201',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(private.aitask_can_access_service_client('pgtap-pm-task-company','foreign'),false,'foreign service company starts inaccessible');
select is(pg_temp.pm_task('update','rpc-attack','{"clientId":"foreign","clientName":"Foreign"}')->>'ok','false','RPC cannot move owned work into a foreign company');
select throws_ok($$update public.aitask_entities set data=data||'{"clientId":"foreign","clientName":"Foreign"}'::jsonb where workspace_id='pgtap-pm-task-company' and entity_type='task' and entity_id='direct-attack'$$,'42501','permission denied for table aitask_entities','direct writes remain unavailable to authenticated callers');
select is(private.aitask_can_access_service_client('pgtap-pm-task-company','foreign'),false,'rejected moves do not grant service access');
select is(pg_temp.pm_task('insert','foreign-insert','{"clientId":"foreign","clientName":"Foreign"}')->>'ok','false','cannot create standalone work for a foreign company');
select is(pg_temp.pm_task('insert','forged-id','{"clientId":"foreign","clientName":"Own"}')->>'ok','false','owned name cannot conceal a foreign company ID');
select is(pg_temp.pm_task('update','mismatch','{"clientId":"foreign"}')->>'ok','false','cannot substitute a foreign ID on existing work');
select is(pg_temp.pm_task('update','move','{"clientId":"second","clientName":"Second"}')->>'ok','true','moving ordinary work between accessible companies remains available');
select is(pg_temp.pm_task('update','legacy','{"priority":"High"}')->>'ok','true','routine edits preserve existing legacy links');
select is(pg_temp.pm_task('insert','own-insert','{}')->>'ok','true','owned standalone task creation remains available');
select is(pg_temp.pm_task('update','assigned','{"assignedTo":"pm-two"}')->>'ok','true','directly assigned PM can delegate without company ownership');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-task-company' and entity_id='assigned'),0,'delegation does not grant permanent task visibility');
reset role;
-- A PM whose Create tasks permission is revoked must be denied by the server too.
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set permissions='{"createTasks":false}' where workspace_id='pgtap-pm-task-company' and id='pm-one';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008201',true);
set local role authenticated;
select is(pg_temp.pm_task('insert','revoked-insert','{}')->>'ok','false','revoked Create tasks capability blocks PM inserts');
select is(pg_temp.pm_task('update','revoked-create','{"priority":"High"}')->>'ok','true','revoking creation does not block routine existing task edits');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-task-company' and entity_id in('foreign-insert','forged-id','revoked-insert')),0,'rejected inserts leave no task records');
select is((select data->>'clientId' from public.aitask_entities where workspace_id='pgtap-pm-task-company' and entity_id='rpc-attack'),'own','rejected RPC move preserves company identity');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008203',true);
set local role authenticated;
select is(pg_temp.pm_task('update','rpc-attack','{"clientId":"foreign","clientName":"Foreign"}')->>'ok','true','Boss retains cross-company task control');
reset role;
select * from finish();
rollback;
