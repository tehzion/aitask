begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
select has_function('public', 'aitask_reconcile_service_upload', array['text','uuid','text','boolean'], 'scoped reconciliation RPC exists');
select ok(not has_function_privilege('anon', 'public.aitask_reconcile_service_upload(text,uuid,text,boolean)', 'EXECUTE'), 'anonymous callers cannot reconcile uploads');
select ok(not has_table_privilege('authenticated', 'private.aitask_abandoned_service_files', 'SELECT'), 'tombstones are not exposed to browser roles');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000981','authenticated','authenticated','upload-boss@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000982','authenticated','authenticated','upload-other@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-upload','Upload test');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
('upload-boss','pgtap-upload','00000000-0000-0000-0000-000000000981','Boss','upload-boss@aitask.local','Project Manager','Management',array['Management'],true),
('upload-other','pgtap-upload','00000000-0000-0000-0000-000000000982','Other','upload-other@aitask.local','Project Manager','Management',array['Management'],true);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-upload','client','client-a','{"id":"client-a","clientName":"Upload client","createdBy":"upload-boss","attachments":[{"bucket":"client-service-files","path":"pgtap-upload/client-a/cycle-a/saved.pdf"}]}');
insert into storage.objects(bucket_id,name,owner_id) values
('client-service-files','pgtap-upload/client-a/cycle-a/saved.pdf','00000000-0000-0000-0000-000000000981'),
('client-service-files','pgtap-upload/client-a/cycle-a/pending.pdf','00000000-0000-0000-0000-000000000981');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(public.aitask_reconcile_service_upload('pgtap-upload',null,'pgtap-upload/client-a/cycle-a/saved.pdf',true)->>'status','referenced','saved references cannot be abandoned');
select is(public.aitask_reconcile_service_upload('pgtap-upload','00000000-0000-0000-0000-000000000983','pgtap-upload/client-a/cycle-a/pending.pdf',false)->>'status','unresolved','absent receipts are uncertain, not proof of rejection');
select is(public.aitask_reconcile_service_upload('pgtap-upload','00000000-0000-0000-0000-000000000983','pgtap-upload/client-a/cycle-a/pending.pdf',true)->>'status','abandoned','explicit discard fences off the delayed command');
select is(public.aitask_reconcile_service_upload('pgtap-upload','00000000-0000-0000-0000-000000000983','pgtap-upload/client-a/cycle-a/pending.pdf',true)->>'status','abandoned','discard is idempotent');
select is(public.aitask_execute_service_command('pgtap-upload','00000000-0000-0000-0000-000000000983','client_plan.manage','[{"kind":"entity","action":"insert","entityType":"client_plan","entityId":"late-plan","expectedVersion":0,"data":{}}]'::jsonb,null)->>'code','ABANDONED','late command retries cannot commit after discard');
select ok(not private.aitask_can_delete_abandoned_service_file('pgtap-upload','pgtap-upload/client-a/cycle-a/saved.pdf'),'delete predicate protects referenced storage');
select ok(private.aitask_can_delete_abandoned_service_file('pgtap-upload','pgtap-upload/client-a/cycle-a/pending.pdf'),'owner can delete the fenced unreferenced upload');
reset role;
select throws_ok($$update public.aitask_entities set data = data || '{"attachments":[{"bucket":"client-service-files","path":"pgtap-upload/client-a/cycle-a/pending.pdf"}]}'::jsonb where workspace_id='pgtap-upload' and entity_id='client-a'$$,'23514','An abandoned attachment cannot be referenced. Upload it again.','other commands cannot resurrect abandoned attachment paths');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
set local role authenticated;
select is((public.aitask_reconcile_service_upload('pgtap-upload',null,'pgtap-upload/client-a/cycle-a/pending.pdf',true)->>'ok')::boolean,false,'another account cannot abandon the owner upload');
select is((public.aitask_reconcile_service_upload('other-workspace',null,'pgtap-upload/client-a/cycle-a/pending.pdf',true)->>'ok')::boolean,false,'cross-workspace paths are denied');
select is(public.aitask_reconcile_service_upload('pgtap-upload',null,'pgtap-upload/client-a/cycle-a/missing.pdf',false)->>'status','missing','missing owned-path upload reconciles without deletion');
reset role;
select * from finish();
rollback;
