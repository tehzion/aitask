-- Security audit follow-up: a cycle's pricing snapshot is write-once, and once a
-- service cycle is published its price terms and snapshot are frozen. Status transitions, attachments and
-- payment records keep working; only the billing terms are protected.
-- PENDING PRODUCTION APPROVAL: review against any workflow that edits a
-- published cycle's prices before applying.
create or replace function private.aitask_guard_published_cycle_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle jsonb;
  v_frozen text[] := array[
    'serviceItems', 'addonSnapshots', 'discountType', 'discountValue',
    'taxRateBps', 'currency', 'planId', 'planRevision', 'pricingSnapshotId',
    'periodStart', 'periodEnd'
  ];
  v_key text;
begin
  if tg_op = 'UPDATE' and new.entity_type = 'service_cycle' then
    if coalesce(old.data ->> 'publishedAt', '') <> '' then
      foreach v_key in array v_frozen loop
        if new.data -> v_key is distinct from old.data -> v_key then
          raise check_violation using message = 'A published service cycle keeps its frozen price terms.';
        end if;
      end loop;
    end if;
    return new;
  end if;

  if old.entity_type = 'service_pricing_snapshot' and old.data ->> 'parentType' = 'service_cycle' then
    -- A cycle's pricing snapshot is write-once: clients only ever insert it
    -- when the cycle is created, and the payment command reads it as the
    -- charge. No command (including client_plan.manage) may rewrite it.
    if tg_op = 'UPDATE'
      and (new.data - 'updatedAt' - 'version') is distinct from (old.data - 'updatedAt' - 'version') then
      raise check_violation using message = 'A service cycle pricing snapshot cannot be changed after creation.';
    end if;
    if tg_op = 'DELETE' then
      select cycle.data into v_cycle
      from public.aitask_entities cycle
      where cycle.workspace_id = old.workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.entity_id = old.data ->> 'parentId';
      if v_cycle is not null and coalesce(v_cycle ->> 'publishedAt', '') <> '' then
        raise check_violation using message = 'A published service cycle keeps its frozen pricing snapshot.';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.aitask_guard_published_cycle_pricing() from public, anon, authenticated;

drop trigger if exists aitask_guard_published_cycle_pricing on public.aitask_entities;
create trigger aitask_guard_published_cycle_pricing
before update or delete on public.aitask_entities
for each row
when (old.entity_type in ('service_cycle', 'service_pricing_snapshot'))
execute function private.aitask_guard_published_cycle_pricing();
