begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008401','authenticated','authenticated','seat-owner@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008402','authenticated','authenticated','seat-next@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008403','authenticated','authenticated','seat-third@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008404','authenticated','authenticated','seat-hod@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values('pgtap-project-seat','Project seat handover');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('seat-owner','pgtap-project-seat','00000000-0000-0000-0000-000000008401','Owner PM','seat-owner@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('seat-next','pgtap-project-seat','00000000-0000-0000-0000-000000008402','Next PM','seat-next@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('seat-third','pgtap-project-seat','00000000-0000-0000-0000-000000008403','Third PM','seat-third@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('seat-hod','pgtap-project-seat','00000000-0000-0000-0000-000000008404','Design HOD','seat-hod@aitask.local','HOD','Designer','{Designer}','{}',false);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-project-seat','client','seat-co',
   '{"id":"seat-co","clientName":"Seat Co","createdBy":"seat-owner","createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z"}'),
  ('pgtap-project-seat','project','seat-project',
   '{"id":"seat-project","clientId":"seat-co","clientName":"Seat Co","projectName":"Seat Project","createdBy":"seat-owner","projectManagerIds":["seat-owner","seat-third"],"services":[],"startDate":"2026-11-01","deadline":"","createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z"}');

create function pg_temp.entity_data(p_type text, p_id text) returns jsonb language sql as $$
  select data from public.aitask_entities where workspace_id='pgtap-project-seat' and entity_type=p_type and entity_id=p_id;
$$;
create function pg_temp.entity_version(p_type text, p_id text) returns bigint language sql as $$
  select version from public.aitask_entities where workspace_id='pgtap-project-seat' and entity_type=p_type and entity_id=p_id;
$$;

-- Sends the app's handover as one command: the company's owner and the project's Project Managers.
create function pg_temp.hand_over(p_auth text, p_owner text, p_pm_ids jsonb) returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  v_result := public.aitask_execute_command('pgtap-project-seat', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(
      jsonb_build_object('kind','entity','action','update','entityType','client','entityId','seat-co',
        'expectedVersion', pg_temp.entity_version('client','seat-co'),
        'data', pg_temp.entity_data('client','seat-co') || jsonb_build_object('createdBy', p_owner)),
      jsonb_build_object('kind','entity','action','update','entityType','project','entityId','seat-project',
        'expectedVersion', pg_temp.entity_version('project','seat-project'),
        'data', pg_temp.entity_data('project','seat-project') || jsonb_build_object('projectManagerIds', p_pm_ids))),
    (select version from public.aitask_workspaces where id='pgtap-project-seat'));
  execute 'reset role';
  return v_result;
end;
$$;

create function pg_temp.pm_ids() returns jsonb language sql as $$ select pg_temp.entity_data('project','seat-project') -> 'projectManagerIds'; $$;

select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008402','seat-next','["seat-next","seat-third"]'::jsonb)->>'ok','false',
  'a Project Manager who does not own the company cannot take its project seat');
select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008401','seat-next','["seat-owner","seat-third","seat-next"]'::jsonb)->>'ok','false',
  'the owner cannot add a Project Manager without leaving the project');
select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008401','seat-next','["seat-next"]'::jsonb)->>'ok','false',
  'the owner cannot remove another Project Manager from the project');
select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008401','seat-next','["seat-hod","seat-third"]'::jsonb)->>'ok','false',
  'the owner cannot hand the project seat to an HOD');
select is(pg_temp.pm_ids(),'["seat-owner","seat-third"]'::jsonb,'rejected handovers change nothing');
select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008401','seat-next','["seat-next","seat-third"]'::jsonb)->>'ok','true',
  'the owning Project Manager hands the company and the project seat to another Project Manager');
select is(pg_temp.entity_data('client','seat-co')->>'createdBy','seat-next','the new Project Manager owns the company');
select is(pg_temp.pm_ids(),'["seat-next","seat-third"]'::jsonb,'the new owner holds the previous owner’s project seat and the others keep theirs');
select is(pg_temp.hand_over('00000000-0000-0000-0000-000000008401','seat-owner','["seat-owner","seat-third"]'::jsonb)->>'ok','false',
  'the previous owner can no longer take the company or project back');

select * from finish();
rollback;
