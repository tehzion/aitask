-- Authenticated, row-scoped AiTask storage. This is additive: the legacy snapshot
-- remains in place until the secure frontend cutover is verified.

create schema if not exists private;

create table if not exists public.aitask_workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  sync_protocol_version integer not null default 1
);

create table if not exists public.aitask_members (
  id text primary key,
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text,
  role text not null check (role in ('Admin', 'Staff', 'Client')),
  department text not null,
  avatar text,
  client_name text,
  is_super_admin boolean not null default false,
  must_reset_password boolean not null default true,
  custom_role_id text,
  custom_role_name text,
  permissions jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists aitask_members_workspace_idx on public.aitask_members(workspace_id);
create index if not exists aitask_members_auth_idx on public.aitask_members(auth_user_id);

create table if not exists public.aitask_entities (
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'client', 'project', 'task', 'comment', 'approval', 'notification',
    'registration', 'custom_role', 'task_status'
  )),
  entity_id text not null,
  parent_id text,
  client_key text,
  assigned_to text,
  created_by text,
  target_user_id text,
  target_role text,
  target_client_key text,
  data jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, entity_type, entity_id)
);

create index if not exists aitask_entities_type_idx on public.aitask_entities(workspace_id, entity_type);
create index if not exists aitask_entities_client_idx on public.aitask_entities(workspace_id, client_key);
create index if not exists aitask_entities_assignee_idx on public.aitask_entities(workspace_id, assigned_to);
create index if not exists aitask_entities_creator_idx on public.aitask_entities(workspace_id, created_by);
create index if not exists aitask_entities_parent_idx on public.aitask_entities(workspace_id, parent_id);

