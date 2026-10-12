-- Department oversight is editable, but cannot authorize destructive task
-- actions without creator/current-assignee responsibility and delegation rights.
create or replace function private.aitask_can_delete_task(p_workspace_id text, p_task_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.aitask_can_edit_task(p_workspace_id, p_task_id)
      and (
        private.aitask_is_super_admin(p_workspace_id)
        or private.aitask_member_role(p_workspace_id) <> 'Staff'
        or not private.aitask_role_is_department_scoped(p_workspace_id)
        or (
          private.aitask_has_permission(p_workspace_id, 'manageCreatedTasks')
          and (task.created_by = private.aitask_member_id(p_workspace_id)
            or task.assigned_to = private.aitask_member_id(p_workspace_id))
          and private.aitask_task_department(task.data ->> 'department') = any(coalesce((
            select member.departments from public.aitask_members member
            where member.workspace_id = p_workspace_id
              and member.auth_user_id = (select auth.uid())
          ), array[]::text[]))
        )
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id and task.entity_type = 'task'
      and task.entity_id = p_task_id
  ), false);
$$;
revoke all on function private.aitask_can_delete_task(text, text) from public, anon, authenticated, service_role;

-- Preserve every other authorization branch, including notification and
-- service guards added by earlier migrations. The Client projection migration
-- can wrap this validator, retaining the original under a different name;
-- update that retained body so both RLS and the wrapper enforce deletion.
do $$
declare
  definition text;
  target regprocedure := 'private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure;
  predicate text := 'when p_entity_type = ''task'' then private.aitask_can_edit_task(p_workspace_id, p_entity_id)';
begin
  definition := pg_get_functiondef(target);
  if position(predicate in definition) = 0
    and position('private.aitask_can_mutate_entity_before_client_projection(' in definition) > 0 then
    target := to_regprocedure('private.aitask_can_mutate_entity_before_client_projection(text,text,text,text,text,jsonb,jsonb)');
    if target is null then
      raise exception 'Client projection wrapper is missing its retained validator.';
    end if;
    definition := pg_get_functiondef(target);
  end if;
  if (length(definition) - length(replace(definition, predicate, ''))) / length(predicate) <> 1 then
    raise exception 'Expected exactly one task deletion predicate; review authorization before applying.';
  end if;
  execute replace(definition, predicate,
    'when p_entity_type = ''task'' then private.aitask_can_delete_task(p_workspace_id, p_entity_id)');
end;
$$;
