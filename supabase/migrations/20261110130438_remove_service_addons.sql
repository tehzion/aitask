-- Remove service add-ons (owner decision, 10 Nov 2026).
--
-- The app no longer creates, shows or bills add-ons. This migration:
--   1. copies every affected row into a private backup table,
--   2. deletes add-on rows and their pricing snapshots,
--   3. clears the add-on lines copied onto service cycles,
--   4. stops the database accepting new add-on rows.
--
-- Cycle pricing snapshots are not touched: their totals were always the plan
-- items only, so no recorded monthly total changes.
--
-- Server functions that still name 'addon' (command guards, cycle generation,
-- client cascade) become no-ops for it once no such row can exist.

create table if not exists private.addon_removal_backup_20261110 (
  id bigint generated always as identity primary key,
  backed_up_at timestamptz not null default now(),
  reason text not null check (reason in ('addon', 'addon_pricing_snapshot', 'service_cycle_before_clear')),
  entity_row jsonb not null
);

alter table private.addon_removal_backup_20261110 enable row level security;
revoke all on table private.addon_removal_backup_20261110 from public, anon, authenticated;

insert into private.addon_removal_backup_20261110 (reason, entity_row)
select 'addon', to_jsonb(entity)
from public.aitask_entities entity
where entity.entity_type = 'addon';

insert into private.addon_removal_backup_20261110 (reason, entity_row)
select 'addon_pricing_snapshot', to_jsonb(entity)
from public.aitask_entities entity
where entity.entity_type = 'service_pricing_snapshot'
  and entity.data->>'parentType' = 'addon';

insert into private.addon_removal_backup_20261110 (reason, entity_row)
select 'service_cycle_before_clear', to_jsonb(entity)
from public.aitask_entities entity
where entity.entity_type = 'service_cycle'
  and jsonb_typeof(entity.data->'addonSnapshots') = 'array'
  and jsonb_array_length(entity.data->'addonSnapshots') > 0;

delete from public.aitask_entities
where entity_type = 'service_pricing_snapshot'
  and data->>'parentType' = 'addon';

delete from public.aitask_entities
where entity_type = 'addon';

update public.aitask_entities
set data = jsonb_set(data, '{addonSnapshots}', '[]'::jsonb),
    updated_at = now()
where entity_type = 'service_cycle'
  and jsonb_typeof(data->'addonSnapshots') = 'array'
  and jsonb_array_length(data->'addonSnapshots') > 0;

alter table public.aitask_entities drop constraint if exists aitask_entities_entity_type_check;
alter table public.aitask_entities add constraint aitask_entities_entity_type_check check (
  entity_type = 'service_cycle_payment'
  or entity_type = any (array[
    'client', 'project', 'task', 'comment', 'approval', 'notification', 'registration',
    'custom_role', 'task_status', 'service_package', 'client_plan', 'service_cycle',
    'deliverable', 'cycle_comment', 'service_workflow_template', 'service_pricing_snapshot'
  ])
);
