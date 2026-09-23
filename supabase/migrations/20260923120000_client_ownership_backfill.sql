-- Backfill company ownership for client entities that lost their creator.
--
-- The pre-ownership migration that created client profiles from task/project
-- names (20260815042430) inserted them without a `createdBy`, and the legacy
-- placeholder clients discovered from work records had none either. After the
-- Project Manager ownership rollout (20260918180000/20260918200000) a client
-- row without `created_by` is only visible to Boss Koo (super admin) or to a
-- member with a visible task/project for the same client key. Companies that a
-- PM/Staff member created therefore stopped showing even though the row exists.
--
-- This derives the owner from the earliest linked client plan, project, or
-- task and writes it into `data.createdBy` (the aitask_guard_entity trigger
-- mirrors it into the `created_by` column). Companies with no derivable
-- creator stay ownerless and remain visible to Boss Koo only. The function is
-- idempotent and only ever touches rows that have no owner yet.

create or replace function private.aitask_backfill_client_ownership()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  with candidates as (
    select
      client.workspace_id,
      client.entity_id,
      coalesce(
        (select nullif(btrim(plan.data ->> 'createdBy'), '')
           from public.aitask_entities plan
          where plan.workspace_id = client.workspace_id
            and plan.entity_type = 'client_plan'
            and (
              (client.client_key <> '' and plan.client_key = client.client_key)
              or plan.client_id = client.entity_id
            )
            and nullif(btrim(plan.data ->> 'createdBy'), '') is not null
          order by plan.created_at, plan.entity_id
          limit 1),
        (select nullif(btrim(project.created_by), '')
           from public.aitask_entities project
          where project.workspace_id = client.workspace_id
            and project.entity_type = 'project'
            and (
              (client.client_key <> '' and project.client_key = client.client_key)
              or project.client_id = client.entity_id
            )
            and nullif(btrim(project.created_by), '') is not null
          order by project.created_at, project.entity_id
          limit 1),
        (select nullif(btrim(task.created_by), '')
           from public.aitask_entities task
          where task.workspace_id = client.workspace_id
            and task.entity_type = 'task'
            and (
              (client.client_key <> '' and task.client_key = client.client_key)
              or task.client_id = client.entity_id
            )
            and nullif(btrim(task.created_by), '') is not null
          order by task.created_at, task.entity_id
          limit 1)
      ) as owner_id
    from public.aitask_entities client
    where client.entity_type = 'client'
      and coalesce(btrim(client.created_by), '') = ''
      and coalesce(btrim(client.data ->> 'createdBy'), '') = ''
  )
  update public.aitask_entities client
  set data = client.data || jsonb_build_object('createdBy', candidates.owner_id)
  from candidates
  where client.workspace_id = candidates.workspace_id
    and client.entity_type = 'client'
    and client.entity_id = candidates.entity_id
    and candidates.owner_id is not null;

  get diagnostics v_updated = row_count;

  -- Keep the created_by column in sync when the JSON already carries an owner
  -- but the column is empty (for example rows written before the guard trigger
  -- mapped createdBy).
  update public.aitask_entities client
  set created_by = nullif(btrim(client.data ->> 'createdBy'), '')
  where client.entity_type = 'client'
    and coalesce(btrim(client.created_by), '') = ''
    and nullif(btrim(client.data ->> 'createdBy'), '') is not null;

  return v_updated;
end;
$$;

select private.aitask_backfill_client_ownership();

revoke all on function private.aitask_backfill_client_ownership() from public, anon, authenticated;
