-- A successful review submission must reach the department HOD, including
-- submissions from older clients and the full editor. Generate the handoff in
-- the same transaction as the task save rather than trusting a browser audience.
create or replace function private.aitask_notify_hod_review_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_recipient record;
  v_id text;
  v_server_notification text := current_setting('aitask.server_notification', true);
begin
  if v_actor is null or private.aitask_member_role(new.workspace_id) = 'Client'
    or new.data->>'status' is distinct from 'Waiting Approval'
    or old.data->>'status' is not distinct from new.data->>'status' then
    return new;
  end if;

  for v_recipient in
    select member.id
    from public.aitask_members member
    where member.workspace_id = new.workspace_id
      and member.id <> v_actor
      and member.role in ('HOD', 'Staff')
      and (member.role = 'HOD' or member.custom_role_id = 'builtin-hod')
      and private.aitask_task_department(new.data->>'department') = any(member.departments)
  loop
    v_id := 'N-hod-review-' || replace(gen_random_uuid()::text, '-', '');
    perform set_config('aitask.server_notification', 'true', true);
    insert into public.aitask_entities(workspace_id, entity_type, entity_id, parent_id, data)
    values (new.workspace_id, 'notification', v_id, new.entity_id, jsonb_build_object(
      'id', v_id, 'targetUserId', v_recipient.id,
      'title', 'Task Ready for Approval',
      'message', '"' || left(coalesce(new.data->>'title', 'Task'), 160) || '" is ready for department review.',
      'route', jsonb_build_object('page', 'tasks', 'entityId', new.entity_id),
      'iconType', 'status', 'isRead', false, 'readByUserIds', jsonb_build_array(),
      'createdAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end loop;
  perform set_config('aitask.server_notification', coalesce(v_server_notification, 'false'), true);
  return new;
end;
$$;

revoke all on function private.aitask_notify_hod_review_submission() from public, anon, authenticated;
create trigger aitask_notify_hod_review_submission
after update on public.aitask_entities
for each row
when (new.entity_type = 'task')
execute function private.aitask_notify_hod_review_submission();
