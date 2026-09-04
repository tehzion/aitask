-- Read-only verification after the pending production migrations are committed.

select jsonb_build_object(
  'tasks', count(*) filter (where entity_type = 'task'),
  'projects', count(*) filter (where entity_type = 'project'),
  'clients', count(*) filter (where entity_type = 'client'),
  'notifications', count(*) filter (where entity_type = 'notification'),
  'registrations', count(*) filter (where entity_type = 'registration'),
  'workStillMissingClientId', count(*) filter (
    where entity_type in ('task', 'project') and coalesce(data ->> 'clientId', '') = ''
  ),
  'taskProjectBusinessHash', md5(coalesce(string_agg(
    entity_id || ':' || (data - 'clientId' - 'updatedAt')::text,
    '|' order by entity_type, entity_id
  ) filter (where entity_type in ('task', 'project')), ''))
) as rollout_result
from public.aitask_entities;

select
  procedure.proname,
  pg_get_function_identity_arguments(procedure.oid) as arguments,
  procedure.prosecdef as security_definer,
  procedure.proconfig @> array['search_path=""'] as fixed_empty_search_path,
  has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', procedure.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', procedure.oid, 'EXECUTE') as service_execute
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname in (
    'aitask_execute_command',
    'aitask_execute_service_command',
    'aitask_generate_deliverable_task_chain',
    'aitask_get_backend_capabilities'
  )
order by procedure.proname, arguments;

select jsonb_build_object(
  'privateBucket', not bucket.public,
  'fileSizeLimit', bucket.file_size_limit,
  'storagePolicies', (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('service files read', 'service files insert', 'service files update', 'service files delete')
  ),
  'cronJobs', (
    select count(*) from cron.job where jobname = 'aitask-service-cycles-daily'
  ),
  'cronHardCodesWorkspace', exists (
    select 1 from cron.job
    where jobname = 'aitask-service-cycles-daily' and command like '%aitask-main%'
  )
) as service_infrastructure
from storage.buckets bucket
where bucket.id = 'client-service-files';
