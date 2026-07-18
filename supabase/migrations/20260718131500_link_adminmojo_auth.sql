-- Link the developer Admin member when its environment-specific Auth user exists.

do $$
declare
  v_auth_user_id uuid;
  v_workspace_id text;
begin
  select id
  into v_auth_user_id
  from auth.users
  where lower(email) = 'adminmojo@aitask.local'
  limit 1;

  if v_auth_user_id is null then
    return;
  end if;

  update public.aitask_members
  set auth_user_id = v_auth_user_id,
      email = 'adminmojo@aitask.local',
      role = 'Admin',
      is_super_admin = false,
      must_reset_password = false,
      version = version + 1,
      updated_at = now()
  where id = 'u-adminmojo'
    and (
      auth_user_id is distinct from v_auth_user_id
      or email is distinct from 'adminmojo@aitask.local'
      or role is distinct from 'Admin'
      or is_super_admin
      or must_reset_password
    )
  returning workspace_id into v_workspace_id;

  if v_workspace_id is not null then
    update public.aitask_workspaces
    set version = version + 1,
        updated_at = now()
    where id = v_workspace_id;
  end if;
end;
$$;
