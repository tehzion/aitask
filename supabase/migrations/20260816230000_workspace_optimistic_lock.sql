-- Workspace-level optimistic lock.
--
-- Every command already carries per-entity expected versions. This migration
-- adds a workspace-wide precondition so multi-entity transactions (client plan
-- activation, deliverable chain generation, service commands) cannot commit
-- against a workspace that another client changed in the meantime.
--
-- The new functions are overloads: the previous 4-argument signatures remain
-- unchanged and continue to work for older clients, while current clients pass
-- p_expected_workspace_version and get an early CONFLICT response when the
-- workspace moved on.

create or replace function public.aitask_execute_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_actor_role text := private.aitask_member_role(p_workspace_id);
  v_actor_name text;
  v_super_admin boolean := private.aitask_is_super_admin(p_workspace_id);
  v_client_allowed boolean := false;
  v_operation jsonb;
  v_operations jsonb := p_operations;
  v_task_id text;
  v_task_data jsonb;
  v_notification_id text;
  v_now_text text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_title text;
  v_message text;
  v_workspace_version bigint;
  v_workspace_updated timestamptz;
begin
  if (select auth.uid()) is null or v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Workspace membership required.');
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed command operations.');
  end if;

  if p_expected_workspace_version is not null then
    select workspace.version, workspace.updated_at into v_workspace_version, v_workspace_updated
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if v_workspace_version is distinct from p_expected_workspace_version then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT',
        'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
        'conflict', jsonb_build_object(
          'entityType', 'workspace',
          'entityId', p_workspace_id,
          'expectedVersion', p_expected_workspace_version,
          'actualVersion', v_workspace_version,
          'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
        )
      );
    end if;
  end if;

  if p_command_type in ('member.manage', 'role.manage', 'registration.review', 'task_status.manage')
    and not v_super_admin then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if v_operation ->> 'kind' = 'member' then
      if v_operation ->> 'action' in ('insert', 'delete') then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Use the secure account service to add or remove members.');
      end if;
      if (v_operation ->> 'entityId') <> v_actor_id and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
      end if;
      if (v_operation ->> 'entityId') = v_actor_id and p_command_type <> 'member.update' and not v_super_admin then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid member update command.');
      end if;
    end if;
    if v_operation ->> 'kind' = 'entity'
      and v_operation ->> 'entityType' in ('registration', 'custom_role', 'task_status')
      and not v_super_admin then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Super Admin permission required.');
    end if;
  end loop;

  if v_actor_role = 'Client' and p_command_type in ('comment.add', 'approval.review') then
    v_client_allowed := private.aitask_client_command_allowed(p_workspace_id, p_command_type, p_operations);
    if not v_client_allowed then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This client feedback command is not allowed.');
    end if;

    if p_command_type = 'comment.add' then
      v_task_id := coalesce(nullif(p_operations -> 0 ->> 'parentId', ''), p_operations -> 0 -> 'data' ->> 'taskId');
    else
      select value ->> 'entityId' into v_task_id
      from jsonb_array_elements(p_operations) item(value)
      where value ->> 'entityType' = 'task' and value ->> 'action' = 'update'
      limit 1;
    end if;

    select task.data into v_task_data
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id and task.entity_type = 'task' and task.entity_id = v_task_id;
    select member.name into v_actor_name
    from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.id = v_actor_id;

    if p_command_type = 'comment.add' then
      v_title := 'Client Feedback';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' commented on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    elsif p_operations @? '$[*] ? (@.entityType == "approval" && @.data.status == "Approved")' then
      v_title := 'Client Approved Task';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' approved "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    else
      v_title := 'Client Requested Revision';
      v_message := left(coalesce(v_actor_name, 'Client'), 80) || ' requested changes on "' || left(coalesce(v_task_data ->> 'title', 'task'), 120) || '".';
    end if;

    v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
    v_operations := v_operations || jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
      'entityId', v_notification_id, 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', v_notification_id, 'targetRole', 'Admin', 'title', v_title,
        'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
        'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
        'iconType', case when p_command_type = 'comment.add' then 'status'
          when v_title = 'Client Approved Task' then 'success' else 'alert' end
      )
    ));

    if nullif(v_task_data ->> 'assignedTo', '') is not null then
      v_notification_id := 'N-' || replace(gen_random_uuid()::text, '-', '');
      v_operations := v_operations || jsonb_build_array(jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', v_notification_id, 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', v_notification_id, 'targetUserId', v_task_data ->> 'assignedTo', 'title', v_title,
          'message', v_message, 'route', jsonb_build_object('page', 'tasks', 'entityId', v_task_id),
          'isRead', false, 'readByUserIds', '[]'::jsonb, 'createdAt', v_now_text,
          'iconType', case when p_command_type = 'comment.add' then 'status'
            when v_title = 'Client Approved Task' then 'success' else 'alert' end
        )
      ));
    end if;
  end if;

  perform set_config('aitask.command_type', p_command_type, true);
  perform set_config('aitask.client_command_allowed', case when v_client_allowed then 'true' else 'false' end, true);
  return public.aitask_execute_command_legacy(p_workspace_id, p_command_id, p_command_type, v_operations);
