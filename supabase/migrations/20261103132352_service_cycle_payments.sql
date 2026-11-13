-- Receipts use the workspace entity envelope so sync, versioning and immutable
-- value history apply exactly as they do for other service records.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition from pg_constraint
    where conrelid='public.aitask_entities'::regclass and conname='aitask_entities_entity_type_check';
  if definition is null then raise exception 'Missing entity type constraint'; end if;
  alter table public.aitask_entities drop constraint aitask_entities_entity_type_check;
  execute 'alter table public.aitask_entities add constraint aitask_entities_entity_type_check check (entity_type = ''service_cycle_payment'' or ' || substring(definition from 7) || ')';
end $$;

create index aitask_cycle_payment_balance_idx on public.aitask_entities(workspace_id,(data->>'cycleId'))
where entity_type='service_cycle_payment' and data->>'voidedAt' is null;

create policy "internal price readers can read cycle payments" on public.aitask_entities
for select to authenticated using (
  entity_type='service_cycle_payment'
  and private.aitask_member_id(workspace_id) is not null
  and private.aitask_member_role(workspace_id)<>'Client'
  and private.aitask_has_permission(workspace_id,'viewServicePrices')
  and private.aitask_can_access_service_client(workspace_id,data->>'clientId')
);
-- Restrictive policy also protects this financial type from broader future policies.
create policy "cycle payments require financial access" on public.aitask_entities
as restrictive for all to authenticated using (
  entity_type<>'service_cycle_payment' or (
    private.aitask_member_id(workspace_id) is not null
    and private.aitask_member_role(workspace_id)<>'Client'
    and private.aitask_has_permission(workspace_id,'viewServicePrices')
    and private.aitask_can_access_service_client(workspace_id,data->>'clientId')
  )
) with check (entity_type<>'service_cycle_payment');

create or replace function private.aitask_guard_cycle_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(new.entity_type,old.entity_type)<>'service_cycle_payment' then return coalesce(new,old); end if;
  if tg_op='DELETE' or coalesce(current_setting('aitask.payment_write',true),'')<>'allowed' then
    raise check_violation using message='Payments must be recorded or voided through the payment command.';
  end if;
  if tg_op='UPDATE' and (
    old.data->>'voidedAt' is not null
    or (new.data-array['voidedAt','voidedBy','voidReason']::text[]) is distinct from old.data
    or new.data->>'voidedAt' is null
  ) then raise check_violation using message='Receipts are immutable; void and replace.'; end if;
  return new;
end $$;
revoke all on function private.aitask_guard_cycle_payment() from public,anon,authenticated;
create trigger aitask_guard_cycle_payment before insert or update or delete on public.aitask_entities
for each row execute function private.aitask_guard_cycle_payment();

