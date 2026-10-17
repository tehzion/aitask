begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009301','authenticated','authenticated','pm-client-one@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009302','authenticated','authenticated','pm-client-two@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009303','authenticated','authenticated','pm-client-boss@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-pm-client-scope','PM client scope');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('pm-one','pgtap-pm-client-scope','00000000-0000-0000-0000-000000009301','One','pm-client-one@aitask.local','Project Manager','Management','{}',false),
('pm-two','pgtap-pm-client-scope','00000000-0000-0000-0000-000000009302','Two','pm-client-two@aitask.local','Project Manager','Management','{}',false),
('boss','pgtap-pm-client-scope','00000000-0000-0000-0000-000000009303','Boss','pm-client-boss@aitask.local','Project Manager','Management','{}',true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-pm-client-scope','client','own','{"id":"own","clientName":"Own Co","createdBy":"pm-one"}'),
('pgtap-pm-client-scope','client','foreign','{"id":"foreign","clientName":"Foreign Co","createdBy":"pm-two"}'),
('pgtap-pm-client-scope','client','reachable','{"id":"reachable","clientName":"Reachable Co","createdBy":"pm-two"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-pm-client-scope','task','reach-task','{"id":"reach-task","title":"Reach","clientId":"reachable","clientName":"Reachable Co","createdBy":"pm-one","department":"Designer","assignedTo":"","status":"Pending"}');

-- Keep known fixture payloads available when the authenticated caller cannot
-- SELECT a foreign company. Reading hidden app rows must not be a test premise.
create temporary table client_command_fixtures as
select entity_id, version, data from public.aitask_entities
where workspace_id='pgtap-pm-client-scope' and entity_type='client';
grant select on client_command_fixtures to authenticated;

create function pg_temp.client_cmd(p_action text,p_id text,p_data jsonb,p_legacy boolean default false) returns jsonb language plpgsql as $$
declare v_expected bigint; v_data jsonb;
begin
  if p_action = 'insert' then
    v_expected := 0; v_data := p_data;
  else
    select entity.version, entity.data into v_expected, v_data from public.aitask_entities entity
      where entity.workspace_id='pgtap-pm-client-scope' and entity.entity_type='client' and entity.entity_id=p_id;
    if not found then
      select fixture.version, fixture.data into v_expected, v_data
      from pg_temp.client_command_fixtures fixture where fixture.entity_id=p_id;
    end if;
    v_data := coalesce(v_data,'{}'::jsonb) || coalesce(p_data,'{}'::jsonb);
  end if;
  if not p_legacy then
    return public.aitask_execute_service_command(
      'pgtap-pm-client-scope',gen_random_uuid(),'client_plan.manage',
      jsonb_build_array(jsonb_build_object('kind','entity','action',p_action,'entityType','client','entityId',p_id,
        'expectedVersion',v_expected,'data',v_data)),
      (select version from public.aitask_workspaces where id='pgtap-pm-client-scope'));
  end if;
  return public.aitask_execute_service_command(
    'pgtap-pm-client-scope',gen_random_uuid(),'client_plan.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action',p_action,'entityType','client','entityId',p_id,
      'expectedVersion',v_expected,'data',v_data)));
end;
$$;

create function pg_temp.client_cmd_legacy(action text,id text,data jsonb) returns jsonb language sql as $$
  select pg_temp.client_cmd(action,id,data,true);
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009301',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(public.aitask_execute_service_command('pgtap-pm-client-scope',gen_random_uuid(),'client_plan.manage',
  jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','client','entityId','own','expectedVersion',1,'data','{"id":"own","clientName":"Own Co","createdBy":"pm-one"}'::jsonb)),-1)->>'code','CONFLICT','current service RPC enforces the workspace version lock');
select is(pg_temp.client_cmd('update','foreign','{"clientName":"Hijacked"}')->>'ok','false','PM cannot rename a foreign company through the service RPC');
reset role;
select is((select data->>'clientName' from public.aitask_entities where workspace_id='pgtap-pm-client-scope' and entity_id='foreign'),'Foreign Co','rejected rename leaves the foreign company unchanged');
set local role authenticated;
select is(pg_temp.client_cmd('update','foreign','{"createdBy":"pm-one"}')->>'ok','false','PM cannot re-own a foreign company through the service RPC');
select is(pg_temp.client_cmd('delete','foreign','{}')->>'ok','false','PM cannot delete a foreign company through the service RPC');
reset role;
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-client-scope' and entity_id='foreign'),1,'rejected delete leaves the foreign company in place');
set local role authenticated;
select is(pg_temp.client_cmd_legacy('update','foreign','{"clientName":"Hijacked"}')->>'ok','false','legacy service RPC overload is equally scoped');
select is(pg_temp.client_cmd('update','own','{"contactName":"Owner Contact"}')->>'ok','true','PM can still update an owned company');
select is(pg_temp.client_cmd('insert','new-own','{"id":"new-own","clientName":"New Own","createdBy":"pm-one"}')->>'ok','true','PM can still create a company with createClients');
reset role;

-- A task-derived PM may edit a reachable company's routine fields, but not its owner.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009301',true);
set local role authenticated;
select is(pg_temp.client_cmd('update','reachable','{"phone":"123"}')->>'ok','true','PM can edit a company reached through visible work');
select is(pg_temp.client_cmd('update','reachable','{"createdBy":"pm-one"}')->>'ok','false','ownership cannot be seized even through visible work');
select is((select data->>'createdBy' from public.aitask_entities where workspace_id='pgtap-pm-client-scope' and entity_id='reachable'),'pm-two','reachable company keeps its owner');
reset role;

-- Revoked create/delete capabilities are authoritative for Project Managers.
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set permissions='{"createClients":false}' where workspace_id='pgtap-pm-client-scope' and id='pm-one';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009301',true);
set local role authenticated;
select is(pg_temp.client_cmd('insert','revoked-create','{"id":"revoked-create","clientName":"Nope","createdBy":"pm-one"}')->>'ok','false','revoked createClients blocks company creation');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.aitask_members set permissions='{"manageClientPlans":true,"deleteClients":false}' where workspace_id='pgtap-pm-client-scope' and id='pm-one';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009301',true);
set local role authenticated;
select is(pg_temp.client_cmd('delete','own','{}')->>'ok','false','revoked deleteClients blocks company deletion');
reset role;

-- Boss retains full cross-company control.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009303',true);
set local role authenticated;
select is(pg_temp.client_cmd('delete','foreign','{}')->>'ok','true','Boss retains cross-company company control');
reset role;

select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-pm-client-scope' and entity_id in('revoked-create')),0,'rejected inserts leave no company records');
select * from finish();
rollback;
