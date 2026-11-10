-- HODs can see workload totals across departments without gaining access to
-- the underlying task records. Dates are supplied in the viewer's local day.
create or replace function private.aitask_hod_staff_workload(p_workspace_id text, p_today date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.aitask_members member
    where member.workspace_id = p_workspace_id and member.auth_user_id = (select auth.uid())
      and (member.role = 'HOD' or (member.role = 'Staff' and (
        member.custom_role_id = 'builtin-hod' or exists (
          select 1 from public.aitask_entities role
          where role.workspace_id = member.workspace_id and role.entity_type = 'custom_role'
            and role.entity_id = member.custom_role_id and role.data->>'isBuiltin' = 'true' and role.data->>'baseRole' = 'HOD'
        )
      )))
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_today is null or p_today < (now() at time zone 'UTC')::date - 1 or p_today > (now() at time zone 'UTC')::date + 1 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION');
  end if;
  v_start := date_trunc('week', p_today::timestamp)::date;
  v_end := v_start + 5;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', member.id, 'name', member.name, 'departments', member.departments,
    'open', coalesce(counts.open, 0), 'overdue', coalesce(counts.overdue, 0), 'dueThisWeek', coalesce(counts.due_week, 0)
  ) order by member.name, member.id), '[]'::jsonb) into v_result
  from public.aitask_members member
  left join lateral (
    select count(*) filter (where open_task) as open,
      count(*) filter (where open_task and due < to_char(p_today, 'YYYY-MM-DD')) as overdue,
      count(*) filter (where open_task and due between to_char(v_start, 'YYYY-MM-DD') and to_char(v_end, 'YYYY-MM-DD')) as due_week
    from (
      select coalesce(task.data->>'isCompleted', 'false') <> 'true'
          and coalesce(task.data->>'status', '') not in ('Completed', 'Cancelled') as open_task,
        case when task.data->>'dueDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then task.data->>'dueDate' end as due
      from public.aitask_entities task
      where task.workspace_id = p_workspace_id and task.entity_type = 'task' and task.assigned_to = member.id
    ) task_rows
  ) counts on true
  where member.workspace_id = p_workspace_id and member.role = 'Staff'
    and member.custom_role_id is distinct from 'builtin-hod'
    and not exists (select 1 from public.aitask_entities role
      where role.workspace_id = member.workspace_id and role.entity_type = 'custom_role'
        and role.entity_id = member.custom_role_id and role.data->>'isBuiltin' = 'true' and role.data->>'baseRole' = 'HOD');
  return jsonb_build_object('ok', true, 'members', v_result);
end;
$$;
revoke all on function private.aitask_hod_staff_workload(text, date) from public, anon, authenticated;
grant execute on function private.aitask_hod_staff_workload(text, date) to authenticated;

create or replace function public.aitask_hod_staff_workload(p_workspace_id text, p_today date)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.aitask_hod_staff_workload(p_workspace_id, p_today); $$;
revoke all on function public.aitask_hod_staff_workload(text, date) from public, anon, authenticated;
grant execute on function public.aitask_hod_staff_workload(text, date) to authenticated;
