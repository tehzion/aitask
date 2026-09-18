-- Administrators have no department limit: they do not require a department.
-- Internal members (Staff/HOD) still require at least one valid department.

create or replace function private.aitask_normalize_member_departments(
  p_role text,
  p_departments text[]
)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_department text;
  v_canonical text;
  v_result text[] := '{}'::text[];
  v_order text[] := array[
    'Operation', 'Management', 'Video Shooting', 'Video Editor',
    'Ads Management', 'Account & Finance', 'Designer'
  ];
begin
  if p_role = 'Client' then
    if cardinality(p_departments) <> 1 or lower(btrim(p_departments[1])) <> 'client' then
      raise check_violation using message = 'Client members must belong only to Client.';
    end if;
    return array['Client'];
  end if;

  if p_role not in ('Admin', 'Staff') or coalesce(cardinality(p_departments), 0) > 7 then
    raise check_violation using message = 'Internal members have an invalid department set.';
  end if;
  if p_role = 'Staff' and coalesce(cardinality(p_departments), 0) < 1 then
    raise check_violation using message = 'Internal members require at least one valid department.';
  end if;

  foreach v_department in array coalesce(p_departments, '{}'::text[]) loop
    v_canonical := case lower(regexp_replace(btrim(coalesce(v_department, '')), '[\s_-]+', ' ', 'g'))
      when 'operation' then 'Operation'
      when 'management' then 'Management'
      when 'videoshooting' then 'Video Shooting'
      when 'video shooting' then 'Video Shooting'
      when 'editor' then 'Video Editor'
      when 'video editor' then 'Video Editor'
      when 'ads management' then 'Ads Management'
      when 'account & finance' then 'Account & Finance'
      when 'designer' then 'Designer'
      else null
    end;
    if v_canonical is null then
      raise check_violation using message = 'Invalid internal department.';
    end if;
    if v_canonical = any(v_result) then
      raise check_violation using message = 'Duplicate departments are not allowed.';
    end if;
    v_result := array_append(v_result, v_canonical);
  end loop;

  select coalesce(array_agg(item order by array_position(v_order, item)), '{}'::text[])
  into v_result
  from unnest(v_result) item;
  return v_result;
end;
$$;

revoke all on function private.aitask_normalize_member_departments(text, text[])
  from public, anon, authenticated;

create or replace function public.aitask_update_member_role(
  p_workspace_id text,
  p_command_id uuid,
  p_member_id text,
  p_role text,
  p_custom_role_id text,
  p_client_name text,
  p_departments text[],
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.aitask_members%rowtype;
  v_member public.aitask_members%rowtype;
  v_custom_role_name text;
  v_department text;
  v_departments text[];
  v_workspace_version bigint;
  v_response jsonb;
begin
  if p_command_id is null or nullif(btrim(coalesce(p_member_id, '')), '') is null
    or coalesce(p_expected_version, 0) < 1 or nullif(btrim(coalesce(p_role, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'A command, member, role, and expected version are required.');
  end if;
  if p_role not in ('Admin', 'Staff', 'Client') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose a valid system role.');
  end if;

  select member.* into v_actor
  from public.aitask_members member
  where member.workspace_id = p_workspace_id
    and member.auth_user_id = (select auth.uid())
    and member.is_super_admin = true;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Boss Koo permission required.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select receipt.response into v_response
  from public.aitask_command_receipts receipt
  where receipt.workspace_id = p_workspace_id
    and receipt.actor_member_id = v_actor.id
    and receipt.command_id = p_command_id;
  if v_response is not null then return v_response || jsonb_build_object('replayed', true); end if;

  select member.* into v_member
  from public.aitask_members member
  where member.workspace_id = p_workspace_id and member.id = p_member_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'Member account was not found.');
  end if;
  if v_member.is_super_admin then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Boss Koo keeps permanent super admin permissions.');
  end if;
  if v_member.version <> p_expected_version then
    return jsonb_build_object(
      'ok', false, 'code', 'CONFLICT', 'error', 'A newer member record is available.',
      'conflict', jsonb_build_object(
        'entityType', 'member', 'entityId', p_member_id,
        'expectedVersion', p_expected_version, 'actualVersion', v_member.version,
        'current', jsonb_build_object('role', v_member.role, 'customRoleId', v_member.custom_role_id)
      )
    );
  end if;

  v_custom_role_name := null;
  if p_role = 'Client' then
    if nullif(btrim(coalesce(p_client_name, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Choose a company for this client account.');
    end if;
    v_department := 'Client';
    v_departments := array['Client'];
  else
    if nullif(btrim(coalesce(p_custom_role_id, '')), '') is not null then
      select entity.data ->> 'name' into v_custom_role_name
      from public.aitask_entities entity
      where entity.workspace_id = p_workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = p_custom_role_id
        and coalesce(entity.data ->> 'baseRole', '') = p_role
      limit 1;
      if v_custom_role_name is null then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'This role can only be assigned to a matching member role.');
      end if;
    end if;
    begin
      v_departments := private.aitask_normalize_member_departments(p_role, coalesce(p_departments, array[]::text[]));
    exception when check_violation then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', SQLERRM);
    end;
    v_department := case
      when p_role = 'Admin' then 'Management'
      else coalesce(v_departments[1], 'Designer')
    end;
  end if;

  update public.aitask_members
  set role = p_role,
      department = v_department,
      departments = v_departments,
      client_name = case when p_role = 'Client' then btrim(p_client_name) else null end,
      custom_role_id = case when p_role = 'Client' then null else nullif(btrim(coalesce(p_custom_role_id, '')), '') end,
      custom_role_name = v_custom_role_name,
      permissions = '{}'::jsonb,
      version = version + 1,
      updated_at = now()
  where workspace_id = p_workspace_id and id = p_member_id
  returning * into v_member;

  update public.aitask_workspaces
  set version = version + 1, updated_at = now()
  where id = p_workspace_id
  returning version into v_workspace_version;

  insert into public.aitask_audit_events(
    workspace_id, actor_member_id, command_id, action, entity_type, entity_id, changed_fields
  ) values (
    p_workspace_id, v_actor.id, p_command_id, 'member.role.update',
    'member', p_member_id, array['role', 'department', 'departments', 'client_name', 'custom_role_id', 'custom_role_name', 'permissions']
  );

  v_response := jsonb_build_object(
    'ok', true,
    'commandId', p_command_id,
    'workspaceVersion', v_workspace_version,
    'member', jsonb_build_object(
      'id', v_member.id,
      'role', v_member.role,
      'customRoleId', v_member.custom_role_id,
      'customRoleName', v_member.custom_role_name,
      'clientName', v_member.client_name,
      'departments', v_member.departments,
      'department', v_member.department,
      'version', v_member.version,
      'updated_at', v_member.updated_at
    ),
    'changed', jsonb_build_array(jsonb_build_object(
      'entityType', 'member', 'entityId', v_member.id,
      'version', v_member.version, 'updatedAt', v_member.updated_at
    ))
  );

  insert into public.aitask_command_receipts(
    workspace_id, actor_member_id, command_id, command_type, response
  ) values (p_workspace_id, v_actor.id, p_command_id, 'member.role.update', v_response);
  return v_response;
end;
$$;

revoke all on function public.aitask_update_member_role(text, uuid, text, text, text, text, text[], bigint)
  from public, anon;
grant execute on function public.aitask_update_member_role(text, uuid, text, text, text, text, text[], bigint)
  to authenticated, service_role;