create or replace function public.aitask_execute_payment_command(
  p_workspace_id text, p_command_id uuid, p_command_type text,
  p_operations jsonb, p_expected_workspace_version bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor text := private.aitask_member_id(p_workspace_id);
  op jsonb; receipt jsonb; previous jsonb; cycle jsonb; pricing jsonb;
  payment_id text; v_cycle_id text; v_client_id text; amount bigint; charge bigint;
  received bigint; actual bigint; workspace_version bigint; row_version bigint;
  row_updated timestamptz; response jsonb; replay jsonb;
  subtotal numeric; discount numeric; rate numeric;
begin
  if (select auth.uid()) is null or actor is null
    or private.aitask_member_role(p_workspace_id)='Client'
    or not private.aitask_has_permission(p_workspace_id,'manageServiceCycles')
    or not private.aitask_has_permission(p_workspace_id,'viewServicePrices') then
    return jsonb_build_object('ok',false,'code','FORBIDDEN','error','Payment management and price access are required.');
  end if;
  if p_command_type not in ('service_cycle_payment.record','service_cycle_payment.void')
    or jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations)<>1 then
    return jsonb_build_object('ok',false,'code','VALIDATION','error','One payment operation is required.');
  end if;
  -- Consistent workspace -> cycle lock order. Replays are checked before stale
  -- workspace versions, so a lost response never inserts another receipt.
  select version into workspace_version from public.aitask_workspaces where id=p_workspace_id for update;
  select r.response into replay from public.aitask_command_receipts r
    where r.workspace_id=p_workspace_id and r.actor_member_id=actor and r.command_id=p_command_id;
  if replay is not null then return replay || jsonb_build_object('replayed',true); end if;
  if p_expected_workspace_version is not null and p_expected_workspace_version<>workspace_version then
    return jsonb_build_object('ok',false,'code','CONFLICT','error','The workspace changed. Refresh before recording payment.');
  end if;
  op:=p_operations->0; receipt:=op->'data'; payment_id:=op->>'entityId';
  if op->>'kind' is distinct from 'entity' or op->>'entityType' is distinct from 'service_cycle_payment'
    or nullif(payment_id,'') is null or receipt->>'id' is distinct from payment_id then
    raise check_violation using message='Invalid receipt operation.';
  end if;
  select data,version into previous,actual from public.aitask_entities
    where workspace_id=p_workspace_id and entity_type='service_cycle_payment' and entity_id=payment_id;
  if p_command_type='service_cycle_payment.record' and (op->>'action' is distinct from 'insert' or previous is not null) then
    raise check_violation using message='Receipt already exists.';
  elsif p_command_type='service_cycle_payment.void' and (op->>'action' is distinct from 'update' or previous is null) then
    raise check_violation using message='Receipt does not exist.';
  end if;
  v_cycle_id:=coalesce(previous->>'cycleId',receipt->>'cycleId');
  select data into cycle from public.aitask_entities where workspace_id=p_workspace_id
    and entity_type='service_cycle' and entity_id=v_cycle_id for update;
  v_client_id:=cycle->>'clientId';
  if cycle is null or not private.aitask_can_access_service_client(p_workspace_id,v_client_id)
    or receipt->>'clientId' is distinct from v_client_id or receipt->>'cycleId' is distinct from v_cycle_id
    or op->>'parentId' is distinct from v_cycle_id then
    return jsonb_build_object('ok',false,'code','FORBIDDEN','error','This cycle is outside your client access.');
  end if;
  perform set_config('aitask.command_type',p_command_type,true);
  perform set_config('aitask.command_id',p_command_id::text,true);
  perform set_config('aitask.payment_write','allowed',true);
  if p_command_type='service_cycle_payment.record' then
    if coalesce(receipt->>'amountMinor','') !~ '^[0-9]+$' then raise check_violation using message='Invalid amount.'; end if;
    amount:=(receipt->>'amountMinor')::bigint;
    if amount<=0 or amount>9007199254740991 or coalesce(receipt->>'paymentDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or (receipt->>'paymentDate')::date>(now() at time zone 'Asia/Kuala_Lumpur')::date then
      raise check_violation using message='Invalid amount or future payment date.';
    end if;
    select data into pricing from public.aitask_entities where workspace_id=p_workspace_id
      and entity_type='service_pricing_snapshot' and data->>'parentType'='service_cycle'
      and data->>'parentId'=v_cycle_id and data->>'clientId'=v_client_id limit 1;
    if pricing->>'totalMinor' is not null then charge:=(pricing->>'totalMinor')::bigint;
    else
      -- Legacy fallback uses only the cycle's own frozen items and terms.
      select coalesce(sum((item->>'quantity')::numeric*coalesce((select (price->>'unitPriceMinor')::numeric from jsonb_array_elements(coalesce(pricing->'itemPrices','[]')) price where price->>'serviceItemId'=item->>'id' limit 1),(item->>'unitPriceMinor')::numeric,0)),0) into subtotal
        from jsonb_array_elements(coalesce(cycle->'serviceItems','[]')) item;
      discount:=case coalesce(pricing->>'discountType',cycle->>'discountType')
        when 'percent' then round(subtotal*least(10000,greatest(0,coalesce((pricing->>'discountValue')::numeric,(cycle->>'discountValue')::numeric,0)))/10000)
        when 'fixed' then least(subtotal,greatest(0,coalesce((pricing->>'discountValue')::numeric,(cycle->>'discountValue')::numeric,0))) else 0 end;
      rate:=least(10000,greatest(0,coalesce((pricing->>'taxRateBps')::numeric,(cycle->>'taxRateBps')::numeric,0)));
      charge:=greatest(0,subtotal-discount)+round(greatest(0,subtotal-discount)*rate/10000);
    end if;
    select coalesce(sum((data->>'amountMinor')::bigint),0) into received from public.aitask_entities
      where workspace_id=p_workspace_id and entity_type='service_cycle_payment'
      and data->>'cycleId'=v_cycle_id and data->>'voidedAt' is null;
    if amount>charge-received then raise check_violation using message='The amount exceeds the remaining balance.'; end if;
    receipt:=jsonb_build_object('id',payment_id,'cycleId',v_cycle_id,'clientId',v_client_id,
      'amountMinor',amount,'paymentDate',receipt->>'paymentDate','createdBy',actor,'createdAt',now());
    insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(p_workspace_id,'service_cycle_payment',payment_id,v_cycle_id,receipt) returning version,updated_at into row_version,row_updated;
  else
    if previous->>'voidedAt' is not null or nullif(btrim(receipt->>'voidReason'),'') is null
      or (op->>'expectedVersion')::bigint is distinct from actual
      or (receipt-array['voidedAt','voidedBy','voidReason']::text[]) is distinct from previous then
      raise check_violation using message='Receipt changed or missing void reason.';
    end if;
    receipt:=previous||jsonb_build_object('voidedBy',actor,'voidedAt',now(),'voidReason',left(btrim(receipt->>'voidReason'),1000));
    update public.aitask_entities set data=receipt where workspace_id=p_workspace_id
      and entity_type='service_cycle_payment' and entity_id=payment_id returning version,updated_at into row_version,row_updated;
  end if;
  perform set_config('aitask.payment_write','',true);
  insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata)
    values(p_workspace_id,actor,p_command_id,op->>'action','service_cycle_payment',payment_id,
      private.aitask_json_changed_fields(coalesce(previous,'{}'),receipt),jsonb_build_object('cycleId',v_cycle_id));
  update public.aitask_workspaces set version=version+1,updated_at=now() where id=p_workspace_id returning version into workspace_version;
  response:=jsonb_build_object('ok',true,'commandId',p_command_id,'workspaceVersion',workspace_version,
    'changed',jsonb_build_array(jsonb_build_object('entityType','service_cycle_payment','entityId',payment_id,'version',row_version,'updatedAt',row_updated)),
    'deleted','[]'::jsonb,'refreshScope','rows');
  insert into public.aitask_command_receipts(workspace_id,actor_member_id,command_id,command_type,response)
    values(p_workspace_id,actor,p_command_id,p_command_type,response);
  return response;
