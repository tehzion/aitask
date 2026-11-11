-- A linked user's email may change only after the Edge Function has verified
-- their current password. Direct Auth API calls cannot create this record.
create table private.aitask_authorized_email_changes (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  new_email text not null,
  expires_at timestamptz not null
);
revoke all on private.aitask_authorized_email_changes from public, anon, authenticated;

create or replace function public.aitask_authorize_email_change(p_auth_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.aitask_members where auth_user_id=p_auth_user_id)
    or nullif(btrim(p_email),'') is null or length(p_email)>320 then
    raise check_violation using message='Linked member and valid email required.';
  end if;
  insert into private.aitask_authorized_email_changes(auth_user_id,new_email,expires_at)
  values(p_auth_user_id,lower(btrim(p_email)),now()+interval '24 hours')
  on conflict(auth_user_id) do update set new_email=excluded.new_email,expires_at=excluded.expires_at;
end;
$$;
revoke all on function public.aitask_authorize_email_change(uuid,text) from public, anon, authenticated;
grant execute on function public.aitask_authorize_email_change(uuid,text) to service_role;

-- Synchronize a linked member only when GoTrue actually changes the confirmed
-- address. Errors roll back the Auth change instead of leaving split identity.
create or replace function private.aitask_sync_confirmed_auth_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_member text;
begin
  if new.email is distinct from old.email then
    select id into v_member from public.aitask_members where auth_user_id = new.id;
    if v_member is not null then
      if new.email_confirmed_at is null or not exists(select 1 from private.aitask_authorized_email_changes
        where auth_user_id=new.id and new_email=lower(btrim(new.email)) and expires_at>now()) then
        raise check_violation using message='Email change requires a current-password check.';
      end if;
      perform public.aitask_update_member_email(v_member, new.email);
      delete from private.aitask_authorized_email_changes where auth_user_id=new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.aitask_sync_confirmed_auth_email() from public, anon, authenticated, service_role;
create trigger aitask_sync_confirmed_auth_email after update of email on auth.users
for each row execute function private.aitask_sync_confirmed_auth_email();

-- Edge Function checks this before initiating a change. It is intentionally not
-- callable by browser roles and allows a safe function-first deployment.
create or replace function public.aitask_verified_email_change_ready()
returns boolean language sql stable security definer set search_path = '' as $$ select true $$;
revoke all on function public.aitask_verified_email_change_ready() from public, anon, authenticated;
grant execute on function public.aitask_verified_email_change_ready() to service_role;

create or replace function public.aitask_email_change_available(p_actor_member_id text, p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.aitask_members actor where actor.id=p_actor_member_id and actor.auth_user_id is not null
    and not exists(select 1 from public.aitask_members other where other.workspace_id=actor.workspace_id
      and other.id<>actor.id and lower(coalesce(other.email,''))=lower(btrim(p_email))));
$$;
revoke all on function public.aitask_email_change_available(text,text) from public, anon, authenticated;
grant execute on function public.aitask_email_change_available(text,text) to service_role;

-- Only new attachments proved to belong to the submitting user, or attachments
-- explicitly approved by a super-admin, may publish a private object.
create table private.aitask_comment_file_publications (
  workspace_id text not null,
  comment_id text not null,
  object_name text not null,
  object_owner text not null,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  primary key (workspace_id, comment_id, object_name)
);
revoke all on private.aitask_comment_file_publications from public, anon, authenticated;

create or replace function private.aitask_comment_file_approved(p_workspace text, p_comment text, p_object text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.aitask_comment_file_publications publication
    join storage.objects object on object.bucket_id = 'client-service-files'
      and object.name = publication.object_name and object.owner_id = publication.object_owner
    where publication.workspace_id = p_workspace and publication.comment_id = p_comment
      and publication.object_name = p_object
  );
$$;
revoke all on function private.aitask_comment_file_approved(text,text,text) from public, anon, authenticated;

create or replace function private.aitask_guard_comment_file_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.aitask_member_id(new.workspace_id);
  v_attachment jsonb;
  v_old jsonb := case when tg_op = 'UPDATE' then coalesce(old.data->'attachments','[]'::jsonb) else '[]'::jsonb end;
  v_path text;