end;
$$;

revoke all on function public.aitask_execute_command(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.aitask_execute_command(text, uuid, text, jsonb, bigint) to authenticated, service_role;

create or replace function public.aitask_execute_service_command(
  p_workspace_id text,
  p_command_id uuid,
  p_command_type text,
  p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text := private.aitask_member_id(p_workspace_id);
  v_role text := private.aitask_member_role(p_workspace_id);
  v_existing jsonb;
  v_op jsonb;
  v_type text;
  v_id text;
  v_action text;
  v_parent text;
  v_expected bigint;
  v_actual bigint;
  v_old jsonb;
  v_new jsonb;
  v_client_id text;
  v_version bigint;
  v_updated timestamptz;
  v_changed jsonb := '[]'::jsonb;
  v_deleted jsonb := '[]'::jsonb;
  v_workspace_version bigint;
  v_workspace_updated timestamptz;
  v_response jsonb;
begin
  if (select auth.uid()) is null or v_actor_id is null or v_role = 'Client' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service workspace membership required.');
  end if;
  if p_command_type not in ('service_package.manage', 'service_workflow.manage', 'client_plan.manage', 'service_cycle.manage', 'deliverable.manage', 'deliverable.workflow.generate', 'cycle_comment.manage', 'addon.manage')
    or jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) < 1 or jsonb_array_length(p_operations) > 500 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Invalid service command.');
  end if;

  if p_expected_workspace_version is not null then
    select workspace.version, workspace.updated_at into v_workspace_version, v_workspace_updated
    from public.aitask_workspaces workspace
    where workspace.id = p_workspace_id
    for update;
    if v_workspace_version is distinct from p_expected_workspace_version then
      return jsonb_build_object(
        'ok', false, 'code', 'CONFLICT',
        'error', 'The workspace changed since your last sync. Review the latest data before retrying.',
        'conflict', jsonb_build_object(
          'entityType', 'workspace',
          'entityId', p_workspace_id,
          'expectedVersion', p_expected_workspace_version,
          'actualVersion', v_workspace_version,
          'current', jsonb_build_object('workspaceVersion', v_workspace_version, 'updatedAt', v_workspace_updated)
        )
      );
    end if;
  end if;

  if (p_command_type = 'service_package.manage' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCatalog'))
    or (p_command_type = 'service_workflow.manage' and not private.aitask_has_permission(p_workspace_id, 'manageTaskTemplates'))
    or (p_command_type in ('client_plan.manage','addon.manage') and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans'))
    or (p_command_type = 'deliverable.workflow.generate' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles')) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'The required service capability is missing.');
  end if;
  perform set_config('aitask.command_type', p_command_type, true);
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id || ':' || p_command_id::text, 0));
  select response into v_existing from public.aitask_command_receipts
    where workspace_id = p_workspace_id and actor_member_id = v_actor_id and command_id = p_command_id;
  if v_existing is not null then return v_existing || jsonb_build_object('replayed', true); end if;

  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type := v_op ->> 'entityType'; v_id := v_op ->> 'entityId'; v_action := v_op ->> 'action';
    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    v_expected := coalesce((v_op ->> 'expectedVersion')::bigint, 0);
    if v_op ->> 'kind' <> 'entity' or v_action not in ('insert','update','delete')
      or v_type not in ('client','task','service_package','service_workflow_template','service_pricing_snapshot','client_plan','service_cycle','deliverable','cycle_comment','addon') or coalesce(v_id,'') = '' then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Malformed service operation.');
    end if;
    select version, data into v_actual, v_old from public.aitask_entities
      where workspace_id = p_workspace_id and entity_type = v_type and entity_id = v_id;
    if v_action = 'insert' and v_actual is not null then
      return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'The record already exists.');
    elsif v_action in ('update','delete') and v_actual is null then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'error', 'The record no longer exists.');
    elsif v_action in ('update','delete') and v_actual <> v_expected then
      return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'error', 'A newer record is available.', 'conflict',
        jsonb_build_object('entityType',v_type,'entityId',v_id,'expectedVersion',v_expected,'actualVersion',v_actual,'current',v_old));
    end if;
    v_client_id := coalesce(v_new ->> 'clientId', v_old ->> 'clientId');
    if v_type = 'client' and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Client plan management is required.');
    elsif v_type = 'service_package' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCatalog') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service catalog management is required.');
    elsif v_type = 'service_workflow_template' and not private.aitask_has_permission(p_workspace_id, 'manageTaskTemplates') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Task template management is required.');
    elsif v_type = 'service_pricing_snapshot' and not private.aitask_has_permission(p_workspace_id, 'viewServicePrices') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Service price access is required.');
    elsif v_type in ('client_plan','addon') and not private.aitask_has_permission(p_workspace_id, 'manageClientPlans') then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Client plan management is required.');
    elsif v_type in ('service_cycle','deliverable','cycle_comment')
      and not private.aitask_can_access_service_client(p_workspace_id, v_client_id) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'This client is outside your assigned scope.');
    elsif v_type = 'cycle_comment' and v_action = 'insert' and v_new ->> 'userId' <> v_actor_id then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Comments must belong to the signed-in member.');
    elsif v_type = 'task' and p_command_type = 'deliverable.workflow.generate' and not (
      v_action = 'insert'
      and coalesce((v_new ->> 'generatedFromDeliverable')::boolean,false)
      and coalesce(v_new ->> 'createdBy','') = v_actor_id
      and coalesce(v_new ->> 'assignedTo','') = ''
      and coalesce(v_new ->> 'deliverableId','') <> ''
      and coalesce(v_new ->> 'serviceCycleId','') <> ''
      and coalesce(v_new ->> 'visibility','internal') in ('internal','client-visible')
      and private.aitask_can_access_service_client(p_workspace_id, v_client_id)
    ) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Invalid generated workflow task.');
    elsif v_type = 'task' and p_command_type <> 'deliverable.workflow.generate' and not private.aitask_can_mutate_entity(p_workspace_id,v_action,v_type,v_id,v_parent,v_old,v_new) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'You cannot update this task.');
    end if;
    if v_type in ('client_plan','service_cycle') and (
      coalesce((v_new ->> 'discountValue')::integer,0) <> 0
      or coalesce((v_new ->> 'taxRateBps')::integer,0) <> 0
      or exists (select 1 from jsonb_array_elements(coalesce(v_new -> 'serviceItems','[]'::jsonb)) item where coalesce((item ->> 'unitPriceMinor')::integer,0) <> 0)
    ) then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Operational service rows cannot contain pricing.');
    elsif v_type = 'addon' and coalesce((v_new ->> 'unitPriceMinor')::integer,0) <> 0 then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'error', 'Operational add-on rows cannot contain pricing.');
    end if;
    if v_role = 'Staff' and not private.aitask_has_permission(p_workspace_id, 'manageServiceCycles') and v_action = 'update' then
      if v_type = 'service_cycle' and (v_old - array['status','publishedAt','updatedAt']::text[]) <> (v_new - array['status','publishedAt','updatedAt']::text[]) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Only cycle publication fields may be changed.');
      elsif v_type = 'deliverable' and (v_old - array['status','taskIds','workflowGeneratedAt','workflowGenerationId','updatedAt']::text[]) <> (v_new - array['status','taskIds','workflowGeneratedAt','workflowGenerationId','updatedAt']::text[]) then
        return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Only deliverable execution fields may be changed.');
      end if;
    end if;
    v_actual := null; v_old := null;
  end loop;

  for v_op in select value from jsonb_array_elements(p_operations) loop
    v_type := v_op ->> 'entityType'; v_id := v_op ->> 'entityId'; v_action := v_op ->> 'action';
    v_parent := nullif(v_op ->> 'parentId', ''); v_new := coalesce(v_op -> 'data', '{}'::jsonb);
    if v_action = 'insert' then
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(p_workspace_id,v_type,v_id,v_parent,v_new) returning version,updated_at into v_version,v_updated;
    elsif v_action = 'update' then
      update public.aitask_entities set parent_id=v_parent,data=v_new
      where workspace_id=p_workspace_id and entity_type=v_type and entity_id=v_id returning version,updated_at into v_version,v_updated;
    else
      delete from public.aitask_entities where workspace_id=p_workspace_id and entity_type=v_type and entity_id=v_id;
      v_deleted := v_deleted || jsonb_build_array(jsonb_build_object('entityType',v_type,'entityId',v_id));
    end if;
    insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata)
    values(p_workspace_id,v_actor_id,p_command_id,v_action,v_type,v_id,private.aitask_json_changed_fields('{}'::jsonb,v_new),jsonb_build_object('parentId',v_parent));
    if v_action <> 'delete' then v_changed := v_changed || jsonb_build_array(jsonb_build_object('entityType',v_type,'entityId',v_id,'version',v_version,'updatedAt',v_updated)); end if;
  end loop;
  update public.aitask_workspaces set version=version+1,updated_at=now() where id=p_workspace_id returning version into v_workspace_version;
  v_response := jsonb_build_object('ok',true,'commandId',p_command_id,'workspaceVersion',v_workspace_version,'changed',v_changed,'deleted',v_deleted,'refreshScope',case when jsonb_array_length(p_operations)>20 then 'workspace' else 'rows' end);
  insert into public.aitask_command_receipts(workspace_id,actor_member_id,command_id,command_type,response)
  values(p_workspace_id,v_actor_id,p_command_id,p_command_type,v_response);
  return v_response;
exception when check_violation or not_null_violation or invalid_text_representation then
  return jsonb_build_object('ok',false,'code','VALIDATION','error','The service command contains invalid data.');
end;
$$;

revoke all on function public.aitask_execute_service_command(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.aitask_execute_service_command(text, uuid, text, jsonb, bigint) to authenticated, service_role;

create or replace function public.aitask_generate_deliverable_task_chain(
  p_workspace_id text, p_command_id uuid, p_operations jsonb,
  p_expected_workspace_version bigint
)
returns jsonb language sql security definer set search_path='' as $$
  select public.aitask_execute_service_command(p_workspace_id, p_command_id, 'deliverable.workflow.generate', p_operations, p_expected_workspace_version);
$$;

revoke all on function public.aitask_generate_deliverable_task_chain(text, uuid, jsonb, bigint) from public, anon;
grant execute on function public.aitask_generate_deliverable_task_chain(text, uuid, jsonb, bigint) to authenticated, service_role;
