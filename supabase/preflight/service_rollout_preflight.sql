-- Read-only production preflight for the client-service rollout.
-- Run this before any migration and retain the results with the release record.

select jsonb_build_object(
  'tasks', count(*) filter (where entity_type = 'task'),
  'projects', count(*) filter (where entity_type = 'project'),
  'clients', count(*) filter (where entity_type = 'client'),
  'notifications', count(*) filter (where entity_type = 'notification'),
  'registrations', count(*) filter (where entity_type = 'registration'),
  'serviceEntities', count(*) filter (where entity_type in (
    'service_package', 'client_plan', 'service_cycle', 'deliverable',
    'cycle_comment', 'addon', 'service_workflow_template', 'service_pricing_snapshot'
  )),
  'legacyWorkMissingClientId', count(*) filter (
    where entity_type in ('task', 'project') and coalesce(data ->> 'clientId', '') = ''
  ),
  'legacyWorkMissingClientKey', count(*) filter (
    where entity_type in ('task', 'project')
      and coalesce(data ->> 'clientId', '') = ''
      and coalesce(client_key, '') = ''
  ),
  'taskProjectBusinessHash', md5(coalesce(string_agg(
    entity_id || ':' || (data - 'clientId' - 'updatedAt')::text,
    '|' order by entity_type, entity_id
  ) filter (where entity_type in ('task', 'project')), ''))
) as rollout_baseline
from public.aitask_entities;

with discovered as (
  select
    workspace_id,
    client_key,
    max(nullif(btrim(data ->> 'clientName'), '')) as client_name,
    count(distinct nullif(btrim(data ->> 'clientName'), '')) as distinct_name_count,
    count(*) as work_item_count
  from public.aitask_entities
  where entity_type in ('task', 'project')
    and coalesce(data ->> 'clientId', '') = ''
    and coalesce(client_key, '') <> ''
  group by workspace_id, client_key
), existing as (
  select workspace_id, client_key, min(entity_id) as client_id, count(*) as profile_count
  from public.aitask_entities
  where entity_type = 'client' and coalesce(client_key, '') <> ''
  group by workspace_id, client_key
)
select
  discovered.workspace_id,
  discovered.client_key,
  discovered.client_name,
  discovered.work_item_count,
  discovered.distinct_name_count,
  coalesce(existing.profile_count, 0) as existing_profile_count,
  coalesce(
    existing.client_id,
    'CL-migrated-' || substr(md5(discovered.workspace_id || ':' || discovered.client_key), 1, 24)
  ) as resolved_client_id,
  case when existing.client_id is null then 'create_profile' else 'reuse_profile' end as action,
  discovered.distinct_name_count = 1 and coalesce(existing.profile_count, 0) <= 1 as safe_to_apply
from discovered
left join existing using (workspace_id, client_key)
order by discovered.client_name, discovered.client_key;

with discovered as (
  select
    workspace_id,
    client_key,
    count(distinct nullif(btrim(data ->> 'clientName'), '')) as distinct_name_count
  from public.aitask_entities
  where entity_type in ('task', 'project')
    and coalesce(data ->> 'clientId', '') = ''
    and coalesce(client_key, '') <> ''
  group by workspace_id, client_key
), existing as (
  select workspace_id, client_key, count(*) as profile_count
  from public.aitask_entities
  where entity_type = 'client' and coalesce(client_key, '') <> ''
  group by workspace_id, client_key
)
select jsonb_build_object(
  'discoveredClientGroups', count(*),
  'profilesToCreate', count(*) filter (where existing.client_key is null),
  'profilesToReuse', count(*) filter (where existing.client_key is not null),
  'ambiguousNameGroups', count(*) filter (where discovered.distinct_name_count <> 1),
  'duplicateExistingProfileGroups', count(*) filter (where coalesce(existing.profile_count, 0) > 1),
  'workItemsWithoutClientKey', (
    select count(*)
    from public.aitask_entities work
    where work.entity_type in ('task', 'project')
      and coalesce(work.data ->> 'clientId', '') = ''
      and coalesce(work.client_key, '') = ''
  ),
  'safeToApply', coalesce(bool_and(
    discovered.distinct_name_count = 1 and coalesce(existing.profile_count, 0) <= 1
  ), true) and not exists (
    select 1
    from public.aitask_entities work
    where work.entity_type in ('task', 'project')
      and coalesce(work.data ->> 'clientId', '') = ''
      and coalesce(work.client_key, '') = ''
  )
) as mapping_summary
from discovered
left join existing using (workspace_id, client_key);
