-- Handing a company to another Project Manager now hands over the project seat
-- too: on the company's projects the previous owner is replaced by the new owner,
-- so the new owner sees the projects (and the Delivery tracker and Dashboard
-- portfolio built from them). Only Boss Koo could change a project's Project
-- Managers, which left a handed-over company with its projects still managed by
-- the previous owner.
--
-- A Project Manager may now replace themselves on a project they manage, and only
-- with one other Project Manager, and only while the project's company is owned by
-- them or by that other Project Manager (so it works whether the company or the
-- project is written first in the same command). Adding, removing or swapping
-- anyone else still needs Boss Koo. The later validity checks in the guard still
-- require every listed Project Manager to be an active, non-admin Project Manager.
-- The guard is patched in place (the anchor must match exactly once).

create or replace function private.aitask_can_hand_over_project_seat(
  p_workspace_id text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor text := private.aitask_member_id(p_workspace_id);
  v_old jsonb := p_old_data -> 'projectManagerIds';
  v_new jsonb := p_new_data -> 'projectManagerIds';
  v_kept jsonb;
  v_receiver text;
begin
  if private.aitask_member_role(p_workspace_id) is distinct from 'Project Manager'
    or private.aitask_is_super_admin(p_workspace_id)
    or v_actor is null
    or jsonb_typeof(v_old) is distinct from 'array'
    or jsonb_typeof(v_new) is distinct from 'array'
    or not (v_old ? v_actor) then
    return false;
  end if;

  v_kept := v_old - v_actor;
  if jsonb_array_length(v_new) <> jsonb_array_length(v_kept) + 1
    or exists (select 1 from jsonb_array_elements_text(v_kept) kept(id) where not (v_new ? kept.id)) then
    return false;
  end if;

  select incoming.id into v_receiver
  from jsonb_array_elements_text(v_new) incoming(id)
  where not (v_kept ? incoming.id);
  if v_receiver is null or v_receiver = v_actor then
    return false;
  end if;

  return exists (
    select 1
    from public.aitask_entities client
    where client.workspace_id = p_workspace_id
      and client.entity_type = 'client'
      and (
        client.entity_id = nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), '')
        or (nullif(btrim(coalesce(p_new_data ->> 'clientId', '')), '') is null
          and client.client_key = lower(btrim(coalesce(p_new_data ->> 'clientName', ''))))
      )
      and client.created_by in (v_actor, v_receiver)
  );
end;
$$;

revoke all on function private.aitask_can_hand_over_project_seat(text, jsonb, jsonb) from public, anon, authenticated;

do $migration$
declare
  v_definition text := pg_get_functiondef('private.aitask_guard_project_membership_scope()'::regprocedure);
  v_old constant text := 'if tg_op=''UPDATE'' and new.data->''projectManagerIds'' is distinct from old.data->''projectManagerIds'' then raise check_violation';
  v_new constant text := 'if tg_op=''UPDATE'' and new.data->''projectManagerIds'' is distinct from old.data->''projectManagerIds'' and not private.aitask_can_hand_over_project_seat(v_workspace, old.data, new.data) then raise check_violation';
begin
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Project Manager assignment anchor must occur exactly once';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