exception when check_violation or invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'code','VALIDATION','error',sqlerrm);
end $$;
revoke all on function public.aitask_execute_payment_command(text,uuid,text,jsonb,bigint) from public,anon;
grant execute on function public.aitask_execute_payment_command(text,uuid,text,jsonb,bigint) to authenticated;

-- A plan manager without price visibility can still edit nonfinancial terms.
-- Copy protected terms on the server rather than asking that user to submit
-- a redacted (zero-price) snapshot for a newly created pending revision.
create or replace function private.aitask_copy_hidden_revision_pricing()
returns trigger language plpgsql security definer set search_path='' as $$
declare source public.aitask_entities%rowtype; price public.aitask_entities%rowtype; identity text;
begin
  if new.entity_type<>'client_plan' or new.data->>'status'<>'Draft'
    or nullif(new.data->>'supersedesPlanId','') is null
    or private.aitask_member_id(new.workspace_id) is null
    or private.aitask_has_permission(new.workspace_id,'viewServicePrices') then return new; end if;
  select * into source from public.aitask_entities where workspace_id=new.workspace_id
    and entity_type='client_plan' and entity_id=new.data->>'supersedesPlanId';
  if source.data->>'clientId' is distinct from new.data->>'clientId'
    or source.data->>'status' not in ('Active','Paused','Ended')
    or not private.aitask_has_permission(new.workspace_id,'manageClientPlans')
    or not private.aitask_can_access_service_client(new.workspace_id,new.data->>'clientId') then
    raise check_violation using message='This source plan is outside your access.';
  end if;
  select * into price from public.aitask_entities where workspace_id=new.workspace_id
    and entity_type='service_pricing_snapshot' and data->>'parentType'='client_plan' and data->>'parentId'=source.entity_id limit 1;
  if price.entity_id is not null then
    identity:='PRICE-revision-'||new.entity_id;
    insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(new.workspace_id,'service_pricing_snapshot',identity,new.entity_id,price.data||jsonb_build_object(
        'id',identity,'parentId',new.entity_id,'createdAt',now(),'updatedAt',now()));
  end if;
  return new;
end $$;
revoke all on function private.aitask_copy_hidden_revision_pricing() from public,anon,authenticated;
create trigger aitask_copy_hidden_revision_pricing after insert on public.aitask_entities
for each row execute function private.aitask_copy_hidden_revision_pricing();
