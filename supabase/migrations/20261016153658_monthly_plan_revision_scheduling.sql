-- Client plan revision scheduling is stored in the existing client_plan JSONB
-- payload. Backfill revisions created before revisionScheduleStatus existed so
-- their already-selected effective boundary keeps its prior scheduled meaning.
update public.aitask_entities
set data = jsonb_set(data, '{revisionScheduleStatus}', '"scheduled"'::jsonb, true)
where entity_type = 'client_plan'
  and data ->> 'status' = 'Draft'
  and coalesce(data ->> 'supersedesPlanId', '') <> ''
  and coalesce(data ->> 'effectiveFromCycleStart', '') ~ '^\d{4}-\d{2}-\d{2}$'
  and not (data ? 'revisionScheduleStatus');

-- Keep the database rollover path aligned with generateDueLocalServiceCycles:
-- creating a draft revision does not schedule it. Only an explicit scheduling
-- action may replace the active plan at a monthly boundary.
create or replace function private.aitask_generate_due_service_cycles(
  p_workspace_id text,
  p_today date default ((now() at time zone 'Asia/Kuala_Lumpur')::date)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.aitask_entities%rowtype;
  v_revision public.aitask_entities%rowtype;
  v_start date;
  v_next date;
  v_end date;
  v_cycle_id text;
  v_deliverable_id text;
  v_price_id text;
  v_cycle_data jsonb;
  v_item jsonb;
  v_count integer := 0;
  v_command_id uuid := gen_random_uuid();
begin
  for v_plan in
    select *
    from public.aitask_entities
    where workspace_id = p_workspace_id
      and entity_type = 'client_plan'
      and data ->> 'status' = 'Active'
      and coalesce(nullif(data ->> 'nextCycleStart', '')::date, nullif(data ->> 'startDate', '')::date) <= p_today
    order by entity_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':service-client:' || v_plan.client_id, 0));
    select *
    into v_plan
    from public.aitask_entities
    where workspace_id = p_workspace_id
      and entity_type = 'client_plan'
      and entity_id = v_plan.entity_id
      and data ->> 'status' = 'Active'
    for update;
    if not found then
      continue;
    end if;

    v_start := coalesce(nullif(v_plan.data ->> 'nextCycleStart', '')::date, nullif(v_plan.data ->> 'startDate', '')::date);
    while v_start <= p_today loop
      select *
      into v_revision
      from public.aitask_entities
      where workspace_id = p_workspace_id
        and entity_type = 'client_plan'
        and data ->> 'status' = 'Draft'
        and data ->> 'revisionScheduleStatus' = 'scheduled'
        and data ->> 'supersedesPlanId' = v_plan.entity_id
        and nullif(data ->> 'effectiveFromCycleStart', '')::date <= v_start
      order by coalesce((data ->> 'revision')::integer, 1) desc
      limit 1
      for update;

      if found then
        update public.aitask_entities
        set data = jsonb_set(jsonb_set(data, '{status}', '"Ended"'::jsonb), '{updatedAt}', to_jsonb(now()::text))
        where workspace_id = p_workspace_id
          and entity_type = 'client_plan'
          and entity_id = v_plan.entity_id;

        update public.aitask_entities
        set data = jsonb_set(
          jsonb_set(
            jsonb_set(data, '{status}', '"Active"'::jsonb),
            '{nextCycleStart}', to_jsonb(v_start::text)
          ),
          '{updatedAt}', to_jsonb(now()::text)
        )
        where workspace_id = p_workspace_id
          and entity_type = 'client_plan'
          and entity_id = v_revision.entity_id;

        select *
        into v_plan
        from public.aitask_entities
        where workspace_id = p_workspace_id
          and entity_type = 'client_plan'
          and entity_id = v_revision.entity_id;
      end if;

      v_next := private.aitask_next_billing_date(v_start, coalesce((v_plan.data ->> 'billingDay')::integer, 1));
      v_end := v_next - 1;
      v_cycle_id := 'CY-' || replace(gen_random_uuid()::text, '-', '');
      v_price_id := 'PRICE-' || replace(gen_random_uuid()::text, '-', '');
      v_cycle_data := jsonb_build_object(
        'id', v_cycle_id,
        'clientId', v_plan.client_id,
        'clientName', v_plan.data ->> 'clientName',
        'planId', v_plan.entity_id,
        'planRevision', coalesce((v_plan.data ->> 'revision')::integer, 1),
        'periodStart', v_start,
        'periodEnd', v_end,
        'status', 'Draft',
        'currency', 'MYR',
        'pricingSnapshotId', v_price_id,
        'serviceItems', coalesce(v_plan.data -> 'serviceItems', '[]'::jsonb),
        'addonSnapshots', (
          select coalesce(jsonb_agg(addon.data order by addon.entity_id), '[]'::jsonb)
          from public.aitask_entities addon
          where addon.workspace_id = p_workspace_id
            and addon.entity_type = 'addon'
            and addon.client_id = v_plan.client_id
            and addon.data ->> 'billingMode' = 'monthly'
            and coalesce((addon.data ->> 'isActive')::boolean, false)
            and (addon.data ->> 'effectiveFrom')::date <= v_start
            and (
              coalesce(addon.data ->> 'effectiveUntil', '') = ''
              or (addon.data ->> 'effectiveUntil')::date >= v_start
            )
        ),
        'discountType', 'none',
        'discountValue', 0,
        'taxRateBps', 0,
        'createdAt', now(),
        'updatedAt', now()
      );

      insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
      values (p_workspace_id, 'service_cycle', v_cycle_id, v_plan.entity_id, v_cycle_data)
      on conflict do nothing;

      if found then
        insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
        select p_workspace_id, 'service_pricing_snapshot', v_price_id, v_cycle_id,
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(price.data, '{id}', to_jsonb(v_price_id)),
                  '{parentType}', '"service_cycle"'::jsonb
                ),
                '{parentId}', to_jsonb(v_cycle_id)
              ),
              '{createdAt}', to_jsonb(now()::text)
            ),
            '{updatedAt}', to_jsonb(now()::text)
          )
        from public.aitask_entities price
        where price.workspace_id = p_workspace_id
          and price.entity_type = 'service_pricing_snapshot'
          and price.data ->> 'parentId' = v_plan.entity_id
        limit 1;

        for v_item in
          select value from jsonb_array_elements(coalesce(v_plan.data -> 'serviceItems', '[]'::jsonb))
        loop
          for v_slot in 1..greatest(0, least(500, coalesce((v_item ->> 'quantity')::integer, 0))) loop
            v_deliverable_id := 'DL-' || replace(gen_random_uuid()::text, '-', '');
            insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
            values (
              p_workspace_id,
              'deliverable',
              v_deliverable_id,
              v_cycle_id,
              jsonb_build_object(
                'id', v_deliverable_id,
                'clientId', v_plan.client_id,
                'clientName', v_plan.data ->> 'clientName',
                'planId', v_plan.entity_id,
                'cycleId', v_cycle_id,
                'serviceItemId', v_item ->> 'id',
                'sequence', v_slot,
                'title', (v_item ->> 'name') || ' ' || v_slot,
                'status', 'Planned',
                'taskIds', '[]'::jsonb,
                'attachments', '[]'::jsonb,
                'createdAt', now(),
                'updatedAt', now()
              )
            );
          end loop;
        end loop;

        v_count := v_count + 1;
        insert into public.aitask_audit_events(
          workspace_id, actor_member_id, command_id, action, entity_type,
          entity_id, changed_fields, metadata
        )
        values (
          p_workspace_id, null, v_command_id, 'insert', 'service_cycle',
          v_cycle_id, array['periodStart', 'periodEnd', 'status'],
          jsonb_build_object('source', 'cron', 'planId', v_plan.entity_id, 'revision', v_plan.data ->> 'revision')
        );
      end if;

      v_start := v_next;
    end loop;

    update public.aitask_entities
    set data = jsonb_set(
      jsonb_set(data, '{nextCycleStart}', to_jsonb(v_start::text)),
      '{updatedAt}', to_jsonb(now()::text)
    )
    where workspace_id = p_workspace_id
      and entity_type = 'client_plan'
      and entity_id = v_plan.entity_id
      and data ->> 'status' = 'Active';
  end loop;

  if v_count > 0 then
    update public.aitask_workspaces
    set version = version + 1, updated_at = now()
    where id = p_workspace_id;
  end if;
  return v_count;
end;
$$;

revoke all on function private.aitask_generate_due_service_cycles(text, date) from public, anon, authenticated;
grant execute on function private.aitask_generate_due_service_cycles(text, date) to service_role;
