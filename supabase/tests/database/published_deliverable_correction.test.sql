-- Team feedback S6/F6: a deliverable in a published month can be renamed by
-- the Boss or the client's own PM through deliverable.manage, the change is
-- kept in entity history, and other PMs and Staff are refused.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000c601','authenticated','authenticated','fix-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000c602','authenticated','authenticated','fix-other-pm@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-00000000c603','authenticated','authenticated','fix-staff@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('deliverable-fix','Deliverable correction');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('fix-pm','deliverable-fix','00000000-0000-0000-0000-00000000c601','Fix PM','fix-pm@aitask.local','Project Manager','Management',array['Management'],false),
('fix-other-pm','deliverable-fix','00000000-0000-0000-0000-00000000c602','Other PM','fix-other-pm@aitask.local','Project Manager','Management',array['Management'],false),
('fix-staff','deliverable-fix','00000000-0000-0000-0000-00000000c603','Fix Staff','fix-staff@aitask.local','Staff','Designer',array['Designer'],false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data,client_id) values
('deliverable-fix','client','fix-client','{"id":"fix-client","clientName":"Fix Co","createdBy":"fix-pm"}','fix-client'),
('deliverable-fix','client_plan','fix-plan','{"id":"fix-plan","clientId":"fix-client","clientName":"Fix Co","status":"Active","name":"Fix plan","createdBy":"fix-pm"}','fix-client'),
('deliverable-fix','service_cycle','fix-cycle','{"id":"fix-cycle","clientId":"fix-client","clientName":"Fix Co","planId":"fix-plan","status":"Published"}','fix-client'),
('deliverable-fix','deliverable','fix-deliverable','{"id":"fix-deliverable","clientId":"fix-client","clientName":"Fix Co","cycleId":"fix-cycle","status":"Planned","title":"Social Posts 1","taskIds":[]}','fix-client');

create function pg_temp.rename_as(p_sub text, p_title text) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',p_sub,true);
  set local role authenticated;
  select public.aitask_execute_service_command('deliverable-fix', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','deliverable','entityId','fix-deliverable',
      'expectedVersion',(select version from public.aitask_entities where workspace_id='deliverable-fix' and entity_type='deliverable' and entity_id='fix-deliverable'),
      'data',(select data from public.aitask_entities where workspace_id='deliverable-fix' and entity_type='deliverable' and entity_id='fix-deliverable') || jsonb_build_object('title',p_title))), null)
    into result;
  reset role;
  return result;
end $$;

select isnt((pg_temp.rename_as('00000000-0000-0000-0000-00000000c602','Forged')->>'ok')::boolean, true, 'another PM cannot rename this client''s published deliverable');
select isnt((pg_temp.rename_as('00000000-0000-0000-0000-00000000c603','Forged')->>'ok')::boolean, true, 'Staff cannot rename a published deliverable');
select is((select data->>'title' from public.aitask_entities where workspace_id='deliverable-fix' and entity_id='fix-deliverable'), 'Social Posts 1', 'refused renames leave the name unchanged');
select is((pg_temp.rename_as('00000000-0000-0000-0000-00000000c601','Instagram Posts 1')->>'ok')::boolean, true, 'the client''s PM can rename a published deliverable');
select is((select data->>'title' from public.aitask_entities where workspace_id='deliverable-fix' and entity_id='fix-deliverable'), 'Instagram Posts 1', 'the new name is saved');
select ok(exists(select 1 from public.aitask_entity_history where workspace_id='deliverable-fix' and entity_type='deliverable' and entity_id='fix-deliverable'), 'the rename is kept in entity history');

select * from finish();
rollback;
