-- Let a client see whether a month is paid, without ever seeing amounts.
-- The portal projection returns one word per published cycle (unpaid, partial,
-- paid) computed on the server from the cycle's price and its active receipts;
-- the payment rows themselves stay unreadable to Client accounts.
create or replace function private.aitask_cycle_payment_status(p_workspace_id text, p_cycle_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with price as (
    select coalesce(max((snapshot.data ->> 'totalMinor')::bigint), 0) as total
    from public.aitask_entities snapshot
    where snapshot.workspace_id = p_workspace_id
      and snapshot.entity_type = 'service_pricing_snapshot'
      and snapshot.data ->> 'parentType' = 'service_cycle'
      and snapshot.data ->> 'parentId' = p_cycle_id
      and (snapshot.data ->> 'totalMinor') ~ '^\d+$'
  ), received as (
    select coalesce(sum((payment.data ->> 'amountMinor')::bigint), 0) as amount
    from public.aitask_entities payment
    where payment.workspace_id = p_workspace_id
      and payment.entity_type = 'service_cycle_payment'
      and payment.data ->> 'cycleId' = p_cycle_id
      and coalesce(payment.data ->> 'voidedAt', '') = ''
      and (payment.data ->> 'amountMinor') ~ '^\d+$'
  )
  select case
    when received.amount <= 0 then 'unpaid'
    when price.total > 0 and received.amount >= price.total then 'paid'
    else 'partial'
  end
  from price, received;
$$;

revoke all on function private.aitask_cycle_payment_status(text, text) from public, anon, authenticated, service_role;

do $migration$
declare
  definition text := pg_get_functiondef('public.aitask_read_client_portal(text)'::regprocedure);
  anchor text := $sql$'version',version,'updatedAt',updated_at) order by period_start desc),'[]') into v_cycles$sql$;
  replacement text := $sql$'version',version,'updatedAt',updated_at,'paymentStatus',private.aitask_cycle_payment_status(workspace_id,entity_id)) order by period_start desc),'[]') into v_cycles$sql$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Expected one client portal cycle projection';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
