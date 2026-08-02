-- AiTask v1.6.16: paginated notification history and isolated per-user reads.
-- Existing notification rows are preserved without backfill or cleanup.

create index if not exists aitask_entities_notification_feed_idx
  on public.aitask_entities(workspace_id, entity_type, created_at desc, entity_id desc);

create or replace function private.aitask_enrich_new_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text;
  v_category text;
begin
  if new.entity_type <> 'notification' then return new; end if;
  v_content := lower(coalesce(new.data ->> 'title', '') || ' ' || coalesce(new.data ->> 'message', ''));
  v_category := case
    when new.data ->> 'category' in ('assignment', 'deadline', 'review', 'feedback', 'account', 'status', 'system')
      then new.data ->> 'category'
    when v_content ~ 'assign(ed|ment)?' then 'assignment'
    when v_content ~ 'deadline|due soon|due date|overdue' then 'deadline'
    when v_content ~ 'approval|approved|revision|requested changes|ready for (approval|review)' then 'review'
    when v_content ~ 'comment|feedback|replied|reply' then 'feedback'
    when v_content ~ 'registration|member|account|password|invite' then 'account'
    when v_content ~ 'status|completed|task created|created by staff' then 'status'
    when new.data -> 'route' ->> 'page' = 'settings' then 'account'
    else 'system'
  end;

  new.data := jsonb_set(new.data, '{category}', to_jsonb(v_category), true);
  if new.data ->> 'importance' not in ('action', 'informational') then
    new.data := jsonb_set(
      new.data,
      '{importance}',
      to_jsonb(case
        when v_category in ('assignment', 'deadline', 'review', 'feedback') then 'action'
        when v_category = 'account'
          and v_content ~ 'new registration|registered.+waiting|staff.+(approval|approve)' then 'action'
        else 'informational'
      end),
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.aitask_enrich_new_notification() from public;

drop trigger if exists aitask_enrich_new_notification on public.aitask_entities;
create trigger aitask_enrich_new_notification
  before insert on public.aitask_entities
  for each row
  when (new.entity_type = 'notification')
  execute function private.aitask_enrich_new_notification();

create or replace function public.aitask_read_notifications(
  p_workspace_id text,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id text default null,
  p_unread_only boolean default false,
  p_category text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_member_id text;
  v_limit integer := least(50, greatest(1, coalesce(p_limit, 50)));
  v_search text := lower(left(btrim(coalesce(p_search, '')), 200));
  v_page jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_unread_count integer := 0;
  v_next_cursor jsonb := null;
  v_has_more boolean := false;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Authentication required.');
  end if;
  select member.id into v_member_id
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if p_category is not null
    and p_category not in ('assignment', 'deadline', 'review', 'feedback', 'account', 'status', 'system') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Unsupported notification category.');
  end if;

  with classified as (
    select
      entity.entity_id,
      entity.version,
      entity.created_at,
      entity.updated_at,
      entity.data,
      case
        when entity.data ->> 'category' in ('assignment', 'deadline', 'review', 'feedback', 'account', 'status', 'system')
          then entity.data ->> 'category'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'assign(ed|ment)?' then 'assignment'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'deadline|due soon|due date|overdue' then 'deadline'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'approval|approved|revision|requested changes|ready for (approval|review)' then 'review'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'comment|feedback|replied|reply' then 'feedback'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'registration|member|account|password|invite' then 'account'
        when lower(coalesce(entity.data ->> 'title', '') || ' ' || coalesce(entity.data ->> 'message', '')) ~ 'status|completed|task created|created by staff' then 'status'
        when entity.data -> 'route' ->> 'page' = 'settings' then 'account'
        else 'system'
      end as category,
      case
        when entity.data ? 'readByUserIds' then coalesce(entity.data -> 'readByUserIds', '[]'::jsonb) @> jsonb_build_array(v_member_id)
        else coalesce(entity.data ->> 'isRead', 'false') = 'true'
      end as is_read
    from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'notification'
      and (
        p_before_created_at is null
        or (entity.created_at, entity.entity_id) < (p_before_created_at, coalesce(p_before_id, ''))
      )
  ), filtered as (
    select *
    from classified
    where (not p_unread_only or not is_read)
      and (p_category is null or category = p_category)
      and (v_search = '' or position(v_search in lower(coalesce(data ->> 'title', '') || ' ' || coalesce(data ->> 'message', ''))) > 0)
    order by created_at desc, entity_id desc
    limit v_limit + 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', entity_id,
    'version', version,
    'updatedAt', to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'title', left(coalesce(data ->> 'title', ''), 240),
    'message', left(coalesce(data ->> 'message', ''), 2000),
    'route', coalesce(data -> 'route', '{}'::jsonb),
    'isRead', is_read,
    'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'iconType', case when data ->> 'iconType' in ('task', 'status', 'success', 'alert') then data ->> 'iconType' else 'status' end,
    'category', category,
    'importance', case
      when data ->> 'importance' in ('action', 'informational') then data ->> 'importance'
      when category in ('assignment', 'deadline', 'review', 'feedback') then 'action'
      when category = 'account'
        and lower(coalesce(data ->> 'title', '') || ' ' || coalesce(data ->> 'message', ''))
          ~ 'new registration|registered.+waiting|staff.+(approval|approve)' then 'action'
      else 'informational'
    end,
    '_cursorCreatedAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) order by created_at desc, entity_id desc), '[]'::jsonb)
  into v_page
  from filtered;

  v_has_more := jsonb_array_length(v_page) > v_limit;
  v_items := case when v_has_more then v_page - v_limit else v_page end;
  if v_has_more and jsonb_array_length(v_items) > 0 then
    v_next_cursor := jsonb_build_object(
      'createdAt', v_items -> (jsonb_array_length(v_items) - 1) ->> '_cursorCreatedAt',
      'id', v_items -> (jsonb_array_length(v_items) - 1) ->> 'id'
    );
  end if;
  select coalesce(jsonb_agg(item - '_cursorCreatedAt'), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(v_items) item;

  select count(*)::integer into v_unread_count
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'notification'
    and not case
      when entity.data ? 'readByUserIds' then coalesce(entity.data -> 'readByUserIds', '[]'::jsonb) @> jsonb_build_array(v_member_id)
      else coalesce(entity.data ->> 'isRead', 'false') = 'true'
    end;

  return jsonb_build_object(
    'ok', true,
    'memberId', v_member_id,
    'items', v_items,
    'unreadCount', v_unread_count,
    'nextCursor', v_next_cursor
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid notification query.');
end;
$$;

revoke all on function public.aitask_read_notifications(text, integer, timestamptz, text, boolean, text, text) from public, anon;
grant execute on function public.aitask_read_notifications(text, integer, timestamptz, text, boolean, text, text) to authenticated, service_role;

create or replace function public.aitask_set_notifications_read(
  p_workspace_id text,
  p_command_id uuid,
  p_notification_ids text[] default '{}'::text[],
  p_is_read boolean default true,
  p_mark_all boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id text := private.aitask_member_id(p_workspace_id);
  v_member_role text := private.aitask_member_role(p_workspace_id);
  v_member_client_key text := private.aitask_member_client_key(p_workspace_id);
  v_ids text[];
  v_expected_count integer;
  v_visible_count integer;
  v_row record;
  v_reads jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_unread_count integer := 0;
  v_workspace_version bigint;
  v_response jsonb;
begin
  if (select auth.uid()) is null or v_member_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if p_command_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A command ID is required.');
  end if;
  if p_mark_all and not p_is_read then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Mark all supports read state only.');
  end if;

  select coalesce(array_agg(distinct btrim(value) order by btrim(value)), '{}'::text[])
    into v_ids
  from unnest(coalesce(p_notification_ids, '{}'::text[])) value
  where btrim(value) <> '';
  v_expected_count := cardinality(v_ids);
  if not p_mark_all and (v_expected_count = 0 or v_expected_count > 500) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose between 1 and 500 notifications.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_response
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_member_id
    and receipt.command_id = p_command_id;
  if v_response is not null then return v_response || jsonb_build_object('replayed', true); end if;

  if not p_mark_all then
    select count(*)::integer into v_visible_count
    from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'notification'
      and entity.entity_id = any(v_ids)
      and (
        entity.target_user_id = v_member_id
        or entity.target_role = v_member_role
        or (entity.target_role = 'Admin' and private.aitask_is_admin(p_workspace_id))
        or (v_member_role = 'Client' and entity.target_client_key = v_member_client_key)
      );
    if v_visible_count <> v_expected_count then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'One or more notifications are unavailable.');
    end if;
  end if;

  for v_row in
    select
      entity.entity_id,
      entity.data,
      entity.target_user_id,
      entity.target_role,
      entity.target_client_key
    from public.aitask_entities entity
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'notification'
      and (p_mark_all or entity.entity_id = any(v_ids))
      and (
        entity.target_user_id = v_member_id
        or entity.target_role = v_member_role
        or (entity.target_role = 'Admin' and private.aitask_is_admin(p_workspace_id))
        or (v_member_role = 'Client' and entity.target_client_key = v_member_client_key)
      )
      and (
        case
          when entity.data ? 'readByUserIds' then coalesce(entity.data -> 'readByUserIds', '[]'::jsonb) @> jsonb_build_array(v_member_id)
          else coalesce((entity.data ->> 'isRead')::boolean, false)
        end
      ) is distinct from p_is_read
    order by entity.entity_id
    for update
  loop
    if not (v_row.data ? 'readByUserIds')
      and coalesce(v_row.data ->> 'isRead', 'false') = 'true' then
      select coalesce(jsonb_agg(member.id order by member.id), '[]'::jsonb)
        into v_reads
      from public.aitask_members member
      where member.workspace_id = p_workspace_id
        and (
          member.id = v_row.target_user_id
          or member.role = v_row.target_role
          or (v_row.target_role = 'Admin' and (member.role = 'Admin' or member.is_super_admin))
          or (member.role = 'Client'
            and lower(btrim(coalesce(member.client_name, ''))) = v_row.target_client_key)
        );
    else
      v_reads := case when jsonb_typeof(v_row.data -> 'readByUserIds') = 'array'
        then v_row.data -> 'readByUserIds' else '[]'::jsonb end;
    end if;

    select coalesce(jsonb_agg(read_id order by read_id), '[]'::jsonb)
      into v_reads
    from (
      select distinct read_id
      from jsonb_array_elements_text(v_reads) as receipt(read_id)
      where read_id <> v_member_id
      union
      select v_member_id where p_is_read
    ) reads;

    update public.aitask_entities entity
    set data = jsonb_set(entity.data, '{readByUserIds}', v_reads, true)
    where entity.workspace_id = p_workspace_id
      and entity.entity_type = 'notification'
      and entity.entity_id = v_row.entity_id
    returning jsonb_build_object(
      'id', entity.entity_id,
      'version', entity.version,
      'updatedAt', to_char(entity.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'isRead', p_is_read
    ) into v_response;
    v_changed := v_changed || jsonb_build_array(v_response);
  end loop;

  if jsonb_array_length(v_changed) > 0 then
    update public.aitask_workspaces workspace
    set version = workspace.version + 1, updated_at = now()
    where workspace.id = p_workspace_id
    returning workspace.version into v_workspace_version;
  else
    select workspace.version into v_workspace_version
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id;
  end if;

  select count(*)::integer into v_unread_count
  from public.aitask_entities entity
  where entity.workspace_id = p_workspace_id
    and entity.entity_type = 'notification'
    and (
      entity.target_user_id = v_member_id
      or entity.target_role = v_member_role
      or (entity.target_role = 'Admin' and private.aitask_is_admin(p_workspace_id))
      or (v_member_role = 'Client' and entity.target_client_key = v_member_client_key)
    )
    and not case
      when entity.data ? 'readByUserIds' then coalesce(entity.data -> 'readByUserIds', '[]'::jsonb) @> jsonb_build_array(v_member_id)
      else coalesce(entity.data ->> 'isRead', 'false') = 'true'
    end;

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'memberId', v_member_id,
    'workspaceVersion', v_workspace_version,
    'unreadCount', v_unread_count,
    'changedNotifications', v_changed
  );
  insert into public.aitask_command_receipts(workspace_id, actor_member_id, command_id, command_type, response)
  values (p_workspace_id, v_member_id, p_command_id, 'notification.read_state', v_response);
  return v_response;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid notification update.');
end;
$$;

revoke all on function public.aitask_set_notifications_read(text, uuid, text[], boolean, boolean) from public, anon;
grant execute on function public.aitask_set_notifications_read(text, uuid, text[], boolean, boolean) to authenticated, service_role;
