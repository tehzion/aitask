-- Preserve the v2.1.3 authorization boundary while allowing the cycle
-- publication timestamp already accepted by the service-command preflight.
-- This is a forward correction because the original v2.1.3 migration is
-- immutable after tagging.

create or replace function private.aitask_guard_scoped_staff_service_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id text := coalesce(new.workspace_id, old.workspace_id);
  v_entity_type text := coalesce(new.entity_type, old.entity_type);
  v_actor_id text := private.aitask_member_id(v_workspace_id);
  v_expected_cycle_status text;
  v_cycle_id text;
  v_client_id text;
begin
  if v_entity_type not in ('service_cycle', 'deliverable', 'cycle_comment') then
    return coalesce(new, old);
  end if;
  if private.aitask_member_role(v_workspace_id) is distinct from 'Staff'
    or private.aitask_has_permission(v_workspace_id, 'manageServiceCycles') then
    return coalesce(new, old);
  end if;

  if v_entity_type = 'service_cycle' then
    if tg_op <> 'UPDATE'
      or (old.data - array['status', 'publishedAt', 'updatedAt']::text[])
        is distinct from (new.data - array['status', 'publishedAt', 'updatedAt']::text[]) then
      raise check_violation using message = 'Staff cannot administer service cycles.';
    end if;

    select case
      when count(*) > 0 and bool_and(deliverable.data ->> 'status' = 'Delivered') then 'Completed'
      when old.data ->> 'status' = 'Completed' then 'Published'
      else null
    end into v_expected_cycle_status
    from public.aitask_entities deliverable
    where deliverable.workspace_id = v_workspace_id
      and deliverable.entity_type = 'deliverable'
      and deliverable.cycle_id = old.entity_id;
    if v_expected_cycle_status is null or new.data ->> 'status' <> v_expected_cycle_status then
      raise check_violation using message = 'Staff cannot publish or manually change service cycles.';
    end if;
    return new;
  end if;

  if v_entity_type = 'deliverable' then
    if tg_op <> 'UPDATE'
      or (
        not private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'updatedAt']::text[])
      )
      or (
        private.aitask_has_permission(v_workspace_id, 'editTasks')
        and (old.data - array['status', 'taskIds', 'updatedAt']::text[])
          is distinct from (new.data - array['status', 'taskIds', 'updatedAt']::text[])
      )
      or new.data ->> 'status' not in ('Planned', 'In Progress', 'Ready', 'Delivered') then
      raise check_violation using message = 'Staff may update deliverable execution fields only.';
    end if;
    return new;
  end if;

  if v_entity_type = 'cycle_comment' then
    v_cycle_id := coalesce(new.data ->> 'cycleId', old.data ->> 'cycleId');
    v_client_id := coalesce(new.data ->> 'clientId', old.data ->> 'clientId');
    if not exists (
      select 1
      from public.aitask_entities cycle
      where cycle.workspace_id = v_workspace_id
        and cycle.entity_type = 'service_cycle'
        and cycle.entity_id = v_cycle_id
        and cycle.client_id = v_client_id
    ) then
      raise check_violation using message = 'Cycle comment scope is invalid.';
    end if;

    if tg_op = 'INSERT' then
      if new.data ->> 'userId' <> v_actor_id
        or btrim(coalesce(new.data ->> 'text', '')) = ''
        or length(new.data ->> 'text') > 10000
        or new.data ->> 'visibility' not in ('internal', 'client-visible') then
        raise check_violation using message = 'Staff comments must be valid and owned by the signed-in member.';
      end if;
      return new;
    elsif tg_op = 'UPDATE' then
      if old.data ->> 'userId' <> v_actor_id
        or new.data ->> 'userId' <> v_actor_id
        or (old.data - array['attachments', 'updatedAt']::text[])
          is distinct from (new.data - array['attachments', 'updatedAt']::text[])
        or jsonb_typeof(coalesce(new.data -> 'attachments', '[]'::jsonb)) <> 'array' then
        raise check_violation using message = 'Staff may update attachments on their own cycle comments only.';
      end if;
      return new;
    end if;
  end if;

  raise check_violation using message = 'Staff cannot create or delete service-management records.';
end;
$$;

revoke all on function private.aitask_guard_scoped_staff_service_write()
  from public, anon, authenticated, service_role;
