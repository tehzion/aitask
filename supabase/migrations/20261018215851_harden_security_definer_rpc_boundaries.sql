-- Security Advisor follow-up: close confirmed authorization and object-integrity
-- gaps without changing the intentional SECURITY DEFINER RPC boundary.
--
-- This migration is reviewed source only. It must be applied to disposable or
-- staging data first; it has not been applied to production by this task.

-- 1. Service-management writes must bind update/delete targets to a PM's
--    portfolio before the SECURITY DEFINER function performs a write. The
--    existing PM trigger protects INSERT/UPDATE, but it is not a DELETE
--    trigger. Keep this check in the RPC so both overloads have the same
--    authorization semantics and RLS bypass cannot widen the delete surface.
create or replace function private.aitask_service_target_in_scope(
  p_workspace_id text,
  p_action text,
  p_entity_type text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_entity_type not in (
      'client_plan', 'addon', 'service_pricing_snapshot',
      'service_cycle', 'deliverable', 'cycle_comment'
    ) then true
    when private.aitask_is_super_admin(p_workspace_id) then true
    when private.aitask_member_role(p_workspace_id) <> 'Project Manager' then true
    when p_action = 'insert' then true
    when p_action = 'delete' then
      private.aitask_can_access_service_client(
        p_workspace_id,
        p_old_data ->> 'clientId'
      )
    when p_action = 'update' then
      p_old_data ->> 'clientId' is not distinct from p_new_data ->> 'clientId'
      and private.aitask_can_access_service_client(
        p_workspace_id,
        p_old_data ->> 'clientId'
      )
      and private.aitask_can_access_service_client(
        p_workspace_id,
        p_new_data ->> 'clientId'
      )
    else false
  end;
$$;

revoke all on function private.aitask_service_target_in_scope(text, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;

do $$
declare
  signature text;
  definition text;
  original text;
  anchor text := $anchor$v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');$anchor$;
  addition text := $addition$v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');
    if not private.aitask_service_target_in_scope(
      p_workspace_id, v_action, v_type, v_old, v_new
    ) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This company is outside your portfolio.');
    end if;$addition$;
begin
  foreach signature in array array[
    'public.aitask_execute_service_command(text,uuid,text,jsonb)',
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'
  ]
  loop
    if to_regprocedure(signature) is null then
      raise exception 'Required service command function is missing: %', signature;
    end if;
    definition := pg_get_functiondef(signature::regprocedure);
    original := definition;
    definition := replace(definition, anchor, addition);
    if definition = original then
      raise exception 'Service target authorization anchor was not found in %.', signature;
    end if;
    execute definition;
  end loop;
end;
$$;

-- 2. A generated task must reference one coherent client -> cycle ->
--    deliverable chain in the same workspace. Non-empty forged IDs are not
--    sufficient authorization for the SECURITY DEFINER task-chain RPC.
create or replace function private.aitask_generated_task_references_are_valid(
  p_workspace_id text,
  p_data jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.aitask_entities client
    join public.aitask_entities cycle
      on cycle.workspace_id = client.workspace_id
     and cycle.entity_type = 'service_cycle'
     and cycle.entity_id = p_data ->> 'serviceCycleId'
     and cycle.client_id = client.entity_id
    join public.aitask_entities deliverable
      on deliverable.workspace_id = cycle.workspace_id
     and deliverable.entity_type = 'deliverable'
     and deliverable.entity_id = p_data ->> 'deliverableId'
     and deliverable.client_id = client.entity_id
     and deliverable.cycle_id = cycle.entity_id
    where client.workspace_id = p_workspace_id
      and client.entity_type = 'client'
      and client.entity_id = p_data ->> 'clientId'
  );
$$;

revoke all on function private.aitask_generated_task_references_are_valid(text, jsonb)
  from public, anon, authenticated, service_role;

do $$
declare
  signature text;
  definition text;
  original text;
  anchor text := $anchor$and private.aitask_can_access_service_client(p_workspace_id, v_client_id)
    ) then$anchor$;
  addition text := $addition$and private.aitask_can_access_service_client(p_workspace_id, v_client_id)
      and private.aitask_generated_task_references_are_valid(p_workspace_id, v_new)
    ) then$addition$;
begin
  foreach signature in array array[
    'public.aitask_execute_service_command(text,uuid,text,jsonb)',
    'public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)'
  ]
  loop
    definition := pg_get_functiondef(signature::regprocedure);
    original := definition;
    definition := replace(definition, anchor, addition);
    if definition = original then
      raise exception 'Generated task reference anchor was not found in %.', signature;
    end if;
    execute definition;
  end loop;
end;
$$;

-- 3. Client portal membership is currently keyed by normalized client name.
--    Duplicate canonical client rows already exist in production, so serving
--    a name-matched portal would be an ambiguous cross-company read. Fail
--    closed until the client mapping is repaired; do not silently pick LIMIT 1.
do $$
declare
  signature regprocedure := 'public.aitask_read_client_portal(text)'::regprocedure;
  definition text;
  original text;
  variable_anchor text := $anchor$v_member public.aitask_members%rowtype; v_key text; v_client_id text;$anchor$;
  variable_addition text := $addition$v_member public.aitask_members%rowtype; v_key text; v_client_id text; v_client_count integer;$addition$;
  body_anchor text := $anchor$v_key:=lower(btrim(coalesce(v_member.client_name,'')));
  select entity_id into v_client_id from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key limit 1;$anchor$;
  body_addition text := $addition$v_key:=lower(btrim(coalesce(v_member.client_name,'')));
  select count(*) into v_client_count
  from public.aitask_entities client
  where client.workspace_id=p_workspace_id and client.entity_type='client' and client.client_key=v_key;
  if v_client_count <> 1 then
    raise insufficient_privilege using message='Client workspace mapping is unavailable.';
  end if;
  select entity_id into v_client_id from public.aitask_entities where workspace_id=p_workspace_id and entity_type='client' and client_key=v_key limit 1;$addition$;
begin
  definition := pg_get_functiondef(signature);
  original := definition;
  definition := replace(definition, variable_anchor, variable_addition);
  if definition = original then
    raise exception 'Client portal variable anchor was not found.';
  end if;
  definition := replace(definition, body_anchor, body_addition);
  if definition = original then
    raise exception 'Client portal mapping anchor was not found.';
  end if;
  execute definition;
end;
$$;
