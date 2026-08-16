-- Notification feed cursor precision.
--
-- aitask_entities.created_at is microsecond-precision, but the paginated feed
-- truncated its cursor to milliseconds. Notifications created in the same
-- transaction share the same millisecond, so the keyset cursor could silently
-- skip tied rows past a page boundary. This migration re-emits the feed with
-- full microsecond precision in the cursor and item timestamps.

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
    'updatedAt', to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'title', left(coalesce(data ->> 'title', ''), 240),
    'message', left(coalesce(data ->> 'message', ''), 2000),
    'route', coalesce(data -> 'route', '{}'::jsonb),
    'isRead', is_read,
    'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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
    '_cursorCreatedAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
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
