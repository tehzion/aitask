-- Keep the intent-specific service-cycle RPC aligned with the canonical
-- transition matrix enforced by the store and the database trigger:
-- Draft -> Published/Cancelled and Published -> Completed/Cancelled.
-- This is a forward compatibility fix for callers that use the narrow RPC
-- instead of the generic service command.

create or replace function public.aitask_set_service_cycle_status(
  p_workspace_id text, p_command_id uuid, p_cycle_id text, p_expected_version bigint, p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.aitask_entities%rowtype;
  v_data jsonb;
begin
  if p_status not in ('Draft', 'Published', 'Completed', 'Cancelled') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid cycle status.');
  end if;

  select * into v_row
  from public.aitask_entities
  where workspace_id = p_workspace_id
    and entity_type = 'service_cycle'
    and entity_id = p_cycle_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Cycle not found.');
  end if;

  v_data := jsonb_set(v_row.data, '{status}', to_jsonb(p_status));
  v_data := jsonb_set(v_data, '{updatedAt}', to_jsonb(now()::text));
  if p_status = 'Published' and coalesce(v_data ->> 'publishedAt', '') = '' then
    v_data := jsonb_set(v_data, '{publishedAt}', to_jsonb(now()::text));
  end if;

  return public.aitask_execute_service_command(
    p_workspace_id,
    p_command_id,
    'service_cycle.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity',
      'action', 'update',
      'entityType', 'service_cycle',
      'entityId', p_cycle_id,
      'parentId', v_row.parent_id,
      'expectedVersion', p_expected_version,
      'data', v_data
    ))
  );
end;
$$;

revoke all on function public.aitask_set_service_cycle_status(text, uuid, text, bigint, text)
  from public, anon;
grant execute on function public.aitask_set_service_cycle_status(text, uuid, text, bigint, text)
  to authenticated, service_role;
