begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Reconstruct the immediately preceding read predicate from the current one,
-- removing only this migration's publication check, so every role is compared.
do $$
declare d text; anchor text := ' and private.aitask_comment_file_approved(comment.workspace_id,comment.entity_id,p_object_name)';
begin
  d := pg_get_functiondef('private.aitask_can_read_service_file(text,text,text,text)'::regprocedure);
  if (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 then raise exception 'Expected publication predicate once'; end if;
  d := replace(d,anchor,'');
  d := replace(d,'FUNCTION private.aitask_can_read_service_file(','FUNCTION pg_temp.aitask_before_service_file(');
  execute d;
end $$;
set local session_replication_role = replica;
insert into public.aitask_workspaces(id,name) values('security-file-equivalence','File equivalence');
create temporary table roles(id text, role text, super_admin boolean, client_name text, uid uuid);
insert into roles values
  ('boss','Project Manager',true,null,'10000000-0000-4000-9000-000000000001'),
  ('pm','Project Manager',false,null,'10000000-0000-4000-9000-000000000002'),
  ('hod','HOD',false,null,'10000000-0000-4000-9000-000000000003'),
  ('staff','Staff',false,null,'10000000-0000-4000-9000-000000000004'),
  ('client','Client',false,'Equivalence Client','10000000-0000-4000-9000-000000000005'),
  ('outsider','Staff',false,null,'10000000-0000-4000-9000-000000000006');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
select uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id||'@equivalence.invalid','x',now(),now() from roles;
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,client_name,is_super_admin,permissions)
select id,'security-file-equivalence',uid,id,id||'@equivalence.invalid',role,case when role='Client' then 'Client' else 'Designer' end,
  case when role='Client' then array['Client'] else array['Designer'] end,client_name,super_admin,
  case when id='outsider' then '{}'::jsonb else '{"viewAllServiceClients":true}'::jsonb end from roles;
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('security-file-equivalence','client','client','{"id":"client","clientName":"Equivalence Client","createdBy":"pm"}'),
  ('security-file-equivalence','service_cycle','cycle','{"id":"cycle","clientId":"client","clientName":"Equivalence Client","status":"Published"}'),
  ('security-file-equivalence','cycle_comment','comment','{"id":"comment","clientId":"client","clientName":"Equivalence Client","cycleId":"cycle","userId":"staff","visibility":"client-visible","attachments":[{"bucket":"client-service-files","path":"security-file-equivalence/client/cycle/approved.pdf"},{"bucket":"client-service-files","path":"security-file-equivalence/client/cycle/legacy.pdf"}]}');
update public.aitask_entities set client_key='equivalence client' where workspace_id='security-file-equivalence';
update public.aitask_entities set client_id='client',cycle_id='cycle' where workspace_id='security-file-equivalence' and entity_type in ('service_cycle','cycle_comment');
insert into storage.objects(bucket_id,name,owner_id) values
  ('client-service-files','security-file-equivalence/client/cycle/approved.pdf','10000000-0000-4000-9000-000000000004'),
  ('client-service-files','security-file-equivalence/client/cycle/legacy.pdf','10000000-0000-4000-9000-000000000004');
insert into private.aitask_comment_file_publications(workspace_id,comment_id,object_name,object_owner,approved_by)
values('security-file-equivalence','comment','security-file-equivalence/client/cycle/approved.pdf','10000000-0000-4000-9000-000000000004','staff');
set local session_replication_role = origin;
create temporary table comparison(role_id text, object_name text, old_read boolean, new_read boolean);
do $$
declare r record; p text;
begin
  for r in select * from roles loop
    perform set_config('request.jwt.claims',json_build_object('sub',r.uid,'role','authenticated')::text,true);
    perform set_config('request.jwt.claim.sub',r.uid::text,true);
    foreach p in array array['security-file-equivalence/client/cycle/approved.pdf','security-file-equivalence/client/cycle/legacy.pdf'] loop
      insert into comparison values(r.id,p,pg_temp.aitask_before_service_file('security-file-equivalence','client','cycle',p),private.aitask_can_read_service_file('security-file-equivalence','client','cycle',p));
    end loop;
  end loop;
end $$;
select ok(exists(select 1 from comparison where role_id='client' and object_name like '%legacy.pdf' and old_read and not new_read), 'unreviewed legacy publication is the intended client-visible change');
select is((select count(*)::integer from comparison where old_read is distinct from new_read and not(role_id='client' and object_name like '%legacy.pdf')),0,'all other role and file read decisions remain equivalent');
select ok(exists(select 1 from comparison where role_id='client' and object_name like '%approved.pdf' and old_read and new_read),'approved client file remains readable');
select * from finish();
rollback;
