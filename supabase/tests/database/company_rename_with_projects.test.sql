begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008701','authenticated','authenticated','rename-pm@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008702','authenticated','authenticated','rename-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-rename','Company rename');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('rename-pm','pgtap-rename','00000000-0000-0000-0000-000000008701','PM','rename-pm@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('rename-staff','pgtap-rename','00000000-0000-0000-0000-000000008702','Staff','rename-staff@aitask.local','Staff','Designer','{Designer}','{}',false);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-rename','client','rn-co','{"id":"rn-co","clientName":"Old Name","createdBy":"rename-pm","createdAt":"2026-10-01"}'),
  ('pgtap-rename','project','rn-proj','{"id":"rn-proj","clientId":"rn-co","clientName":"Old Name","projectName":"Retainer","createdBy":"rename-pm","projectManagerIds":["rename-pm"],"staffMemberIds":["rename-staff"],"services":["Design"],"milestones":[],"status":"Active","startDate":"2026-10-01"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data) values
  ('pgtap-rename','task','rn-task','rn-proj','{"id":"rn-task","clientId":"rn-co","clientName":"Old Name","projectId":"rn-proj","projectName":"Retainer","title":"Post","description":"","serviceType":"Design","department":"Designer","assignedTo":"rename-staff","assignedBy":"rename-pm","createdBy":"rename-pm","startDate":"2026-10-01","dueDate":"2026-10-30","status":"Pending","priority":"Medium","completionPercentage":20,"isCompleted":false,"revisionCount":0,"clientApprovalStatus":"Pending","isRecurring":false,"recurrenceFrequency":"None","visibility":"internal"}');

create function pg_temp.rename_as(p_auth uuid, p_name text) returns jsonb language plpgsql as $$
declare v jsonb; v_ops jsonb;
begin
  select jsonb_agg(jsonb_build_object('kind','entity','action','update','entityType',entity_type,'entityId',entity_id,
      'parentId',parent_id,'expectedVersion',version,'data',data || jsonb_build_object('clientName',p_name))
      order by case entity_type when 'client' then 0 when 'project' then 1 else 2 end)
    into v_ops from public.aitask_entities where workspace_id='pgtap-rename';
  perform set_config('request.jwt.claim.sub',p_auth::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  v := public.aitask_execute_command('pgtap-rename', gen_random_uuid(), 'workspace.patch', v_ops,
    (select version from public.aitask_workspaces where id='pgtap-rename'));
  execute 'reset role';
  return v;
end;
$$;

-- What the app sends: the company, its project and its task in one command.
select is(pg_temp.rename_as('00000000-0000-0000-0000-000000008702','Staff Name')->>'ok', 'false',
  'Staff cannot rename the company');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-rename' and data->>'clientName'='Old Name'), 3,
  'a rejected rename writes nothing');
select is(pg_temp.rename_as('00000000-0000-0000-0000-000000008701','New Name')->>'ok', 'true',
  'the owning Project Manager can rename a company that has projects and tasks');
select is((select count(*)::int from public.aitask_entities where workspace_id='pgtap-rename' and data->>'clientName'='New Name'), 3,
  'the company, project and task carry the new name');
-- The alias needs the company rename in the same command: a project alone
-- still cannot move to a name no company has.
select is((select r->>'ok' from (select public.aitask_execute_command('pgtap-rename', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','project','entityId','rn-proj',
      'expectedVersion',(select version from public.aitask_entities where entity_id='rn-proj'),
      'data',(select data from public.aitask_entities where entity_id='rn-proj') || '{"clientName":"Other Name"}')),
    (select version from public.aitask_workspaces where id='pgtap-rename')) r
  from (select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000008701',true)) s) q), 'false',
  'a project cannot take a new company name without the company rename');

select * from finish();
rollback;
