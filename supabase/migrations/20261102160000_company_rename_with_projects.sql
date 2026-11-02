-- Renaming a company that has projects was rejected for everyone ("You do
-- not have permission to make this change."), Boss included. The app sends
-- the company, its projects and its tasks in one command. The executor checks
-- every operation before it writes any of them, so the project and task
-- checks compared the new name against rows that still held the old one.
-- Production history has a single successful rename, of a company with no
-- projects.
--
-- The command wrappers now record, for this transaction only, which
-- companies the command renames (old key -> new key). The two name checks
-- accept either name for exactly those companies. The company update itself
-- is still permission-checked in the same pass, so an unauthorised rename
-- writes nothing.

create or replace function private.aitask_client_rename_aliases(p_workspace_id text, p_operations jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(lower(btrim(op -> 'data' ->> 'clientName')), client.client_key), '{}'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_operations) = 'array' then p_operations else '[]'::jsonb end) op
  join public.aitask_entities client
    on client.workspace_id = p_workspace_id
   and client.entity_type = 'client'
   and client.entity_id = op ->> 'entityId'
  where op ->> 'entityType' = 'client'
    and op ->> 'action' = 'update'
    and nullif(lower(btrim(op -> 'data' ->> 'clientName')), '') is not null
    and lower(btrim(op -> 'data' ->> 'clientName')) <> client.client_key;
$$;

revoke all on function private.aitask_client_rename_aliases(text, jsonb) from public, anon, authenticated;

-- The stored key a name stands for while this command renames that company.
create or replace function private.aitask_renamed_client_key(p_client_key text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(coalesce(nullif(current_setting('aitask.client_renames', true), ''), '{}')::jsonb
    ->> lower(btrim(coalesce(p_client_key, ''))), '');
$$;

revoke all on function private.aitask_renamed_client_key(text) from public, anon, authenticated;

create or replace function private.aitask_project_client_is_valid(p_workspace_id text, p_client_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(trim(coalesce(p_client_id, '')), '') is not null
    and exists (
      select 1
      from public.aitask_entities client
      where client.workspace_id = p_workspace_id
        and client.entity_type = 'client'
        and client.entity_id = p_client_id
        and client.client_key in (
          lower(trim(coalesce(p_client_key, ''))),
          private.aitask_renamed_client_key(p_client_key)
        )
        and private.aitask_can_view_client(p_workspace_id, client.client_key)
    );
$$;

revoke all on function private.aitask_project_client_is_valid(text, text, text) from public, anon, authenticated;

create or replace function private.aitask_task_project_link_is_valid(p_workspace_id text, p_project_id text, p_task_client_id text, p_task_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(coalesce(p_project_id, '')), '') is null
    or exists (
      select 1
      from public.aitask_entities project
      where project.workspace_id = p_workspace_id
        and project.entity_type = 'project'
        and project.entity_id = p_project_id
        and private.aitask_can_view_project(p_workspace_id, p_project_id)
        and lower(btrim(coalesce(project.data ->> 'clientName', ''))) in (
          lower(btrim(coalesce(p_task_client_key, ''))),
          private.aitask_renamed_client_key(p_task_client_key)
        )
        and (
          nullif(btrim(coalesce(project.data ->> 'clientId', '')), '') is null
          or nullif(btrim(coalesce(p_task_client_id, '')), '') is null
          or project.data ->> 'clientId' = p_task_client_id
        )
    );
$$;

revoke all on function private.aitask_task_project_link_is_valid(text, text, text, text) from public, anon, authenticated;

-- Record the aliases at the start of both command entry points. Patched in
-- place so the rest of each definition stays byte-identical.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_anchor constant text := '  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
';
  v_addition constant text := '  perform set_config(''aitask.client_renames'', private.aitask_client_rename_aliases(p_workspace_id, p_operations)::text, true);
  perform private.aitask_seed_staff_task_context(p_workspace_id, p_operations);
';
begin
  foreach v_signature in array array[
    'public.aitask_execute_command(text,uuid,text,jsonb,bigint)'::regprocedure,
    'public.aitask_execute_command(text,uuid,text,jsonb)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception 'Command wrapper anchor must occur exactly once in %', v_signature;
    end if;
    execute replace(v_definition, v_anchor, v_addition);
  end loop;
end;
$migration$;