create table if not exists public.aitask_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign text not null check (campaign = 'launch-week-2026-07'),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 5 and 254),
  role text not null check (role in ('Super Admin', 'Admin', 'Staff', 'Client')),
  organization text not null default '' check (char_length(organization) <= 120),
  device text not null check (device in ('Desktop', 'Laptop', 'Tablet', 'Mobile', 'Other')),
  language text not null check (language in ('en', 'zh')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  issue_details jsonb not null default '{}'::jsonb check (jsonb_typeof(issue_details) = 'object'),
  ratings jsonb not null check (jsonb_typeof(ratings) = 'object'),
  most_useful text not null default '' check (char_length(most_useful) <= 2000),
  most_confusing text not null default '' check (char_length(most_confusing) <= 2000),
  recommendation text not null default '' check (char_length(recommendation) <= 2000),
  is_late boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index if not exists aitask_feedback_campaign_time_idx on public.aitask_feedback_submissions(campaign, submitted_at desc);
create index if not exists aitask_feedback_role_idx on public.aitask_feedback_submissions(campaign, role);
create unique index if not exists aitask_feedback_campaign_email_uidx on public.aitask_feedback_submissions(campaign, lower(email));
alter table public.aitask_feedback_submissions enable row level security;
revoke all on public.aitask_feedback_submissions from public, anon, authenticated;
grant select, insert on public.aitask_feedback_submissions to service_role;

create or replace function private.aitask_member_id(p_workspace_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.aitask_members
  where workspace_id = p_workspace_id
    and auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.aitask_member_role(p_workspace_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.aitask_members
  where workspace_id = p_workspace_id
    and auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.aitask_member_client_key(p_workspace_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(trim(coalesce(client_name, '')))
  from public.aitask_members
  where workspace_id = p_workspace_id
    and auth_user_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.aitask_is_admin(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select role = 'Admin' or is_super_admin
    from public.aitask_members
    where workspace_id = p_workspace_id
      and auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function private.aitask_is_super_admin(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select is_super_admin
    from public.aitask_members
    where workspace_id = p_workspace_id
      and auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function private.aitask_has_permission(p_workspace_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when member.is_super_admin then true
      when member.permissions <> '{}'::jsonb then coalesce(member.permissions ->> p_permission = 'true', false)
      when custom_role.data is not null then coalesce(custom_role.data -> 'permissions' ->> p_permission = 'true', false)
      when member.role = 'Admin' then p_permission = any(array[
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects', 'viewAllTasks',
        'viewAllClients', 'manageAssignedClients', 'viewReports', 'viewSettings',
        'createTasks', 'editTasks', 'createProjects'
      ]::text[])
      when member.role = 'Staff' then p_permission = any(array[
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects',
        'viewReports', 'viewSettings', 'createTasks'
      ]::text[])
      when member.role = 'Client' then p_permission = any(array[
        'viewDashboard', 'viewTasks', 'viewCalendar', 'viewProjects',
        'viewReports', 'viewSettings', 'clientReview'
      ]::text[])
      else false
    end
    from public.aitask_members member
    left join lateral (
      select entity.data
      from public.aitask_entities entity
      where entity.workspace_id = member.workspace_id
        and entity.entity_type = 'custom_role'
        and entity.entity_id = member.custom_role_id
      limit 1
    ) custom_role on true
    where member.workspace_id = p_workspace_id
      and member.auth_user_id = (select auth.uid())
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_view_task(p_workspace_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
      when 'Staff' then
        private.aitask_has_permission(p_workspace_id, 'viewAllTasks')
        or private.aitask_has_permission(p_workspace_id, 'editTasks')
        or task.assigned_to = private.aitask_member_id(p_workspace_id)
      when 'Client' then task.client_key = private.aitask_member_client_key(p_workspace_id)
      else false
    end
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_edit_task(p_workspace_id text, p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.aitask_is_admin(p_workspace_id)
      or (
        private.aitask_member_role(p_workspace_id) = 'Staff'
        and (
          private.aitask_has_permission(p_workspace_id, 'editTasks')
          or task.assigned_to = private.aitask_member_id(p_workspace_id)
        )
      )
    from public.aitask_entities task
    where task.workspace_id = p_workspace_id
      and task.entity_type = 'task'
      and task.entity_id = p_task_id
    limit 1
  ), false);
$$;

create or replace function private.aitask_can_view_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.aitask_member_role(p_workspace_id)
    when 'Admin' then true
    when 'Client' then p_client_key = private.aitask_member_client_key(p_workspace_id)
    when 'Staff' then private.aitask_has_permission(p_workspace_id, 'viewAllClients') or exists (
      select 1
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_key = p_client_key
        and private.aitask_can_view_task(p_workspace_id, task.entity_id)
    )
    else false
  end;
$$;

create or replace function private.aitask_can_edit_client(p_workspace_id text, p_client_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.aitask_is_admin(p_workspace_id) or (
    private.aitask_member_role(p_workspace_id) = 'Staff'
    and private.aitask_has_permission(p_workspace_id, 'manageAssignedClients')
    and exists (
      select 1
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id
        and task.entity_type = 'task'
        and task.client_key = p_client_key
        and task.assigned_to = private.aitask_member_id(p_workspace_id)
    )
  );
$$;

create or replace function private.aitask_can_view_project(p_workspace_id text, p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case private.aitask_member_role(p_workspace_id)
      when 'Admin' then true
      when 'Client' then project.client_key = private.aitask_member_client_key(p_workspace_id)
      when 'Staff' then
        project.created_by = private.aitask_member_id(p_workspace_id)
        or exists (
          select 1
          from public.aitask_entities task
          where task.workspace_id = p_workspace_id
            and task.entity_type = 'task'
            and task.parent_id = p_project_id
            and private.aitask_can_view_task(p_workspace_id, task.entity_id)
        )
        or (
          private.aitask_has_permission(p_workspace_id, 'createTasks')
          and (
            project.created_by is null
            or exists (
              select 1
              from public.aitask_members creator
              where creator.workspace_id = p_workspace_id
                and creator.id = project.created_by
                and (creator.role = 'Admin' or creator.is_super_admin)
            )
          )
        )
      else false
    end
    from public.aitask_entities project
    where project.workspace_id = p_workspace_id
      and project.entity_type = 'project'
      and project.entity_id = p_project_id
    limit 1
  ), false);
$$;

revoke all on function private.aitask_member_id(text) from public;
revoke all on function private.aitask_member_role(text) from public;
revoke all on function private.aitask_member_client_key(text) from public;
revoke all on function private.aitask_is_admin(text) from public;
revoke all on function private.aitask_is_super_admin(text) from public;
revoke all on function private.aitask_has_permission(text, text) from public;
revoke all on function private.aitask_can_view_task(text, text) from public;
revoke all on function private.aitask_can_edit_task(text, text) from public;
revoke all on function private.aitask_can_view_client(text, text) from public;
revoke all on function private.aitask_can_edit_client(text, text) from public;
revoke all on function private.aitask_can_view_project(text, text) from public;

grant usage on schema private to authenticated;
grant execute on function private.aitask_member_id(text) to authenticated;
grant execute on function private.aitask_member_role(text) to authenticated;
grant execute on function private.aitask_member_client_key(text) to authenticated;
grant execute on function private.aitask_is_admin(text) to authenticated;
grant execute on function private.aitask_is_super_admin(text) to authenticated;
grant execute on function private.aitask_has_permission(text, text) to authenticated;
grant execute on function private.aitask_can_view_task(text, text) to authenticated;
grant execute on function private.aitask_can_edit_task(text, text) to authenticated;
grant execute on function private.aitask_can_view_client(text, text) to authenticated;
grant execute on function private.aitask_can_edit_client(text, text) to authenticated;
grant execute on function private.aitask_can_view_project(text, text) to authenticated;

create or replace function private.aitask_guard_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (select auth.uid()) = old.auth_user_id and not private.aitask_is_super_admin(old.workspace_id) then
    if new.workspace_id is distinct from old.workspace_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.department is distinct from old.department
      or new.client_name is distinct from old.client_name
      or new.is_super_admin is distinct from old.is_super_admin
      or (new.must_reset_password is distinct from old.must_reset_password and not (old.must_reset_password and not new.must_reset_password))
      or new.custom_role_id is distinct from old.custom_role_id
      or new.custom_role_name is distinct from old.custom_role_name
      or new.permissions is distinct from old.permissions then
      raise exception 'Members may update only their own name, email, avatar, and password-reset completion';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aitask_guard_member_update on public.aitask_members;
create trigger aitask_guard_member_update
  before update on public.aitask_members
  for each row execute function private.aitask_guard_member_update();

create or replace function private.aitask_guard_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  forbidden_key text;
begin
  select key into forbidden_key
  from jsonb_object_keys(new.data) key
  where key ~* '(password|secret|token|api[_-]?key|service[_-]?role)'
  limit 1;
  if forbidden_key is not null then
    raise exception 'AiTask entities cannot contain secret-like fields';
  end if;

  if tg_op = 'UPDATE'
    and old.entity_type = 'client'
    and lower(trim(coalesce(old.data ->> 'clientName', '')))
      is distinct from lower(trim(coalesce(new.data ->> 'clientName', '')))
    and not private.aitask_is_admin(old.workspace_id) then
    raise exception 'Only admins can rename clients';
  end if;

  new.client_key := lower(trim(coalesce(new.data ->> 'clientName', new.data ->> 'targetClient', '')));
  new.assigned_to := nullif(trim(new.data ->> 'assignedTo'), '');
  new.created_by := nullif(trim(coalesce(new.data ->> 'createdBy', new.data ->> 'userId')), '');
  new.target_user_id := nullif(trim(new.data ->> 'targetUserId'), '');
  new.target_role := nullif(trim(new.data ->> 'targetRole'), '');
  new.target_client_key := lower(trim(coalesce(new.data ->> 'targetClient', '')));
  new.parent_id := case
    when new.entity_type = 'task' then nullif(trim(new.data ->> 'projectId'), '')
    when new.entity_type in ('comment', 'approval') then nullif(trim(new.data ->> 'taskId'), '')
    else new.parent_id
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aitask_guard_entity on public.aitask_entities;
create trigger aitask_guard_entity
  before insert or update on public.aitask_entities
  for each row execute function private.aitask_guard_entity();

revoke all on function private.aitask_guard_entity() from public;

alter table public.aitask_workspaces enable row level security;
alter table public.aitask_members enable row level security;
alter table public.aitask_entities enable row level security;

drop policy if exists "workspace members can read workspace" on public.aitask_workspaces;
create policy "workspace members can read workspace" on public.aitask_workspaces
  for select to authenticated
  using (private.aitask_member_id(id) is not null);

drop policy if exists "workspace members can read directory" on public.aitask_members;
create policy "workspace members can read directory" on public.aitask_members
  for select to authenticated
  using (private.aitask_member_id(workspace_id) is not null);

drop policy if exists "admins can insert members" on public.aitask_members;
create policy "super admins can insert members" on public.aitask_members
  for insert to authenticated
  with check (private.aitask_is_super_admin(workspace_id));

drop policy if exists "admins or self can update members" on public.aitask_members;
create policy "super admins or self can update members" on public.aitask_members
  for update to authenticated
  using (private.aitask_is_super_admin(workspace_id) or auth_user_id = (select auth.uid()))
  with check (private.aitask_is_super_admin(workspace_id) or auth_user_id = (select auth.uid()));

drop policy if exists "admins can delete members" on public.aitask_members;
create policy "super admins can delete members" on public.aitask_members
  for delete to authenticated
  using (private.aitask_is_super_admin(workspace_id) and auth_user_id is distinct from (select auth.uid()));

drop policy if exists "members can read scoped entities" on public.aitask_entities;
create policy "members can read scoped entities" on public.aitask_entities
  for select to authenticated
  using (
    (entity_type = 'task' and private.aitask_can_view_task(workspace_id, entity_id))
    or (entity_type in ('comment', 'approval') and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'client' and private.aitask_can_view_client(workspace_id, client_key))
    or (entity_type = 'project' and private.aitask_can_view_project(workspace_id, entity_id))
    or (entity_type in ('task_status', 'custom_role') and private.aitask_member_id(workspace_id) is not null)
    or (entity_type = 'registration' and private.aitask_has_permission(workspace_id, 'approveRegistrations'))
    or (entity_type = 'notification' and (
      target_user_id = private.aitask_member_id(workspace_id)
      or target_role = private.aitask_member_role(workspace_id)
      or (target_role = 'Admin' and private.aitask_is_admin(workspace_id))
      or (private.aitask_member_role(workspace_id) = 'Client' and target_client_key = private.aitask_member_client_key(workspace_id))
    ))
  );

drop policy if exists "members can insert authorized entities" on public.aitask_entities;
create policy "members can insert authorized entities" on public.aitask_entities
  for insert to authenticated
  with check (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task'
      and private.aitask_member_role(workspace_id) = 'Staff'
      and created_by = private.aitask_member_id(workspace_id))
    or (entity_type = 'client'
      and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'comment'
      and created_by = private.aitask_member_id(workspace_id)
      and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'approval'
      and created_by = private.aitask_member_id(workspace_id)
      and private.aitask_can_view_task(workspace_id, parent_id))
    or (entity_type = 'notification'
      and private.aitask_member_role(workspace_id) in ('Admin', 'Staff'))
  );

drop policy if exists "members can update authorized entities" on public.aitask_entities;
create policy "members can update authorized entities" on public.aitask_entities
  for update to authenticated
  using (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task' and private.aitask_can_edit_task(workspace_id, entity_id))
    or (entity_type = 'client' and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'project' and created_by = private.aitask_member_id(workspace_id))
    or (entity_type in ('comment', 'approval') and created_by = private.aitask_member_id(workspace_id))
  )
  with check (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task'
      and private.aitask_member_role(workspace_id) = 'Staff'
      and (
        private.aitask_has_permission(workspace_id, 'editTasks')
        or assigned_to = private.aitask_member_id(workspace_id)
      ))
    or (entity_type = 'client' and private.aitask_can_edit_client(workspace_id, client_key))
    or (entity_type = 'project' and created_by = private.aitask_member_id(workspace_id))
    or (entity_type in ('comment', 'approval') and created_by = private.aitask_member_id(workspace_id))
  );

drop policy if exists "members can delete authorized entities" on public.aitask_entities;
create policy "members can delete authorized entities" on public.aitask_entities
  for delete to authenticated
  using (
    private.aitask_is_admin(workspace_id)
    or (entity_type = 'task' and private.aitask_can_edit_task(workspace_id, entity_id))
    or (entity_type = 'project' and created_by = private.aitask_member_id(workspace_id))
    or (entity_type in ('comment', 'approval') and created_by = private.aitask_member_id(workspace_id))
  );

revoke all on public.aitask_workspaces, public.aitask_members, public.aitask_entities from anon;
grant select on public.aitask_workspaces to authenticated;
grant select, insert, update, delete on public.aitask_members to authenticated;
grant select, insert, update, delete on public.aitask_entities to authenticated;

insert into public.aitask_workspaces (id, name)
values ('aitask-main', 'AiTask')
on conflict (id) do nothing;

with snapshot_users as (
  select value as data
  from public.aitask_app_state state_row,
    lateral jsonb_array_elements(coalesce(state_row.state -> 'users', '[]'::jsonb))
  where state_row.id = 'default'
), mapped_users as (
  select
    data,
    (
      select auth_user.id
      from auth.users auth_user
      where lower(coalesce(auth_user.raw_user_meta_data ->> 'name', '')) = lower(data ->> 'name')
      limit 1
    ) as auth_user_id
  from snapshot_users
)
insert into public.aitask_members (
  id, workspace_id, auth_user_id, name, email, role, department, avatar,
  client_name, is_super_admin, must_reset_password, custom_role_id,
  custom_role_name, permissions, updated_at
)
select
  data ->> 'id',
  'aitask-main',
  auth_user_id,
  data ->> 'name',
  nullif(data ->> 'email', ''),
  data ->> 'role',
  data ->> 'department',
  nullif(data ->> 'avatar', ''),
  nullif(data ->> 'companyName', ''),
  coalesce((data ->> 'isSuperAdmin')::boolean, false),
  true,
  nullif(data ->> 'customRoleId', ''),
  nullif(data ->> 'customRoleName', ''),
  coalesce(data -> 'permissions', '{}'::jsonb),
  coalesce((data ->> 'updatedAt')::timestamptz, now())
from mapped_users
where data ->> 'id' is not null
on conflict (id) do update set
  auth_user_id = coalesce(excluded.auth_user_id, public.aitask_members.auth_user_id),
  name = excluded.name,
  email = coalesce(excluded.email, public.aitask_members.email),
  role = excluded.role,
  department = excluded.department,
  avatar = excluded.avatar,
  client_name = excluded.client_name,
  is_super_admin = excluded.is_super_admin,
  custom_role_id = excluded.custom_role_id,
  custom_role_name = excluded.custom_role_name,
  permissions = excluded.permissions,
  updated_at = excluded.updated_at;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, data, created_at, updated_at)
select 'aitask-main', source.entity_type, source.entity_id, source.data,
  coalesce(source.created_at, now()), coalesce(source.updated_at, now())
from (
  select 'client'::text entity_type, item ->> 'id' entity_id, item data,
    nullif(item ->> 'createdAt', '')::timestamptz created_at,
    nullif(item ->> 'updatedAt', '')::timestamptz updated_at
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'clients', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'project', item ->> 'id', item, null, nullif(item ->> 'updatedAt', '')::timestamptz
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'projects', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'task', item ->> 'id', item, null, nullif(item ->> 'updatedAt', '')::timestamptz
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'tasks', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'notification', item ->> 'id', item, nullif(item ->> 'createdAt', '')::timestamptz, null
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'notifications', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'registration', item ->> 'id', item, nullif(item ->> 'createdAt', '')::timestamptz, null
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'registrations', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'custom_role', item ->> 'id', item, nullif(item ->> 'createdAt', '')::timestamptz, nullif(item ->> 'updatedAt', '')::timestamptz
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'rolePermissions', '[]'::jsonb)) item
  where row.id = 'default'
  union all
  select 'task_status', status #>> '{}', jsonb_build_object('status', status #>> '{}'), null, null
  from public.aitask_app_state row, lateral jsonb_array_elements(coalesce(row.state -> 'taskStatuses', '[]'::jsonb)) status
  where row.id = 'default'
) source
where source.entity_id is not null and source.entity_id <> ''
on conflict (workspace_id, entity_type, entity_id) do update set
  data = excluded.data,
  updated_at = excluded.updated_at;

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, data, created_at, updated_at)
select 'aitask-main', 'comment', comment ->> 'id', task ->> 'id',
  comment || jsonb_build_object('taskId', task ->> 'id'),
  coalesce(nullif(comment ->> 'createdAt', '')::timestamptz, now()), now()
from public.aitask_app_state row,
  lateral jsonb_array_elements(coalesce(row.state -> 'tasks', '[]'::jsonb)) task,
  lateral jsonb_array_elements(coalesce(task -> 'comments', '[]'::jsonb)) comment
where row.id = 'default' and comment ->> 'id' is not null
on conflict (workspace_id, entity_type, entity_id) do update set data = excluded.data, updated_at = now();

insert into public.aitask_entities (workspace_id, entity_type, entity_id, parent_id, data, created_at, updated_at)
select 'aitask-main', 'approval', approval ->> 'id', task ->> 'id',
  approval || jsonb_build_object('taskId', task ->> 'id'),
  coalesce(nullif(approval ->> 'createdAt', '')::timestamptz, now()), now()
from public.aitask_app_state row,
  lateral jsonb_array_elements(coalesce(row.state -> 'tasks', '[]'::jsonb)) task,
  lateral jsonb_array_elements(coalesce(task -> 'approvalHistory', '[]'::jsonb)) approval
where row.id = 'default' and approval ->> 'id' is not null
on conflict (workspace_id, entity_type, entity_id) do update set data = excluded.data, updated_at = now();
