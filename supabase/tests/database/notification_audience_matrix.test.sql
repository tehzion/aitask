begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','aud-matrix-'||n||'@aitask.local','',now(),'{}','{}',now(),now()
from generate_series(2201,2203) n;

insert into public.aitask_workspaces(id,name) values ('pgtap-aud-matrix','Audience matrix');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,client_name,department,departments,permissions)
values
  ('client-a','pgtap-aud-matrix','00000000-0000-0000-0000-000000002201','Client A','aud-matrix-2201@aitask.local','Client','Co A','Client',array['Client'],'{}'),
  ('client-b','pgtap-aud-matrix','00000000-0000-0000-0000-000000002202','Client B','aud-matrix-2202@aitask.local','Client','Co B','Client',array['Client'],'{}'),
  ('pm-1','pgtap-aud-matrix','00000000-0000-0000-0000-000000002203','PM','aud-matrix-2203@aitask.local','Project Manager',null,'Management',array['Management'],'{}');

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-aud-matrix','task','t-visible','{"id":"t-visible","clientName":"Co A","title":"Visible","visibility":"client-visible","status":"Pending"}'),
  ('pgtap-aud-matrix','task','t-internal','{"id":"t-internal","clientName":"Co A","title":"Internal","visibility":"internal","status":"Pending"}');

create function pg_temp.try_notification(p_id text, p_data jsonb) returns text language plpgsql as $$
begin
  insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
  values ('pgtap-aud-matrix', 'notification', p_id, jsonb_build_object('id', p_id, 'title', 't', 'message', 'm') || p_data);
  return 'ok';
exception when check_violation then return sqlerrm;
end $$;

-- Role audiences: internal roles stay allowed, Client never.
select is(pg_temp.try_notification('n1', '{"targetRole":"Client"}'), 'Notifications cannot target the Client role.', 'Client role audience is rejected');
select is(pg_temp.try_notification('n2', '{"targetRole":"Project Manager"}'), 'ok', 'Project Manager role audience is allowed');
select is(pg_temp.try_notification('n3', '{"targetRole":"HOD"}'), 'ok', 'HOD role audience is allowed');
select is(pg_temp.try_notification('n4', '{"targetRole":"Staff"}'), 'ok', 'Staff role audience is allowed');

-- Exactly one audience.
select is(pg_temp.try_notification('n5', '{}'), 'Notifications require one approved audience.', 'no audience is rejected');
select is(pg_temp.try_notification('n6', '{"targetRole":"Client","targetUserId":"pm-1"}'), 'Notifications require one approved audience.', 'role plus user is rejected');
select is(pg_temp.try_notification('n7', '{"targetUserId":"pm-1","targetClient":"co a","route":{"page":"tasks","entityId":"t-visible"}}'), 'Notifications require one approved audience.', 'user plus client is rejected');

-- Client audience needs a client-visible task for that client.
select is(pg_temp.try_notification('n8', '{"targetClient":"co a"}'), 'Client notifications must reference a task.', 'client audience without a task is rejected');
select is(pg_temp.try_notification('n9', '{"targetClient":"co a","route":{"page":"tasks","entityId":"t-internal"}}'), 'Internal tasks cannot notify clients.', 'client audience on an internal task is rejected');
select is(pg_temp.try_notification('n10', '{"targetClient":"co b","route":{"page":"tasks","entityId":"t-visible"}}'), 'Client notification audience must match the task client.', 'client audience for another client is rejected');
select is(pg_temp.try_notification('n11', '{"targetClient":"co a","route":{"page":"tasks","entityId":"t-visible"}}'), 'ok', 'matching client on a visible task is allowed');
select is(pg_temp.try_notification('n12', '{"targetUserId":"client-a"}'), 'ok', 'direct user audience is allowed');

-- Read isolation as each Client member.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002201',true);
set local role authenticated;
select ok(exists(select 1 from public.aitask_entities where workspace_id='pgtap-aud-matrix' and entity_id='n11'), 'client A reads its own client notification');
select ok(exists(select 1 from public.aitask_entities where workspace_id='pgtap-aud-matrix' and entity_id='n12'), 'client A reads a notification addressed to them');
select ok(not exists(select 1 from public.aitask_entities where workspace_id='pgtap-aud-matrix' and entity_id in ('n2','n3','n4')), 'client A cannot read internal role notifications');
reset role;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002202',true);
set local role authenticated;
select ok(not exists(select 1 from public.aitask_entities where workspace_id='pgtap-aud-matrix' and entity_type='notification'), 'client B sees no notification meant for client A or internal roles');
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-aud-matrix' and entity_id='n12'), 0, 'client B cannot read a notification addressed to client A');
reset role;

select * from finish();
rollback;
