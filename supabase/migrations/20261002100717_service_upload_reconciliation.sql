-- Account-scoped status and explicit abandonment. No object contents, workspace
-- rows, other actors' receipts, or broader storage access are returned.
create table private.aitask_abandoned_service_files (
  workspace_id text not null,
  object_name text not null,
  actor_member_id text not null,
  abandoned_at timestamptz not null default now(),
  primary key (workspace_id, object_name)
);
alter table private.aitask_abandoned_service_files enable row level security;
revoke all on private.aitask_abandoned_service_files from public, anon, authenticated;

create or replace function private.aitask_service_file_referenced(p_workspace_id text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and jsonb_path_exists(entity.data, '$.** ? (@.bucket == $bucket && @.path == $path)',
        jsonb_build_object('bucket', 'client-service-files', 'path', p_path))
  );
$$;
revoke all on function private.aitask_service_file_referenced(text, text) from public, anon, authenticated;

create or replace function private.aitask_guard_abandoned_service_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  for v_path in select distinct attachment->>'path'
    from jsonb_path_query(new.data, '$.** ? (@.bucket == "client-service-files" && exists(@.path))') attachment
    order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('service-file:' || new.workspace_id || ':' || v_path, 0));
    if exists(select 1 from private.aitask_abandoned_service_files where workspace_id = new.workspace_id and object_name = v_path) then
      raise exception 'An abandoned attachment cannot be referenced. Upload it again.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.aitask_guard_abandoned_service_refs() from public, anon, authenticated;
create trigger aitask_guard_abandoned_service_refs before insert or update of data on public.aitask_entities
for each row execute function private.aitask_guard_abandoned_service_refs();

create or replace function public.aitask_reconcile_service_upload(
  p_workspace_id text, p_command_id uuid, p_path text, p_abandon boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.aitask_member_id(p_workspace_id);
  v_receipt jsonb;
  v_owner text;
  v_exists boolean;
  v_referenced boolean;
  v_parts text[] := string_to_array(p_path, '/');
begin
  if (select auth.uid()) is null or v_actor is null or private.aitask_member_role(p_workspace_id) = 'Client'
    or array_length(v_parts, 1) <> 4 or v_parts[1] <> p_workspace_id
    or not private.aitask_can_access_service_client(p_workspace_id, v_parts[2]) then
    return jsonb_build_object('ok', false, 'error', 'Upload reconciliation is not permitted.');
  end if;
  -- Match command lock order: workspace first, then the idempotency key.
  perform 1 from public.aitask_workspaces where id = p_workspace_id for update;
  if p_command_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
    select response into v_receipt from public.aitask_command_receipts
      where workspace_id = p_workspace_id and actor_member_id = v_actor and command_id = p_command_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-file:' || p_workspace_id || ':' || p_path, 0));
  select owner_id into v_owner from storage.objects where bucket_id = 'client-service-files' and name = p_path;
  v_exists := found;
  if v_exists and v_owner is distinct from (select auth.uid())::text then
    return jsonb_build_object('ok', false, 'error', 'Upload reconciliation is not permitted.');
  end if;
  v_referenced := private.aitask_service_file_referenced(p_workspace_id, p_path);
  if v_referenced then return jsonb_build_object('ok', true, 'status', 'referenced'); end if;
  if not v_exists then return jsonb_build_object('ok', true, 'status', 'missing'); end if;
  if not p_abandon then
    return jsonb_build_object('ok', true, 'status', case when v_receipt->>'ok' = 'true' then 'committed-unreferenced' else 'unresolved' end);
  end if;
  -- The receipt prevents a timed-out request from committing later with this ID.
  if p_command_id is not null and v_receipt is null then
    insert into public.aitask_command_receipts(workspace_id, actor_member_id, command_id, command_type, response)
    values(p_workspace_id, v_actor, p_command_id, 'upload.abandon', jsonb_build_object('ok', false, 'code', 'ABANDONED', 'error', 'This command was explicitly discarded.', 'commandId', p_command_id));
  end if;
  -- Prevent any future command from referring to this abandoned object path.
  insert into private.aitask_abandoned_service_files(workspace_id, object_name, actor_member_id)
  values(p_workspace_id, p_path, v_actor) on conflict do nothing;
  return jsonb_build_object('ok', true, 'status', 'abandoned');
end;
$$;
revoke all on function public.aitask_reconcile_service_upload(text, uuid, text, boolean) from public, anon;
grant execute on function public.aitask_reconcile_service_upload(text, uuid, text, boolean) to authenticated;

-- Retain existing ownership and client-access restrictions; require explicit
-- abandonment as well. Storage objects must be deleted using the Storage API.
drop policy if exists "service files delete" on storage.objects;
-- The policy's private table is not exposed: use a narrowly scoped predicate.
create or replace function private.aitask_can_delete_abandoned_service_file(p_workspace_id text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.aitask_abandoned_service_files
    where workspace_id = p_workspace_id and object_name = p_path
      and actor_member_id = private.aitask_member_id(p_workspace_id))
    and not private.aitask_service_file_referenced(p_workspace_id, p_path);
$$;
revoke all on function private.aitask_can_delete_abandoned_service_file(text, text) from public, anon;
grant execute on function private.aitask_can_delete_abandoned_service_file(text, text) to authenticated;
create policy "service files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'client-service-files' and array_length(storage.foldername(name), 1) = 3
  and owner_id = (select auth.uid())::text
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_access_service_client((storage.foldername(name))[1], (storage.foldername(name))[2])
  and private.aitask_can_delete_abandoned_service_file((storage.foldername(name))[1], name)
);
