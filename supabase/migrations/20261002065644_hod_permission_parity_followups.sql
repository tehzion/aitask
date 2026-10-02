-- Align HOD authorization with canonical departments and notification reads.
-- Preserve creator ownership, role normalization and existing RPC grants.

create or replace function private.aitask_task_department(p_department text)
returns text language sql immutable set search_path = '' as $$
  select case lower(regexp_replace(btrim(coalesce(p_department, '')), '[\s_-]+', ' ', 'g'))
    when 'operation' then 'Operation'
    when 'operations' then 'Operation'
    when 'management' then 'Management'
    when 'videoshooting' then 'Video Shooting'
    when 'video shooting' then 'Video Shooting'
    when 'shooting' then 'Video Shooting'
    when 'videography' then 'Video Shooting'
    when 'editor' then 'Video Editor'
    when 'video editor' then 'Video Editor'
    when 'video editing' then 'Video Editor'
    when 'editing' then 'Video Editor'
    when 'ads management' then 'Ads Management'
    when 'ads' then 'Ads Management'
    when 'advertising' then 'Ads Management'
    when 'account & finance' then 'Account & Finance'
    when 'account' then 'Account & Finance'
    when 'finance' then 'Account & Finance'
    when 'account and finance' then 'Account & Finance'
    when 'designer' then 'Designer'
    when 'design' then 'Designer'
    when 'graphic' then 'Designer'
    else null
  end;
$$;

CREATE OR REPLACE FUNCTION private.aitask_can_edit_task(p_workspace_id text, p_task_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select private.aitask_is_super_admin(p_workspace_id)
      or (
        private.aitask_member_role(p_workspace_id) in ('Project Manager', 'Staff')
        and (
          task.assigned_to = private.aitask_member_id(p_workspace_id)
          or task.created_by = private.aitask_member_id(p_workspace_id)
        )
      )
      or (
        private.aitask_member_role(p_workspace_id) = 'Project Manager'
        and (
          exists (
            select 1
            from public.aitask_entities client
            where client.workspace_id = p_workspace_id
              and client.entity_type = 'client'
              and client.client_key = task.client_key
              and client.created_by = private.aitask_member_id(p_workspace_id)
          )
          or exists (
            select 1
            from public.aitask_entities project
            where project.workspace_id = p_workspace_id
              and project.entity_type = 'project'
              and project.entity_id = task.parent_id
              and project.created_by = private.aitask_member_id(p_workspace_id)
          )
        )
      )
      or (
        private.aitask_role_is_department_scoped(p_workspace_id)
        and private.aitask_task_department(task.data ->> 'department') = any(coalesce((
          select member.departments
          from public.aitask_members member
          where member.workspace_id = p_workspace_id
            and member.auth_user_id = (select auth.uid())
        ), array[]::text[]))
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$function$;

CREATE OR REPLACE FUNCTION private.aitask_can_view_task(p_workspace_id text, p_task_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case
      when private.aitask_is_super_admin(p_workspace_id) then true
      when private.aitask_member_role(p_workspace_id) = 'Project Manager' then
        task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities client
          where client.workspace_id = p_workspace_id
            and client.entity_type = 'client'
            and client.client_key = task.client_key
            and client.created_by = private.aitask_member_id(p_workspace_id)
        )
        or exists (
          select 1
          from public.aitask_entities project
          where project.workspace_id = p_workspace_id
            and project.entity_type = 'project'
            and project.entity_id = task.parent_id
            and project.created_by = private.aitask_member_id(p_workspace_id)
        )
      when private.aitask_member_role(p_workspace_id) = 'Staff' then
        (
          not private.aitask_is_hod(p_workspace_id)
          and private.aitask_has_permission(p_workspace_id, 'viewAllTasks')
        )
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
        or task.created_by = private.aitask_member_id(p_workspace_id)
        or (
          private.aitask_role_is_department_scoped(p_workspace_id)
          and private.aitask_task_department(task.data ->> 'department') = any(coalesce((
            select member.departments
            from public.aitask_members member
            where member.workspace_id = p_workspace_id
              and member.auth_user_id = (select auth.uid())
          ), array[]::text[]))
        )
      when private.aitask_member_role(p_workspace_id) = 'Client' then
        task.client_key = private.aitask_member_client_key(p_workspace_id)
      else false
    end
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$function$;

do $$
declare definition text; updated text;
begin
  definition := pg_get_functiondef('private.aitask_can_mutate_entity(text,text,text,text,text,jsonb,jsonb)'::regprocedure);
  updated := replace(definition,
    'or coalesce(p_old_data ->> ''targetRole'', '''') = v_role',
    'or coalesce(p_old_data ->> ''targetRole'', '''') = v_role
      or (private.aitask_is_hod(p_workspace_id) and p_old_data ->> ''targetRole'' = ''HOD'')');
  if updated = definition then
    raise exception 'Expected notification visibility predicate is missing; review authorization before applying.';
  end if;
  execute updated;
end;
$$;
