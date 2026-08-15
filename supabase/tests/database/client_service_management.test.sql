begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

select has_column('public','aitask_entities','client_id','service entities project the canonical client id');
select has_column('public','aitask_entities','plan_id','service entities project the plan id');
select has_column('public','aitask_entities','cycle_id','service entities project the cycle id');
select has_column('public','aitask_entities','period_start','cycles project their period start');
select has_column('public','aitask_entities','next_cycle_start','active plans project their next due cycle date');
select has_function('public','aitask_execute_service_command',array['text','uuid','text','jsonb'],'service mutations use a dedicated transactional RPC');
select has_function('private','aitask_generate_due_service_cycles',array['text','date'],'monthly cycles use an idempotent generator');
select has_function('private','aitask_can_access_service_client',array['text','text'],'service scope has a reusable RLS helper');
select ok(has_function_privilege('authenticated','public.aitask_execute_service_command(text,uuid,text,jsonb)','EXECUTE'),'authenticated members can reach the guarded service RPC');
select ok(not has_function_privilege('anon','public.aitask_execute_service_command(text,uuid,text,jsonb)','EXECUTE'),'anonymous users cannot execute service commands');
select ok(not has_function_privilege('authenticated','private.aitask_generate_due_service_cycles(text,date)','EXECUTE'),'browser sessions cannot invoke the cron generator');
select is((select public from storage.buckets where id='client-service-files'),false,'client service files use a private bucket');
select is((select file_size_limit from storage.buckets where id='client-service-files'),104857600::bigint,'service files are limited to 100 MB');
select has_column('public','aitask_members','worker_type','members distinguish employees, suppliers and freelancers');
select has_function('public','aitask_generate_deliverable_task_chain',array['text','uuid','jsonb'],'task-chain generation has an intent-specific RPC');
select has_function('public','aitask_set_service_cycle_status',array['text','uuid','text','bigint','text'],'cycle status updates have an intent-specific RPC');
select has_function('public','aitask_set_deliverable_status',array['text','uuid','text','bigint','text'],'deliverable status updates have an intent-specific RPC');
select has_function('private','aitask_generate_all_due_service_cycles',array['date'],'cron traverses every workspace without a hard-coded id');
select has_trigger('public','aitask_entities','aitask_refresh_service_progress','task progress refreshes deliverables');
select has_trigger('public','aitask_entities','aitask_refresh_cycle_completion','delivered slots refresh cycle completion');
select has_index('public','aitask_entities','aitask_service_cycle_period_uidx','one cycle is allowed per client and period');
select ok(position('service_pricing_snapshot' in pg_get_constraintdef((select oid from pg_constraint where conname='aitask_entities_entity_type_check'))) > 0,'pricing snapshots are a protected entity type');
select ok(not exists(select 1 from cron.job where jobname='aitask-service-cycles-daily' and command like '%aitask-main%'),'scheduled cycle generation does not hard-code a workspace');
select has_function('private','aitask_can_read_service_file',array['text','text','text','text'],'Storage reads validate workspace, client, cycle and visible metadata');
select ok(not has_function_privilege('anon','public.aitask_generate_deliverable_task_chain(text,uuid,jsonb)','EXECUTE'),'anonymous users cannot generate workflow tasks');

select * from finish();
rollback;