begin
  if jsonb_typeof(coalesce(new.data->'attachments','[]'::jsonb)) <> 'array' then
    raise check_violation using message = 'Comment attachments must be an array.';
  end if;
  for v_attachment in select value from jsonb_array_elements(coalesce(new.data->'attachments','[]'::jsonb)) loop
    if v_old @> jsonb_build_array(v_attachment) then continue; end if;
    v_path := v_attachment->>'path';
    if v_actor is null or v_attachment->>'bucket' is distinct from 'client-service-files'
      or v_attachment->>'uploadedBy' is distinct from v_actor
      or nullif(v_attachment->>'id','') is null
      or array_length(string_to_array(v_path,'/'),1) is distinct from 4
      or split_part(v_path,'/',1) is distinct from new.workspace_id
      or split_part(v_path,'/',2) is distinct from new.data->>'clientId'
      or split_part(v_path,'/',3) is distinct from new.data->>'cycleId'
      or v_path ~ '(^|/)\.\.?(/|$)' or position(chr(92) in coalesce(v_path,'')) > 0
      or not exists(select 1 from storage.objects o where o.bucket_id='client-service-files' and o.name=v_path and o.owner_id=(select auth.uid())::text)
    then raise check_violation using message = 'Comment attachments must be uploaded by the signed-in member for this month.'; end if;
    insert into private.aitask_comment_file_publications(workspace_id,comment_id,object_name,object_owner,approved_by)
    values(new.workspace_id,new.entity_id,v_path,(select auth.uid())::text,v_actor)
    on conflict (workspace_id,comment_id,object_name) do update set object_owner=excluded.object_owner,approved_by=excluded.approved_by,approved_at=now();
  end loop;
  delete from private.aitask_comment_file_publications p
  where p.workspace_id=new.workspace_id and p.comment_id=new.entity_id
    and not exists(select 1 from jsonb_array_elements(coalesce(new.data->'attachments','[]'::jsonb)) a where a->>'path'=p.object_name and a->>'bucket'='client-service-files');
  return new;
end;
$$;
revoke all on function private.aitask_guard_comment_file_publication() from public, anon, authenticated, service_role;
create trigger aitask_guard_comment_file_publication before insert or update on public.aitask_entities
for each row when (new.entity_type = 'cycle_comment') execute function private.aitask_guard_comment_file_publication();

-- Existing rows are not backfilled. The owner reviews each historical file and
-- explicitly approves publication without altering or deleting the object.
create or replace function public.aitask_approve_comment_file(p_workspace text, p_comment text, p_object text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor text := private.aitask_member_id(p_workspace); v_owner text;
begin
  if v_actor is null or not private.aitask_is_super_admin(p_workspace) then
    raise insufficient_privilege using message='Super-admin approval required.';
  end if;
  select o.owner_id into v_owner from public.aitask_entities c
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.data->'attachments')='array' then c.data->'attachments' else '[]'::jsonb end) a
    join storage.objects o on o.bucket_id='client-service-files' and o.name=a->>'path'
    where c.workspace_id=p_workspace and c.entity_type='cycle_comment' and c.entity_id=p_comment
      and a->>'bucket'='client-service-files' and a->>'path'=p_object
      and split_part(p_object,'/',1)=p_workspace and split_part(p_object,'/',2)=c.client_id
      and split_part(p_object,'/',3)=c.cycle_id and array_length(string_to_array(p_object,'/'),1)=4;
  if v_owner is null then raise check_violation using message='Attachment and object scope could not be verified.'; end if;
  insert into private.aitask_comment_file_publications(workspace_id,comment_id,object_name,object_owner,approved_by)
  values(p_workspace,p_comment,p_object,v_owner,v_actor)
  on conflict (workspace_id,comment_id,object_name) do update set object_owner=excluded.object_owner,approved_by=excluded.approved_by,approved_at=now();
end;
$$;
revoke all on function public.aitask_approve_comment_file(text,text,text) from public, anon;
grant execute on function public.aitask_approve_comment_file(text,text,text) to authenticated;

do $migration$
declare d text; needle text := 'and attachment->>''path''=p_object_name';
begin
  d := pg_get_functiondef('private.aitask_can_read_service_file(text,text,text,text)'::regprocedure);
  if (length(d)-length(replace(d,needle,'')))/length(needle) <> 1 then raise exception 'Expected exactly one client comment attachment predicate'; end if;
  execute replace(d,needle,needle || ' and private.aitask_comment_file_approved(comment.workspace_id,comment.entity_id,p_object_name)');
end;
$migration$;
