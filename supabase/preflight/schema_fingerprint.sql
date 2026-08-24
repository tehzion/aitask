-- Stable application-owned schema fingerprint used before metadata-only
-- migration-history repair. Run against production and a local database reset
-- to the pre-service baseline; every category must match before repair.

with objects as (
  select 'relations' category, namespace.nspname || '.' || relation.relname object_key,
    concat(relation.relkind, ':rls=', relation.relrowsecurity, ':force=', relation.relforcerowsecurity) definition
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname like 'aitask_%'
    and relation.relkind in ('r', 'p', 'v', 'm')

  union all

  select 'columns', namespace.nspname || '.' || relation.relname || '.' || attribute.attname,
    format(
      '%s:notnull=%s:default=%s',
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      attribute.attnotnull,
      coalesce(pg_get_expr(default_value.adbin, default_value.adrelid), '')
    )
  from pg_attribute attribute
  join pg_class relation on relation.oid = attribute.attrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  left join pg_attrdef default_value
    on default_value.adrelid = attribute.attrelid
    and default_value.adnum = attribute.attnum
  where namespace.nspname = 'public'
    and relation.relname like 'aitask_%'
    and relation.relkind in ('r', 'p', 'v', 'm')
    and attribute.attnum > 0
    and not attribute.attisdropped

  union all

  select 'constraints', namespace.nspname || '.' || relation.relname || '.' || constraint_row.conname,
    regexp_replace(pg_get_constraintdef(constraint_row.oid, true), '\s+', ' ', 'g')
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname like 'aitask_%'

  union all

  select 'indexes', namespace.nspname || '.' || relation.relname || '.' || index_relation.relname,
    regexp_replace(pg_get_indexdef(index_relation.oid), '\s+', ' ', 'g')
  from pg_index index_row
  join pg_class relation on relation.oid = index_row.indrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_class index_relation on index_relation.oid = index_row.indexrelid
  where namespace.nspname = 'public'
    and relation.relname like 'aitask_%'

  union all

  select 'policies', policy.schemaname || '.' || policy.tablename || '.' || policy.policyname,
    concat(
      policy.cmd, ':', policy.permissive, ':', policy.roles::text, ':',
      coalesce(regexp_replace(policy.qual, '\s+', ' ', 'g'), ''), ':',
      coalesce(regexp_replace(policy.with_check, '\s+', ' ', 'g'), '')
    )
  from pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename like 'aitask_%'

  union all

  select 'triggers', namespace.nspname || '.' || relation.relname || '.' || trigger_row.tgname,
    regexp_replace(pg_get_triggerdef(trigger_row.oid, true), '\s+', ' ', 'g')
  from pg_trigger trigger_row
  join pg_class relation on relation.oid = trigger_row.tgrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname like 'aitask_%'
    and not trigger_row.tgisinternal

  union all

  select 'functions',
    namespace.nspname || '.' || procedure.proname || '(' || pg_get_function_identity_arguments(procedure.oid) || ')',
    regexp_replace(pg_get_functiondef(procedure.oid), '\s+', ' ', 'g')
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname in ('public', 'private')
    and procedure.proname like 'aitask_%'

  union all

  select 'function_grants',
    namespace.nspname || '.' || procedure.proname || '(' || pg_get_function_identity_arguments(procedure.oid) || ').'
      || pg_get_userbyid(grant_row.grantee) || '.' || grant_row.privilege_type,
    'granted'
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  cross join lateral aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) grant_row
  where namespace.nspname in ('public', 'private')
    and procedure.proname like 'aitask_%'

  union all

  select 'relation_grants',
    privilege.table_schema || '.' || privilege.table_name || '.' || privilege.grantee || '.' || privilege.privilege_type,
    'granted'
  from information_schema.table_privileges privilege
  where privilege.table_schema = 'public'
    and privilege.table_name like 'aitask_%'
)
select
  category,
  count(*) as object_count,
  md5(string_agg(object_key || '=' || definition, E'\n' order by object_key)) as fingerprint
from objects
group by category
order by category;
