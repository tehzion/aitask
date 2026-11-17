begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009501','authenticated','authenticated','pm-dup-one@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009502','authenticated','authenticated','pm-dup-two@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009503','authenticated','authenticated','pm-dup-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-pm-dup','PM duplicate scope');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
  ('pm-dup-one','pgtap-pm-dup','00000000-0000-0000-0000-000000009501','PM One','pm-dup-one@aitask.local','Project Manager','Management','{}',false),
  ('pm-dup-two','pgtap-pm-dup','00000000-0000-0000-0000-000000009502','PM Two','pm-dup-two@aitask.local','Project Manager','Management','{}',false),
  ('pm-dup-staff','pgtap-pm-dup','00000000-0000-0000-0000-000000009503','Staff','pm-dup-staff@aitask.local','Staff','Designer','{Designer}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-pm-dup','client','client-a','{"id":"client-a","clientName":"Acme","createdBy":"pm-dup-one"}'),
  ('pgtap-pm-dup','client','client-b','{"id":"client-b","clientName":"Acme","createdBy":"pm-dup-two"}'),
  ('pgtap-pm-dup','client','client-c','{"id":"client-c","clientName":"Acme","createdBy":"pm-dup-two"}'),
  ('pgtap-pm-dup','task','task-own','{"id":"task-own","title":"Own","clientId":"client-a","clientName":"Acme","createdBy":"pm-dup-one","department":"Designer","assignedTo":"pm-dup-staff","status":"Pending"}'),
  ('pgtap-pm-dup','task','task-legacy-own','{"id":"task-legacy-own","title":"Legacy own name","clientName":"Acme","createdBy":"pm-dup-one","department":"Designer","assignedTo":"pm-dup-staff","status":"Pending"}'),
  ('pgtap-pm-dup','task','task-foreign-name','{"id":"task-foreign-name","title":"Foreign duplicate name","clientId":"client-b","clientName":"Acme","createdBy":"pm-dup-two","department":"Designer","assignedTo":"pm-dup-staff","status":"Pending"}'),
  ('pgtap-pm-dup','task','task-assigned-foreign','{"id":"task-assigned-foreign","title":"Transient assignment","clientId":"client-b","clientName":"Acme","createdBy":"pm-dup-two","department":"Designer","assignedTo":"pm-dup-one","status":"Pending"}');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009501',true);
select set_config('request.jwt.claim.role','authenticated',true);

select ok(private.aitask_can_view_task('pgtap-pm-dup','task-own'), 'PM sees work on its own duplicate-named company');
select ok(not private.aitask_can_view_task('pgtap-pm-dup','task-foreign-name'), 'PM cannot view another owner task because the company name is identical');
select ok(not private.aitask_can_edit_task('pgtap-pm-dup','task-foreign-name'), 'PM cannot edit another owner task because the company name is identical');
select ok(private.aitask_can_view_task('pgtap-pm-dup','task-assigned-foreign'), 'a transient assignment still permits viewing');
select ok(not private.aitask_can_delete_task('pgtap-pm-dup','task-assigned-foreign'), 'a transient assignment does not permit deletion');
select ok(private.aitask_can_delete_task('pgtap-pm-dup','task-own'), 'creator/portfolio authority still permits deletion');
select ok(private.aitask_can_edit_client_id('pgtap-pm-dup','client-a'), 'id-first company edit allows the owned duplicate-named record');
select ok(not private.aitask_can_edit_client_id('pgtap-pm-dup','client-c'), 'id-first company edit denies the other duplicate-named record despite a same-name legacy task');
set local role authenticated;
select results_eq(
  $$select entity_id from public.aitask_entities where workspace_id='pgtap-pm-dup' and entity_type='client' order by entity_id$$,
  array['client-a','client-b'],
  'PM reads only exact related company records when display names collide'
);
reset role;
select ok(private.aitask_task_assignment_is_valid(
  'pgtap-pm-dup', 'update',
  jsonb_build_object('assignedTo','','assignedBy','pm-dup-one','createdBy','pm-dup-two','clientId','client-b','clientName','Acme','department','Designer'),
  jsonb_build_object('assignedTo','pm-dup-staff','assignedBy','pm-dup-one','createdBy','pm-dup-two','clientId','client-b','clientName','Acme','department','Designer')
), 'a Project Manager may reassign an unassigned task it previously delegated');

select * from finish();
rollback;
