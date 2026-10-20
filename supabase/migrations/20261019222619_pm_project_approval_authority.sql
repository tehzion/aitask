-- Responsible project managers may approve work within their own portfolio,
-- including work they submitted or were assigned. HODs and temporary covers
-- retain their existing review lane; PM authority is an additional override.
create or replace function private.aitask_task_reviewers(p_workspace text,p_task jsonb)
returns table(id text) language sql stable security definer set search_path='' as $$
  with available as (
    select m.id,m.role,m.is_super_admin from public.aitask_members m
    where m.workspace_id=p_workspace and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
      and m.id is distinct from p_task->>'assignedTo'
      and m.id is distinct from p_task->'workState'->>'reviewRequestedBy'
  ), cover as (
    select a.id from available a where a.id=p_task->'reviewCover'->>'reviewerId'
      and (p_task->'reviewCover'->>'expiresAt')::timestamptz>now()
  ), hods as (
    select a.id from available a where a.role in('HOD','Staff')
  ), pms as (
    select m.id from public.aitask_members m
    where m.workspace_id=p_workspace and m.role='Project Manager' and not m.is_super_admin
      and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
  )
  select id from cover
  union select id from hods where not exists(select 1 from cover)
  union select id from pms
  union select m.id from public.aitask_members m
    where m.workspace_id=p_workspace and m.is_super_admin
      and private.aitask_review_member_can_lead(p_workspace,p_task,m.id)
      and not exists(select 1 from cover)
      and not exists(select 1 from hods)
      and not exists(select 1 from pms);
$$;
revoke all on function private.aitask_task_reviewers(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aitask_can_sign_task_review(p_workspace text,p_task jsonb,p_reason text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    private.aitask_review_member_can_lead(p_workspace,p_task,private.aitask_member_id(p_workspace))
    and (
      (
        private.aitask_member_id(p_workspace) is distinct from p_task->>'assignedTo'
        and private.aitask_member_id(p_workspace) is distinct from p_task->'workState'->>'reviewRequestedBy'
        and (
          private.aitask_is_super_admin(p_workspace)
          or exists(select 1 from private.aitask_task_reviewers(p_workspace,p_task) r
            where r.id=private.aitask_member_id(p_workspace))
        )
      )
      or (
        private.aitask_member_role(p_workspace)='Project Manager'
        and not private.aitask_is_super_admin(p_workspace)
        and exists(select 1 from public.aitask_members m
          where m.workspace_id=p_workspace and m.id=private.aitask_member_id(p_workspace)
            and m.role='Project Manager'
            and private.aitask_review_member_can_lead(p_workspace,p_task,m.id))
      )
      or (
        private.aitask_is_super_admin(p_workspace)
        and length(btrim(coalesce(p_reason,''))) between 1 and 2000
      )
    ),false
  );
$$;
revoke all on function private.aitask_can_sign_task_review(text,jsonb,text) from public,anon,authenticated,service_role;

-- Keep server-side error copy aligned with the expanded reviewer authority.
do $messages$
declare d text; a text:='Only an independent reviewer can approve submitted work.';
begin
  d:=pg_get_functiondef('private.aitask_guard_task_stage_progress()'::regprocedure);
  if strpos(d,a)=0 then raise exception 'Expected task approval error message'; end if;
  execute replace(d,a,'Only an authorized project manager, department reviewer, or Boss Koo can approve submitted work.');
  d:=pg_get_functiondef('private.aitask_guard_workflow_task()'::regprocedure);
  if strpos(d,a)=0 then raise exception 'Expected workflow approval error message'; end if;
  execute replace(d,a,'Only an authorized project manager, department reviewer, or Boss Koo can approve submitted work.');
end;
$messages$;

-- Review notices can now reach both the department lane and the PM authority.
do $notification_copy$
declare d text; a text:=' is ready for department review.';
begin
  d:=pg_get_functiondef('private.aitask_notify_hod_review_submission()'::regprocedure);
  if strpos(d,a)=0 then raise exception 'Expected review notification message'; end if;
  execute replace(d,a,' is ready for review.');
end;
$notification_copy$;

-- Make already-submitted tasks actionable for newly eligible PM reviewers.
do $backfill$
declare v_task record; v_reviewer record; v_id text;
  v_server_notification text:=current_setting('aitask.server_notification',true);
begin
  for v_task in select workspace_id,entity_id,data from public.aitask_entities
    where entity_type='task' and data->>'status'='Waiting Approval'
  loop
    for v_reviewer in
      select reviewer.id from private.aitask_task_reviewers(v_task.workspace_id,v_task.data) reviewer
      join public.aitask_members member
        on member.workspace_id=v_task.workspace_id and member.id=reviewer.id
      where member.role='Project Manager' and not member.is_super_admin
        and not exists(select 1 from public.aitask_entities notice
          where notice.workspace_id=v_task.workspace_id and notice.entity_type='notification'
            and notice.parent_id=v_task.entity_id
            and notice.data->>'targetUserId'=reviewer.id
            and notice.data->>'title'='Task Ready for Approval')
    loop
      v_id:='N-pm-review-'||replace(gen_random_uuid()::text,'-','');
      perform set_config('aitask.server_notification','true',true);
      insert into public.aitask_entities(workspace_id,entity_type,entity_id,parent_id,data)
      values(v_task.workspace_id,'notification',v_id,v_task.entity_id,jsonb_build_object(
        'id',v_id,'targetUserId',v_reviewer.id,'title','Task Ready for Approval',
        'message','"'||left(coalesce(v_task.data->>'title','Task'),160)||'" is ready for review.',
        'route',jsonb_build_object('page','tasks','entityId',v_task.entity_id),
        'iconType','status','isRead',false,'readByUserIds','[]'::jsonb,
        'createdAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    end loop;
  end loop;
  perform set_config('aitask.server_notification',coalesce(v_server_notification,'false'),true);
end;
$backfill$;
