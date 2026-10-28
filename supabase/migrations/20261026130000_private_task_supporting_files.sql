-- Supporting work files are separate from outputAttachments. They remain
-- internal, do not satisfy deliverable evidence gates, and cannot be read by
-- Client accounts.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-supporting-files', 'task-supporting-files', false, 104857600,
  array['application/pdf','image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.aitask_guard_task_supporting_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_role text := private.aitask_member_role(new.workspace_id);
  v_files jsonb := coalesce(new.data->'supportingAttachments', '[]'::jsonb);
  f jsonb;
begin
  if new.entity_type <> 'task'
    or coalesce(new.data->'supportingAttachments', '[]'::jsonb) = coalesce(v_old->'supportingAttachments', '[]'::jsonb) then
    return new;
  end if;
  if tg_op <> 'UPDATE' or v_actor is null or v_role = 'Client'
    or not private.aitask_can_edit_task(new.workspace_id, new.entity_id)
    or (v_role = 'Staff' and not private.aitask_is_hod(new.workspace_id) and new.data->>'assignedTo' is distinct from v_actor) then
    raise check_violation using message = 'Only the assigned worker or responsible reviewer can upload supporting files.';
  end if;
  if v_old->>'status' in ('Waiting Approval','Approved','Completed','Cancelled') then
    raise check_violation using message = 'Supporting files cannot be changed after this task is submitted or closed.';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 50
    or not (v_files @> coalesce(v_old->'supportingAttachments', '[]'::jsonb)) then
    raise check_violation using message = 'A task can contain at most 50 supporting files, and saved files cannot be removed here.';
  end if;

  for f in select value from jsonb_array_elements(v_files)
  loop
    if coalesce(v_old->'supportingAttachments', '[]'::jsonb) @> jsonb_build_array(f) then continue; end if;
    if jsonb_typeof(f) <> 'object'
      or f->>'bucket' <> 'task-supporting-files'
      or nullif(f->>'id', '') is null
      or f->>'uploadedBy' is distinct from v_actor
      or f->>'mimeType' not in ('application/pdf','image/jpeg','image/png','image/webp','image/gif')
      or coalesce((f->>'sizeBytes')::bigint, -1) < 0
      or coalesce((f->>'sizeBytes')::bigint, 104857601) > 104857600
      or nullif(btrim(f->>'fileName'), '') is null
      or length(f->>'fileName') > 240
      or array_length(string_to_array(f->>'path', '/'), 1) <> 3
      or split_part(f->>'path', '/', 1) <> new.workspace_id
      or split_part(f->>'path', '/', 2) <> new.entity_id
      or split_part(f->>'path', '/', 3) not like (f->>'id') || '-%'
      or coalesce(f->>'path', '') ~ '(^|/)\.\.?(/|$)'
      or position(chr(92) in coalesce(f->>'path', '')) > 0
      or not exists (
        select 1 from storage.objects object
        where object.bucket_id = 'task-supporting-files'
          and object.name = f->>'path'
          and object.owner_id = (select auth.uid())::text
          and object.metadata->>'mimetype' = f->>'mimeType'
          and coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
          and (object.metadata->>'size')::bigint = (f->>'sizeBytes')::bigint
      ) then
      raise check_violation using message = 'Choose a valid PDF or image file uploaded for this task.';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_supporting_files() from public, anon, authenticated, service_role;
drop trigger if exists aitask_03_guard_task_supporting_files on public.aitask_entities;
create trigger aitask_03_guard_task_supporting_files
  before insert or update of data on public.aitask_entities
  for each row execute function private.aitask_guard_task_supporting_files();

drop policy if exists "task supporting files read" on storage.objects;
create policy "task supporting files read" on storage.objects for select to authenticated using (
  bucket_id = 'task-supporting-files'
  and array_length(storage.foldername(name), 1) = 2
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_view_task((storage.foldername(name))[1], (storage.foldername(name))[2])
  and exists (
    select 1 from public.aitask_entities task
    cross join lateral jsonb_array_elements(coalesce(task.data->'supportingAttachments', '[]'::jsonb)) attachment
    where task.workspace_id = (storage.foldername(name))[1]
      and task.entity_type = 'task'
      and task.entity_id = (storage.foldername(name))[2]
      and attachment->>'bucket' = 'task-supporting-files'
      and attachment->>'path' = name
  )
);

drop policy if exists "task supporting files insert" on storage.objects;
create policy "task supporting files insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'task-supporting-files'
  and array_length(storage.foldername(name), 1) = 2
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_edit_task((storage.foldername(name))[1], (storage.foldername(name))[2])
  and exists (
    select 1 from public.aitask_entities task
    where task.workspace_id = (storage.foldername(name))[1]
      and task.entity_type = 'task'
      and task.entity_id = (storage.foldername(name))[2]
      and task.data->>'status' not in ('Waiting Approval','Approved','Completed','Cancelled')
      and (private.aitask_member_role(task.workspace_id) <> 'Staff'
        or private.aitask_is_hod(task.workspace_id)
        or task.data->>'assignedTo' = private.aitask_member_id(task.workspace_id))
  )
);

drop policy if exists "task supporting files delete unreferenced" on storage.objects;
create policy "task supporting files delete unreferenced" on storage.objects for delete to authenticated using (
  bucket_id = 'task-supporting-files'
  and array_length(storage.foldername(name), 1) = 2
  and owner_id = (select auth.uid())::text
  and private.aitask_member_role((storage.foldername(name))[1]) <> 'Client'
  and private.aitask_can_edit_task((storage.foldername(name))[1], (storage.foldername(name))[2])
  and not exists (
    select 1 from public.aitask_entities task
    cross join lateral jsonb_array_elements(coalesce(task.data->'supportingAttachments', '[]'::jsonb)) attachment
    where task.workspace_id = (storage.foldername(name))[1]
      and task.entity_type = 'task'
      and task.entity_id = (storage.foldername(name))[2]
      and attachment->>'path' = name
  )
);

-- HOD edits pass an explicit field allow-list. Permit the new append-only
-- supporting attachment field; its dedicated trigger validates ownership.
do $$
declare
  definition text;
  updated text;
  old_field text := $old$'dueReminderSent', 'comments',$old$;
  new_field text := $new$'dueReminderSent', 'comments', 'supportingAttachments',$new$;
begin
  definition := pg_get_functiondef('private.aitask_hod_task_execution_patch_is_valid(text,jsonb,jsonb)'::regprocedure);
  updated := replace(definition, old_field, new_field);
  if updated = definition then
    raise exception 'HOD task update allow-list marker was not found.';
  end if;
  execute updated;
end;
$$;

-- Include supporting attachment changes in the task activity history without
-- treating them as output changes or evidence.
do $$
declare
  definition text;
  updated text;
  old_fields text := $old$'outputAttachments','reviewCover','accountableLeadId'$old$;
  new_fields text := $new$'outputAttachments','supportingAttachments','reviewCover','accountableLeadId'$new$;
begin
  definition := pg_get_functiondef('private.aitask_guard_task_workflow()'::regprocedure);
  updated := replace(definition, old_fields, new_fields);
  if updated = definition then
    raise exception 'Task activity history field marker was not found.';
  end if;
  execute updated;
end;
$$;
