begin;
select plan(12);
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002901','authenticated','authenticated','workload-hod@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002902','authenticated','authenticated','workload-staff@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002903','authenticated','authenticated','workload-other@aitask.local','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000002904','authenticated','authenticated','workload-client@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id, name) values ('workload-test', 'Workload test'), ('workload-other', 'Other workspace');
insert into public.aitask_members(id, workspace_id, auth_user_id, name, role, department, departments, permissions) values
('workload-hod', 'workload-test', '00000000-0000-0000-0000-000000002901', 'Designer HOD', 'HOD', 'Designer', array['Designer'], '{}'),
('workload-staff', 'workload-test', '00000000-0000-0000-0000-000000002902', 'Video Staff', 'Staff', 'Video Editor', array['Video Editor'], '{}'),
('workload-other', 'workload-other', '00000000-0000-0000-0000-000000002903', 'Other Staff', 'Staff', 'Designer', array['Designer'], '{}'),
('workload-client', 'workload-test', '00000000-0000-0000-0000-000000002904', 'Client', 'Client', 'Client', array['Client'], '{}');
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
('workload-test','task','workload-open',jsonb_build_object('id','workload-open','title','Private video task','status','Pending','isCompleted',false,'department','Video Editor','assignedTo','workload-staff','dueDate',to_char((now() at time zone 'UTC')::date - 1, 'YYYY-MM-DD'))),
('workload-test','task','workload-done',jsonb_build_object('id','workload-done','title','Done video task','status','Completed','isCompleted',true,'department','Video Editor','assignedTo','workload-staff')),
('workload-other','task','workload-elsewhere',jsonb_build_object('id','workload-elsewhere','title','Other workspace task','status','Pending','isCompleted',false,'department','Designer','assignedTo','workload-other'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002901',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)->>'ok','true','HOD can request aggregate workload');
select is(jsonb_array_length(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)->'members'),1,'only staff in the selected workspace are returned');
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)#>>'{members,0,open}','1','completed work is excluded');
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)#>>'{members,0,overdue}','1','overdue count includes another department');
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)#>>'{members,0,dueThisWeek}', case when ((now() at time zone 'UTC')::date - 1) between date_trunc('week', now() at time zone 'UTC')::date and date_trunc('week', now() at time zone 'UTC')::date + 5 then '1' else '0' end, 'due-this-week follows Monday through Saturday');
select ok(not has_function_privilege('anon', 'public.aitask_hod_staff_workload(text,date)', 'execute'), 'anonymous callers cannot execute the endpoint');
select ok(position('Private video task' in public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)::text) = 0, 'task details are not returned');
select ok(not private.aitask_can_view_task('workload-test','workload-open'),'aggregate access does not grant task visibility');
select is(public.aitask_hod_staff_workload('workload-other',(now() at time zone 'UTC')::date)->>'code','FORBIDDEN','HOD cannot query a different workspace');
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date - 10)->>'code','VALIDATION','arbitrary historical dates are rejected');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002902',true);
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)->>'code','FORBIDDEN','staff cannot query the all-department summary');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000002904',true);
select is(public.aitask_hod_staff_workload('workload-test',(now() at time zone 'UTC')::date)->>'code','FORBIDDEN','client cannot query the all-department summary');
reset role;
select * from finish();
rollback;
