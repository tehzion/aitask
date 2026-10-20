-- Project management completion: scoped PM account administration, lifecycle,
-- optional milestones, and project approval defaults. Projects remain audited
-- JSON entities so existing identifiers, reports, and RLS relationships remain
-- intact. Existing task approval flags are deliberately not rewritten.
begin;

-- Existing projects get permissive defaults. This does not opt any legacy task
-- into inheritance: a task must explicitly set approvalMode = "inherit".
update public.aitask_entities
set data = data
  || case when data ? 'status' then '{}'::jsonb else jsonb_build_object('status','Active') end
  || case when data ? 'defaultApprovalMode' then '{}'::jsonb else jsonb_build_object('defaultApprovalMode','none') end
  || case when data ? 'requireClearClosureChecklist' then '{}'::jsonb else jsonb_build_object('requireClearClosureChecklist',false) end
  || case when data ? 'staffMemberIds' then '{}'::jsonb else jsonb_build_object('staffMemberIds','[]'::jsonb) end
  || case when data ? 'memberResponsibilities' then '{}'::jsonb else jsonb_build_object('memberResponsibilities','{}'::jsonb) end
  || case when data ? 'milestones' then '{}'::jsonb else jsonb_build_object('milestones','[]'::jsonb) end
where entity_type='project';

create or replace function private.aitask_project_is_closed(p_workspace text,p_project text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select project.data->>'status'='Closed'
    from public.aitask_entities project
    where project.workspace_id=p_workspace and project.entity_type='project' and project.entity_id=p_project),false);
$$;
revoke all on function private.aitask_project_is_closed(text,text) from public,anon,authenticated,service_role;

-- Explicit Staff membership permits viewing the project and its milestones
-- before the first task is assigned, without granting access to other tasks.
create or replace function private.aitask_can_view_project(p_workspace_id text,p_project_id text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select case private.aitask_member_role(p_workspace_id)
    when 'Project Manager' then private.aitask_is_super_admin(p_workspace_id)
      or private.aitask_project_manager_is_assigned(p_workspace_id,project.entity_id)
    when 'Client' then project.client_key=private.aitask_member_client_key(p_workspace_id)
    when 'Staff' then
      (not private.aitask_is_hod(p_workspace_id) and coalesce(project.data->'staffMemberIds','[]'::jsonb)?private.aitask_member_id(p_workspace_id))
      or (private.aitask_is_hod(p_workspace_id) and private.aitask_hod_is_assigned(p_workspace_id,project.entity_id))
      or (project.created_by=private.aitask_member_id(p_workspace_id)
        and (not private.aitask_is_hod(p_workspace_id) or not(project.data?'hodMemberIds')
          or private.aitask_hod_is_assigned(p_workspace_id,project.entity_id)))
      or exists(select 1 from public.aitask_entities task where task.workspace_id=p_workspace_id
        and task.entity_type='task' and coalesce(nullif(btrim(task.data->>'projectId'),''),task.parent_id)=p_project_id
        and private.aitask_can_view_task(p_workspace_id,task.entity_id))
      or (not(project.data?'staffMemberIds') and not private.aitask_is_hod(p_workspace_id) and private.aitask_has_permission(p_workspace_id,'createTasks')
        and (project.created_by is null or exists(select 1 from public.aitask_members creator
          where creator.workspace_id=p_workspace_id and creator.id=project.created_by and creator.is_super_admin)))
    else false end from public.aitask_entities project where project.workspace_id=p_workspace_id
      and project.entity_type='project' and project.entity_id=p_project_id limit 1),false);
$$;

