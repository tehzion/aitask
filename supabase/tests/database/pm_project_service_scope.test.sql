begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008201','authenticated','authenticated','pm-project-scope@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008202','authenticated','authenticated','pm-project-other@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008203','authenticated','authenticated','pm-project-boss@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values('pgtap-pm-project-scope','PM project service scope');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('pm-project-one','pgtap-pm-project-scope','00000000-0000-0000-0000-000000008201','PM One','pm-project-scope@aitask.local','Project Manager','Management','{}','{}',false),
  ('pm-project-other','pgtap-pm-project-scope','00000000-0000-0000-0000-000000008202','PM Other','pm-project-other@aitask.local','Project Manager','Management','{}','{}',false),
  ('pm-project-boss','pgtap-pm-project-scope','00000000-0000-0000-0000-000000008203','Boss','pm-project-boss@aitask.local','Project Manager','Management','{}','{}',true);

-- The project company is owned by Boss and has NO tasks; the only thing linking
-- PM One to it is a project they created.
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-pm-project-scope','client','project-co','{"id":"project-co","clientName":"Project Co","createdBy":"pm-project-boss"}'),
  ('pgtap-pm-project-scope','client','foreign-co','{"id":"foreign-co","clientName":"Foreign Co","createdBy":"pm-project-other"}'),
  ('pgtap-pm-project-scope','project','project-co-project','{"id":"project-co-project","clientId":"project-co","clientName":"Project Co","projectName":"Launch","createdBy":"pm-project-one"}'),
  ('pgtap-pm-project-scope','project','foreign-co-project','{"id":"foreign-co-project","clientId":"foreign-co","clientName":"Foreign Co","projectName":"Foreign","createdBy":"pm-project-other"}');

create function pg_temp.pm_plan(p_client text, p_plan text) returns jsonb language sql as $$
  select public.aitask_execute_service_command('pgtap-pm-project-scope',gen_random_uuid(),'client_plan.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','client_plan','entityId',p_plan,'expectedVersion',0,
      'data',jsonb_build_object('id',p_plan,'clientId',p_client,'clientName',case when p_client='project-co' then 'Project Co' else 'Foreign Co' end,'name','Plan','status','Draft'))),null);
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008201',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is(pg_temp.pm_plan('project-co','project-co-plan')->>'ok','true',
  'a PM-created project grants service access to a company owned by Boss with no tasks');
select is(pg_temp.pm_plan('foreign-co','foreign-co-plan')->>'ok','false',
  'a company with no ownership, task, or project link stays out of scope');

reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-project-scope' and entity_id='foreign-co-plan'),0,
  'the rejected foreign plan leaves no record');

select * from finish();
rollback;
