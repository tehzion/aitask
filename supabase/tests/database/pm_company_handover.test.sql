begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008301','authenticated','authenticated','handover-owner@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008302','authenticated','authenticated','handover-next@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008303','authenticated','authenticated','handover-hod@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000008304','authenticated','authenticated','handover-boss@aitask.local','',now(),'{}','{}',now(),now());

insert into public.aitask_workspaces(id,name) values('pgtap-company-handover','PM company handover');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions,is_super_admin) values
  ('handover-owner','pgtap-company-handover','00000000-0000-0000-0000-000000008301','Owner PM','handover-owner@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('handover-next','pgtap-company-handover','00000000-0000-0000-0000-000000008302','Next PM','handover-next@aitask.local','Project Manager','Management','{Management}','{}',false),
  ('handover-hod','pgtap-company-handover','00000000-0000-0000-0000-000000008303','Design HOD','handover-hod@aitask.local','HOD','Designer','{Designer}','{}',false),
  ('handover-boss','pgtap-company-handover','00000000-0000-0000-0000-000000008304','Boss','handover-boss@aitask.local','Project Manager','Management','{Management}','{}',true);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-company-handover','client','handover-co',
   '{"id":"handover-co","clientName":"Handover Co","createdBy":"handover-owner","createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z"}');

-- Sends the app's company save as the given member, changing only the owner.
create function pg_temp.set_owner(p_auth text, p_owner text) returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_auth, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  v_result := public.aitask_execute_command('pgtap-company-handover', gen_random_uuid(), 'client.upsert',
    jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','client','entityId','handover-co',
      'expectedVersion', (select version from public.aitask_entities where workspace_id='pgtap-company-handover' and entity_type='client' and entity_id='handover-co'),
      'data', (select data from public.aitask_entities where workspace_id='pgtap-company-handover' and entity_type='client' and entity_id='handover-co')
        || jsonb_build_object('createdBy', p_owner))),
    (select version from public.aitask_workspaces where id='pgtap-company-handover'));
  execute 'reset role';
  return v_result;
end;
$$;

create function pg_temp.owner() returns text language sql as $$
  select created_by from public.aitask_entities where workspace_id='pgtap-company-handover' and entity_type='client' and entity_id='handover-co';
$$;

select is(pg_temp.set_owner('00000000-0000-0000-0000-000000008302','handover-next')->>'ok','false',
  'a Project Manager cannot take a company they do not own');
select is(pg_temp.set_owner('00000000-0000-0000-0000-000000008301','handover-hod')->>'ok','false',
  'the owning Project Manager cannot hand the company to an HOD');
select is(pg_temp.set_owner('00000000-0000-0000-0000-000000008301','handover-boss')->>'ok','false',
  'the owning Project Manager cannot hand the company to Boss Koo');
select is(pg_temp.set_owner('00000000-0000-0000-0000-000000008301','handover-next')->>'ok','true',
  'the owning Project Manager can hand the company to another Project Manager');
select is(pg_temp.owner(),'handover-next','the new Project Manager owns the company');
select is(pg_temp.set_owner('00000000-0000-0000-0000-000000008301','handover-owner')->>'ok','false',
  'the previous owner can no longer change the owner');

select * from finish();
rollback;