create or replace function private.aitask_effective_task_approval_mode(p_workspace text,p_task jsonb)
returns text language sql stable security definer set search_path='' as $$
  select case
    when p_task ? 'approvalMode' and p_task->>'approvalMode'='inherit' then coalesce((
      select case when project.data->>'defaultApprovalMode' in('none','hod','pm')
        then project.data->>'defaultApprovalMode' else 'none' end
      from public.aitask_entities project
      where project.workspace_id=p_workspace and project.entity_type='project'
        and project.entity_id=nullif(btrim(p_task->>'projectId'),'')), 'none')
    when p_task ? 'approvalMode' and p_task->>'approvalMode' in('none','hod','pm') then p_task->>'approvalMode'
    when coalesce((p_task->>'requiresInternalApproval')::boolean,true) then 'hod'
    else 'none'
  end;
$$;
revoke all on function private.aitask_effective_task_approval_mode(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_validate_project_management()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_status text;
  v_old_status text;
  v_item jsonb;
  v_id text;
  v_seen text[]:=array[]::text[];
  v_invalid boolean;
  v_outstanding integer:=0;
  v_pending integer:=0;
  v_overdue integer:=0;
  v_incomplete integer:=0;
begin
  if new.entity_type<>'project' then return new; end if;
  new.data:=coalesce(new.data,'{}'::jsonb);
  if not(new.data ? 'status') then new.data:=new.data||jsonb_build_object('status','Active'); end if;
  if not(new.data ? 'defaultApprovalMode') then new.data:=new.data||jsonb_build_object('defaultApprovalMode','none'); end if;
  if not(new.data ? 'requireClearClosureChecklist') then new.data:=new.data||jsonb_build_object('requireClearClosureChecklist',false); end if;
  if not(new.data ? 'staffMemberIds') then new.data:=new.data||jsonb_build_object('staffMemberIds','[]'::jsonb); end if;
  if not(new.data ? 'memberResponsibilities') then new.data:=new.data||jsonb_build_object('memberResponsibilities','{}'::jsonb); end if;
  if not(new.data ? 'milestones') then new.data:=new.data||jsonb_build_object('milestones','[]'::jsonb); end if;

  v_status:=new.data->>'status';
  v_old_status:=case when tg_op='UPDATE' then coalesce(old.data->>'status','Active') else 'Active' end;
  if v_status not in('Active','Completed','Closed') then raise check_violation using message='Choose a valid project status.'; end if;
  if new.data->>'defaultApprovalMode' not in('none','hod','pm') then raise check_violation using message='Choose a valid project approval default.'; end if;
  if jsonb_typeof(new.data->'requireClearClosureChecklist')<>'boolean' then raise check_violation using message='The closure requirement must be true or false.'; end if;
  if jsonb_typeof(new.data->'staffMemberIds')<>'array' or jsonb_typeof(new.data->'memberResponsibilities')<>'object'
    or jsonb_typeof(new.data->'milestones')<>'array' then raise check_violation using message='Project team and milestone data is invalid.'; end if;

  select exists(select 1 from jsonb_array_elements_text(new.data->'staffMemberIds') assignment(member_id)
    left join public.aitask_members member on member.workspace_id=new.workspace_id and member.id=assignment.member_id
    left join auth.users auth_user on auth_user.id=member.auth_user_id
    where member.id is null or member.role<>'Staff' or member.is_super_admin
      or auth_user.id is null or auth_user.banned_until>now()) into v_invalid;
  if v_invalid then raise check_violation using message='Project staff assignments must reference active Staff accounts.'; end if;

  for v_item in select value from jsonb_array_elements(new.data->'milestones') loop
    if jsonb_typeof(v_item)<>'object' or nullif(btrim(v_item->>'id'),'') is null
      or nullif(btrim(v_item->>'name'),'') is null or length(v_item->>'name')>160
      or coalesce(v_item->>'targetDate','') !~ '^\d{4}-\d{2}-\d{2}$'
      or v_item->>'status' not in('Not Started','In Progress','Completed','Delayed') then
      raise check_violation using message='A project milestone is invalid.';
    end if;
    v_id:=v_item->>'id';
    if v_id=any(v_seen) then raise check_violation using message='Milestone identifiers must be unique.'; end if;
    v_seen:=array_append(v_seen,v_id);
    if nullif(v_item->>'responsiblePersonId','') is not null and not(
      new.data->'projectManagerIds' ? (v_item->>'responsiblePersonId')
      or new.data->'hodMemberIds' ? (v_item->>'responsiblePersonId')
      or new.data->'staffMemberIds' ? (v_item->>'responsiblePersonId')) then
      raise check_violation using message='Milestone responsibility must stay within the project team.';
    end if;
  end loop;

  if tg_op='UPDATE' and v_status is distinct from v_old_status then
    if (select auth.uid()) is not null and not private.aitask_can_manage_project(new.workspace_id,new.entity_id) then
      raise check_violation using message='Only Boss Koo or an assigned Project Manager can change project status.';
    end if;
    if not ((v_old_status='Active' and v_status='Completed') or (v_old_status='Completed' and v_status in('Active','Closed'))
      or (v_old_status='Closed' and v_status='Active')) then
      raise check_violation using message='Use the Active, Completed, and Closed project lifecycle in order.';
    end if;
    if v_status='Closed' then
      select count(*) filter(where task.data->>'status' not in('Completed','Cancelled')),
        count(*) filter(where task.data->>'status'='Waiting Approval'),
        count(*) filter(where task.data->>'status' not in('Completed','Cancelled') and nullif(task.data->>'dueDate','') is not null and (task.data->>'dueDate')::date<current_date)
      into v_outstanding,v_pending,v_overdue
      from public.aitask_entities task where task.workspace_id=new.workspace_id and task.entity_type='task' and task.parent_id=new.entity_id;
      select count(*) into v_incomplete from jsonb_array_elements(new.data->'milestones') item where item->>'status'<>'Completed';
      if (new.data->>'requireClearClosureChecklist')::boolean and (v_outstanding+v_pending+v_overdue+v_incomplete)>0 then
        raise check_violation using message='Resolve the required closure checklist before closing this project.';
      end if;
      new.data:=new.data||jsonb_build_object('closedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'closedBy',private.aitask_member_id(new.workspace_id),'closureWarnings',jsonb_build_object('outstandingTasks',v_outstanding,'pendingApprovals',v_pending,'overdueTasks',v_overdue,'incompleteMilestones',v_incomplete));
    elsif v_status='Completed' then
      new.data:=new.data||jsonb_build_object('completedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'completedBy',private.aitask_member_id(new.workspace_id));
    elsif v_old_status in('Completed','Closed') then
      new.data:=new.data||jsonb_build_object('reopenedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'reopenedBy',private.aitask_member_id(new.workspace_id));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_validate_project_management() from public,anon,authenticated,service_role;
drop trigger if exists aitask_01_validate_project_management on public.aitask_entities;
create trigger aitask_01_validate_project_management before insert or update of data on public.aitask_entities
for each row execute function private.aitask_validate_project_management();

-- Replace the earlier membership trigger with a direct old-row authority check.
-- This avoids re-querying a row while it is being updated and extends the same
-- validation to Staff membership.
create or replace function private.aitask_guard_project_membership_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_workspace text:=coalesce(new.workspace_id,old.workspace_id);
  v_actor text:=private.aitask_member_id(coalesce(new.workspace_id,old.workspace_id));
  v_role text:=private.aitask_member_role(coalesce(new.workspace_id,old.workspace_id));
  v_data jsonb:=case when tg_op='DELETE' then old.data else new.data end;
  v_authority_data jsonb:=case when tg_op='INSERT' then new.data else old.data end;
  v_pm jsonb; v_hod jsonb; v_staff jsonb; v_invalid boolean;
begin
  if (tg_op='INSERT' and new.entity_type<>'project') or (tg_op='DELETE' and old.entity_type<>'project')
    or (tg_op='UPDATE' and old.entity_type<>'project' and new.entity_type<>'project') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if (select auth.uid()) is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  if not private.aitask_is_super_admin(v_workspace) then
    if tg_op='INSERT' then
      if coalesce(new.data->>'createdBy','')<>v_actor then raise check_violation using message='A project creator must own the new project.'; end if;
      if v_role='Project Manager' then new.data:=jsonb_set(new.data,'{projectManagerIds}',jsonb_build_array(v_actor),true);
      elsif v_role in('HOD','Staff') then new.data:=jsonb_set(new.data,'{projectManagerIds}','[]'::jsonb,true);
      else raise check_violation using message='Your role cannot create projects.';
      end if;
      v_data:=new.data;
    elsif not((v_role='Project Manager' and jsonb_typeof(v_authority_data->'projectManagerIds')='array' and v_authority_data->'projectManagerIds'?v_actor)
      or (v_role in('HOD','Staff') and old.created_by=v_actor)) then
      raise check_violation using message='This project is outside your assigned scope.';
    end if;
    if tg_op='UPDATE' and new.data->'projectManagerIds' is distinct from old.data->'projectManagerIds' then raise check_violation using message='Only Boss Koo can change Project Manager assignments.'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  v_pm:=coalesce(v_data->'projectManagerIds','[]'::jsonb); v_hod:=coalesce(v_data->'hodMemberIds','[]'::jsonb); v_staff:=coalesce(v_data->'staffMemberIds','[]'::jsonb);
  if jsonb_typeof(v_pm)<>'array' or jsonb_typeof(v_hod)<>'array' or jsonb_typeof(v_staff)<>'array' then raise check_violation using message='Project membership assignments must be lists.'; end if;
  select exists(select 1 from jsonb_array_elements_text(v_pm) a(id) left join public.aitask_members m on m.workspace_id=v_workspace and m.id=a.id left join auth.users u on u.id=m.auth_user_id where m.id is null or m.role<>'Project Manager' or m.is_super_admin or u.id is null or u.banned_until>now()) into v_invalid;
  if v_invalid then raise check_violation using message='Project Managers must be active non-Super-Admin Project Manager accounts.'; end if;
  select exists(select 1 from jsonb_array_elements_text(v_hod) a(id) left join public.aitask_members m on m.workspace_id=v_workspace and m.id=a.id left join auth.users u on u.id=m.auth_user_id where m.id is null or (m.role<>'HOD' and m.custom_role_id<>'builtin-hod') or u.id is null or u.banned_until>now()) into v_invalid;
  if v_invalid then raise check_violation using message='Project department leads must be active HOD accounts.'; end if;
  select exists(select 1 from jsonb_array_elements_text(v_staff) a(id) left join public.aitask_members m on m.workspace_id=v_workspace and m.id=a.id left join auth.users u on u.id=m.auth_user_id where m.id is null or m.role<>'Staff' or m.is_super_admin or u.id is null or u.banned_until>now()) into v_invalid;
  if v_invalid then raise check_violation using message='Project staff must be active Staff accounts.'; end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_project_membership_scope() from public,anon,authenticated,service_role;
drop trigger if exists aitask_guard_project_membership_scope on public.aitask_entities;
create trigger aitask_guard_project_membership_scope before insert or update or delete on public.aitask_entities
for each row execute function private.aitask_guard_project_membership_scope();

create or replace function private.aitask_guard_closed_project_task()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_workspace text:=coalesce(new.workspace_id,old.workspace_id); v_data jsonb:=case when tg_op='DELETE' then old.data else new.data end; v_project text;
begin
  if coalesce(new.entity_type,old.entity_type)<>'task' or (select auth.uid()) is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  v_project:=nullif(btrim(v_data->>'projectId'),'');
  if v_project is not null and private.aitask_project_is_closed(v_workspace,v_project) then raise check_violation using message='Reopen the closed project before modifying its tasks.'; end if;
  if tg_op='UPDATE' and private.aitask_project_is_closed(old.workspace_id,nullif(btrim(old.data->>'projectId'),'')) then
    raise check_violation using message='Reopen the closed project before modifying its tasks.';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.aitask_guard_closed_project_task() from public,anon,authenticated,service_role;
drop trigger if exists aitask_00_guard_closed_project_task on public.aitask_entities;
create trigger aitask_00_guard_closed_project_task before insert or update or delete on public.aitask_entities
for each row execute function private.aitask_guard_closed_project_task();

create or replace function private.aitask_guard_task_approval_requirement()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old jsonb:=case when tg_op='UPDATE' then old.data else '{}'::jsonb end;
  v_actor text:=private.aitask_member_id(new.workspace_id);
  v_old_mode text:=private.aitask_effective_task_approval_mode(new.workspace_id,v_old);
  v_mode text;
  v_old_required boolean;
  v_new_required boolean;
  v_project jsonb;
  v_milestone text;
  v_step_kind text;
begin
  if new.entity_type<>'task' then return new; end if;
  if tg_op='UPDATE' and not(new.data?'approvalMode') and v_old?'approvalMode' then new.data:=new.data||jsonb_build_object('approvalMode',v_old->'approvalMode'); end if;
  if tg_op='UPDATE' and not(new.data?'requiresInternalApproval') and v_old?'requiresInternalApproval' then new.data:=new.data||jsonb_build_object('requiresInternalApproval',v_old->'requiresInternalApproval'); end if;
  if new.data?'approvalMode' and new.data->>'approvalMode' not in('inherit','none','hod','pm') then raise check_violation using message='Choose a valid task approval workflow.'; end if;
  if new.data?'requiresInternalApproval' and jsonb_typeof(new.data->'requiresInternalApproval')<>'boolean' then raise check_violation using message='Choose whether internal approval is required.'; end if;
  v_mode:=private.aitask_effective_task_approval_mode(new.workspace_id,new.data);
  v_old_required:=v_old_mode<>'none';
  v_new_required:=v_mode<>'none';
  if tg_op='UPDATE' and (v_mode is distinct from v_old_mode or v_new_required is distinct from v_old_required) then
    if v_actor is not null and not(private.aitask_is_super_admin(new.workspace_id) or
      (private.aitask_member_role(new.workspace_id)='Project Manager' and private.aitask_can_edit_task(new.workspace_id,new.entity_id))) then
      raise check_violation using message='Only the responsible project manager can change the approval requirement.';
    end if;
    if v_old->>'status' in('Completed','Cancelled') then raise check_violation using message='Reopen the task before changing its approval requirement.'; end if;
  end if;
  new.data:=new.data||jsonb_build_object('requiresInternalApproval',v_mode<>'none');
  if not v_new_required then
    v_step_kind:=coalesce(private.aitask_workflow_step(new.workspace_id,new.data)->>'kind',new.data->>'workflowStepKind');
    if v_step_kind='internal_review' then raise check_violation using message='Internal review workflow steps always require approval.'; end if;
  end if;
  v_milestone:=nullif(btrim(new.data->>'milestoneId'),'');
  if v_milestone is not null then
    select project.data into v_project from public.aitask_entities project where project.workspace_id=new.workspace_id and project.entity_type='project' and project.entity_id=new.data->>'projectId';
    if v_project is null or jsonb_typeof(v_project->'milestones')<>'array' or not exists(select 1 from jsonb_array_elements(v_project->'milestones') item where item->>'id'=v_milestone) then
      raise check_violation using message='The selected milestone does not belong to this project.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_guard_task_approval_requirement() from public,anon,authenticated,service_role;

create or replace function private.aitask_task_reviewers(p_workspace text,p_task jsonb)
returns table(id text) language sql stable security definer set search_path='' as $$
  with mode as (select private.aitask_effective_task_approval_mode(p_workspace,p_task) value), available as (
    select m.id,m.role,m.is_super_admin from public.aitask_members m
    where m.workspace_id=p_workspace and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
      and m.id is distinct from p_task->>'assignedTo' and m.id is distinct from p_task->'workState'->>'reviewRequestedBy'
  ), cover as (select a.id from available a,mode where mode.value='hod' and a.id=p_task->'reviewCover'->>'reviewerId' and (p_task->'reviewCover'->>'expiresAt')::timestamptz>now()),
  hods as (select a.id from available a,mode where mode.value='hod' and a.role in('HOD','Staff')),
  pms as (select m.id from public.aitask_members m,mode where mode.value in('hod','pm')
    and m.workspace_id=p_workspace and m.role='Project Manager' and not m.is_super_admin
    and private.aitask_review_member_can_lead(p_workspace,p_task,m.id))
  select id from cover union select id from hods where not exists(select 1 from cover)
  union select id from pms
  union select a.id from available a,mode where a.is_super_admin and mode.value in('hod','pm')
    and not exists(select 1 from cover) and not exists(select 1 from hods) and not exists(select 1 from pms);
$$;
revoke all on function private.aitask_task_reviewers(text,jsonb) from public,anon,authenticated,service_role;

-- Service-role endpoint used by the authenticated invitation function. It
-- reuses a central member row by auth id/email and changes only projects that
-- the actor is assigned to.
create or replace function public.aitask_pm_upsert_project_member(
  p_actor_member_id text,p_auth_user_id uuid,p_name text,p_email text,p_role text,
  p_departments text[],p_worker_type text,p_project_ids text[],p_command_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.aitask_members%rowtype; v_member public.aitask_members%rowtype; v_project text; v_now timestamptz:=clock_timestamp(); v_member_id text;
begin
  if (select auth.role()) is distinct from 'service_role' then raise insufficient_privilege using message='Service role required.'; end if;
  select * into v_actor from public.aitask_members where id=p_actor_member_id for update;
  if not found or v_actor.role<>'Project Manager' or v_actor.is_super_admin then raise insufficient_privilege using message='Assigned Project Manager access is required.'; end if;
  if p_role not in('HOD','Staff') or cardinality(coalesce(p_project_ids,array[]::text[]))=0 then raise check_violation using message='Choose HOD or Staff and at least one project.'; end if;
  if exists(select 1 from unnest(p_project_ids) project_id where not private.aitask_project_manager_id_is_assigned(v_actor.workspace_id,project_id,v_actor.id)) then raise insufficient_privilege using message='A selected project is outside your authority.'; end if;
  select * into v_member from public.aitask_members where workspace_id=v_actor.workspace_id and (auth_user_id=p_auth_user_id or lower(coalesce(email,''))=lower(p_email)) order by case when auth_user_id=p_auth_user_id then 0 else 1 end limit 1 for update;
  if found then
    if v_member.is_super_admin or v_member.role not in('HOD','Staff') then raise insufficient_privilege using message='This existing account cannot be assigned by a Project Manager.'; end if;
    v_member_id:=v_member.id;
  else
    v_member_id:=gen_random_uuid()::text;
    insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin,must_reset_password,permissions,worker_type)
    values(v_member_id,v_actor.workspace_id,p_auth_user_id,btrim(p_name),lower(p_email),p_role,coalesce(p_departments[1],'Operation'),p_departments,false,false,'{}'::jsonb,p_worker_type);
  end if;
  foreach v_project in array p_project_ids loop
    update public.aitask_entities project set data=case when p_role='HOD' then
      jsonb_set(jsonb_set(project.data,'{hodMemberIds}',coalesce(project.data->'hodMemberIds','[]'::jsonb)||to_jsonb(v_member_id),true),'{staffMemberIds}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(project.data->'staffMemberIds','[]'::jsonb)) where value<>to_jsonb(v_member_id)),'[]'::jsonb),true)
    else jsonb_set(jsonb_set(project.data,'{staffMemberIds}',coalesce(project.data->'staffMemberIds','[]'::jsonb)||to_jsonb(v_member_id),true),'{hodMemberIds}',coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(project.data->'hodMemberIds','[]'::jsonb)) where value<>to_jsonb(v_member_id)),'[]'::jsonb),true) end
    where project.workspace_id=v_actor.workspace_id and project.entity_type='project' and project.entity_id=v_project
      and not(coalesce(project.data->case when p_role='HOD' then 'hodMemberIds' else 'staffMemberIds' end,'[]'::jsonb)?v_member_id);
  end loop;
  insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata,occurred_at)
  values(v_actor.workspace_id,v_actor.id,p_command_id,'project_member.assign','member',v_member_id,array['projectMembership'],jsonb_build_object('projectIds',p_project_ids,'role',p_role),v_now);
  return jsonb_build_object('ok',true,'memberId',v_member_id,'reused',v_member.id is not null);
end;
$$;
revoke all on function public.aitask_pm_upsert_project_member(text,uuid,text,text,text,text[],text,text[],uuid) from public,anon,authenticated;
grant execute on function public.aitask_pm_upsert_project_member(text,uuid,text,text,text,text[],text,text[],uuid) to service_role;

create or replace function public.aitask_pm_request_member_deactivation(
  p_actor_member_id text,p_member_id text,p_command_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor public.aitask_members%rowtype; v_target public.aitask_members%rowtype; v_project_ids text[]; v_boss record; v_notice_id text; v_previous text:=current_setting('aitask.server_notification',true);
begin
  if (select auth.role()) is distinct from 'service_role' then raise insufficient_privilege using message='Service role required.'; end if;
  select * into v_actor from public.aitask_members where id=p_actor_member_id;
  select * into v_target from public.aitask_members where id=p_member_id and workspace_id=v_actor.workspace_id;
  if v_actor.role<>'Project Manager' or v_actor.is_super_admin then raise insufficient_privilege using message='Project Manager access is required.'; end if;
  if not found or v_target.is_super_admin or v_target.role not in('HOD','Staff') or v_target.id=v_actor.id then raise insufficient_privilege using message='This account cannot be deactivated by a Project Manager.'; end if;
  select array_agg(project.entity_id order by project.entity_id) into v_project_ids from public.aitask_entities project
    where project.workspace_id=v_actor.workspace_id and project.entity_type='project'
      and (coalesce(project.data->'hodMemberIds','[]'::jsonb)?v_target.id or coalesce(project.data->'staffMemberIds','[]'::jsonb)?v_target.id);
  if cardinality(coalesce(v_project_ids,array[]::text[]))=0 or not exists(select 1 from unnest(v_project_ids) id where private.aitask_project_manager_id_is_assigned(v_actor.workspace_id,id,v_actor.id)) then
    raise insufficient_privilege using message='The member is outside your assigned project scope.';
  end if;
  for v_boss in select id from public.aitask_members where workspace_id=v_actor.workspace_id and is_super_admin loop
    v_notice_id:='N-deactivation-'||replace(gen_random_uuid()::text,'-','');
    perform set_config('aitask.server_notification','true',true);
    insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,target_user_id,data)
    values(v_actor.workspace_id,'notification',v_notice_id,v_target.id,v_boss.id,jsonb_build_object(
      'id',v_notice_id,'targetUserId',v_boss.id,'title','Account Deactivation Requested',
      'message',left(v_actor.name,100)||' requested deactivation of '||left(v_target.name,100)||'. Review all project memberships before acting.',
      'route',jsonb_build_object('page','approvals','entityId',v_target.id),'iconType','alert','isRead',false,'readByUserIds','[]'::jsonb,
      'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  end loop;
  perform set_config('aitask.server_notification',coalesce(v_previous,'false'),true);
  insert into public.aitask_audit_events(workspace_id,actor_member_id,command_id,action,entity_type,entity_id,changed_fields,metadata)
  values(v_actor.workspace_id,v_actor.id,p_command_id,'member.deactivation.request','member',v_target.id,array['accountStatus'],jsonb_build_object('projectIds',coalesce(v_project_ids,array[]::text[])));
  return jsonb_build_object('ok',true,'requested',true);
end;
$$;
revoke all on function public.aitask_pm_request_member_deactivation(text,text,uuid) from public,anon,authenticated;
grant execute on function public.aitask_pm_request_member_deactivation(text,text,uuid) to service_role;

commit;
