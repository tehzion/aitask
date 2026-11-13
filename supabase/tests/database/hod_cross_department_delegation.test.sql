begin;
create extension if not exists pgtap with schema extensions;
select plan(34);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,banned_until)
select '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-0000-0000-' || lpad((9200+n)::text,12,'0'))::uuid,
  'authenticated','authenticated','cross-' || n || '@aitask.local','',now(),'{}','{}',now(),now(),
  case when n=4 then now()+interval '1 day' else null end
from generate_series(1,5) n;
insert into public.aitask_workspaces(id,name) values ('cross-delegation-test','Cross-department delegation');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,client_name) values
('cross-hod','cross-delegation-test','00000000-0000-0000-0000-000000009201','HOD','cross-1@aitask.local','HOD','Designer',array['Designer'],null),
('cross-same','cross-delegation-test','00000000-0000-0000-0000-000000009202','Same','cross-2@aitask.local','Staff','Designer',array['Designer'],null),
('cross-other','cross-delegation-test','00000000-0000-0000-0000-000000009203','Other','cross-3@aitask.local','Staff','Video Editor',array['Video Editor'],null),
('cross-banned','cross-delegation-test','00000000-0000-0000-0000-000000009204','Banned','cross-4@aitask.local','Staff','Designer',array['Designer'],null),
('cross-client','cross-delegation-test','00000000-0000-0000-0000-000000009205','Client','cross-5@aitask.local','Client','Client',array['Client'],'Cross Co'),
('cross-unlinked','cross-delegation-test',null,'Unlinked','cross-unlinked@aitask.local','Staff','Designer',array['Designer'],null);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('cross-delegation-test','client','cross-company','{"id":"cross-company","clientName":"Cross Co","createdBy":"cross-hod"}'),
('cross-delegation-test','project','cross-project','{"id":"cross-project","projectName":"Project","clientId":"cross-company","clientName":"Cross Co","createdBy":"cross-hod","hodMemberIds":["cross-hod"],"staffMemberIds":[]}'),
('cross-delegation-test','service_cycle','cross-cycle','{"id":"cross-cycle","clientId":"cross-company","clientName":"Cross Co","status":"Published","serviceItems":[]}'),
('cross-delegation-test','deliverable','cross-output','{"id":"cross-output","clientId":"cross-company","clientName":"Cross Co","cycleId":"cross-cycle","taskIds":["cross"],"attachments":[],"status":"In Progress"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'cross-delegation-test','task',id,jsonb_build_object('id',id,'title','Cross work','clientId','cross-company','clientName','Cross Co',
 'projectId','cross-project','serviceCycleId',case when id='cross' then 'cross-cycle' else null end,'department','Designer','assignedTo',case when id='unowned' then 'cross-same' else 'cross-hod' end,
 'responsibleHodId',case when id='unowned' then '' else 'cross-hod' end,'assignmentState','pending_hod',
 'createdBy','cross-hod','status',case when id='in-progress' then 'In Progress' when id in ('Waiting Approval','Approved','Completed','Cancelled') then id else 'Pending' end,
 'isCompleted',id='Completed','visibility','internal','clientApprovalStatus','Pending')
from unnest(array['same','cross','in-progress','bad-client','bad-banned','bad-login','unowned','move','Waiting Approval','Approved','Completed','Cancelled']) id;
create function pg_temp.cross_update(p_id text,p_patch jsonb,p_notice boolean default false) returns jsonb language plpgsql as $$
declare d jsonb; v bigint; ops jsonb;
begin
 select data,version into d,v from public.aitask_entities where workspace_id='cross-delegation-test' and entity_type='task' and entity_id=p_id;
 ops := jsonb_build_array(jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_id,'expectedVersion',v,'data',d || p_patch));
 if p_notice then
   ops := ops || jsonb_build_array(jsonb_build_object('kind','entity','action','insert','entityType','notification','entityId','notice-'||p_id,'expectedVersion',0,
     'data',jsonb_build_object('id','notice-'||p_id,'targetUserId',p_patch->>'assignedTo','title','Task Assigned To You','message','Assigned',
       'route',jsonb_build_object('page','tasks','entityId',p_id),'iconType','task')));
 end if;
 return public.aitask_execute_command('cross-delegation-test',gen_random_uuid(),'task.update',ops);
end; $$;
create function pg_temp.handoff(p_id text,p_target text,p_extra jsonb default '{}'::jsonb,p_notice boolean default false) returns jsonb language sql as $$
 select pg_temp.cross_update(p_id,jsonb_build_object('assignedTo',p_target,'assignedBy','cross-hod','responsibleHodId','cross-hod','assignmentState','assigned_staff','status','Pending') || p_extra,p_notice)
$$;
select ok(not has_function_privilege('anon','public.aitask_hod_eligible_staff(text)','execute'),'anonymous role cannot call eligibility lookup');
select ok(not has_function_privilege('service_role','public.aitask_hod_eligible_staff(text)','execute'),'service role is not granted the lookup');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009201',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((select count(*)::int from public.aitask_hod_eligible_staff('cross-delegation-test')),2,'HOD eligibility lookup contains only active Staff with logins');
select ok(not exists(select 1 from public.aitask_hod_eligible_staff('cross-delegation-test') where id in ('cross-banned','cross-unlinked','cross-client')),'eligibility lookup excludes banned, unlinked, and Client members');
select is((pg_temp.handoff('same','cross-same')->>'ok')::boolean,true,'same-department delegation succeeds');
select is((pg_temp.handoff('cross','cross-other','{}',true)->>'ok')::boolean,true,'cross-department delegation and notification succeed atomically');
select is((pg_temp.cross_update('in-progress','{"assignedTo":"cross-other","status":"Pending"}')->>'ok')::boolean,true,'in-progress owned work can be delegated across departments');
select is((select jsonb_build_object('responsibleHodId',data->>'responsibleHodId','assignmentState',data->>'assignmentState','assignedBy',data->>'assignedBy') from public.aitask_entities where entity_id='in-progress'),'{"responsibleHodId":"cross-hod","assignmentState":"assigned_staff","assignedBy":"cross-hod"}'::jsonb,'delegation trigger retains the HOD and stamps server assignment metadata');
select is((pg_temp.handoff('bad-client','cross-client','{}',true)->>'ok')::boolean,false,'Client cannot be selected');
select is((select count(*)::int from public.aitask_entities where workspace_id='cross-delegation-test' and entity_type='notification' and entity_id='notice-bad-client'),0,'denied delegation does not persist its notification');
select is((pg_temp.handoff('bad-banned','cross-banned')->>'ok')::boolean,false,'banned Staff cannot be selected');
select is((pg_temp.handoff('bad-login','cross-unlinked')->>'ok')::boolean,false,'unlinked Staff cannot be selected');
select is((pg_temp.handoff('unowned','cross-other')->>'ok')::boolean,false,'HOD cannot assign an unowned task');
select is((pg_temp.handoff('move','cross-other','{"projectId":"other-project"}')->>'ok')::boolean,false,'handoff cannot move the task');
select is((pg_temp.handoff('Waiting Approval','cross-other')->>'ok')::boolean,false,'submitted task cannot be reassigned');
select is((pg_temp.handoff('Approved','cross-other')->>'ok')::boolean,false,'approved task cannot be reassigned');
select is((pg_temp.handoff('Completed','cross-other')->>'ok')::boolean,false,'completed task cannot be reassigned');
select is((pg_temp.handoff('Cancelled','cross-other')->>'ok')::boolean,false,'cancelled task cannot be reassigned');
select is((select data->>'responsibleHodId' from public.aitask_entities where entity_id='cross'),'cross-hod','responsible HOD remains');
select ok(private.aitask_can_view_task('cross-delegation-test','cross'),'HOD retains task visibility');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009203',true);
set local role authenticated;
select is((select count(*)::int from public.aitask_hod_eligible_staff('cross-delegation-test')),0,'ordinary Staff cannot use the HOD eligibility lookup');
select is((select count(*)::int from public.aitask_entities where entity_id='cross'),1,'assignee sees task through RLS');
select is((select count(*)::int from public.aitask_entities where entity_id='cross-project'),1,'assignee sees project through RLS');
select is((select count(*)::int from public.aitask_entities where entity_id='cross-company'),1,'assignee sees client through RLS');
select is((select count(*)::int from public.aitask_entities where entity_id='notice-cross'),1,'assignee receives linked notification');
select is((pg_temp.cross_update('cross','{"workState":{"acceptedBy":"cross-other"}}')->>'ok')::boolean,true,'cross-department Staff accepts work');
select is((pg_temp.cross_update('cross','{"status":"In Progress"}')->>'ok')::boolean,true,'cross-department Staff starts work');
select is((pg_temp.cross_update('cross','{"attachmentLink":"https://example.com/output"}')->>'ok')::boolean,true,'cross-department Staff adds an output link');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) values ('client-service-files','cross-delegation-test/cross-company/cross-cycle/output.pdf','00000000-0000-0000-0000-000000009203','{"mimetype":"application/pdf"}')$$,'cross-department Staff can upload a file to the task cycle');
select is((public.aitask_execute_command('cross-delegation-test',gen_random_uuid(),'comment.add',jsonb_build_array(
 jsonb_build_object('kind','entity','action','update','entityType','task','entityId','cross',
  'expectedVersion',(select version from public.aitask_entities where entity_id='cross'),
  'data',(select data || jsonb_build_object('updatedAt',now()) from public.aitask_entities where entity_id='cross')),
 jsonb_build_object('kind','entity','action','insert','entityType','comment','entityId','cross-comment','parentId','cross','expectedVersion',0,
  'data',jsonb_build_object('id','cross-comment','taskId','cross','userId','cross-other','text','Progress update','createdAt',now()))
))->>'ok')::boolean,true,'cross-department Staff adds a comment');
select is((pg_temp.cross_update('cross','{"outputAttachments":[{"id":"file","bucket":"client-service-files","path":"cross-delegation-test/cross-company/cross-cycle/output.pdf","fileName":"Output.pdf","uploadedBy":"cross-other"}]}')->>'ok')::boolean,true,'cross-department Staff attaches an owned file');

select is((pg_temp.cross_update('cross','{"status":"Waiting Approval"}')->>'ok')::boolean,true,'cross-department Staff submits work for review');
reset role;
select ok(exists(select 1 from private.aitask_task_reviewers('cross-delegation-test',(select data from public.aitask_entities where entity_id='cross')) where id='cross-hod'),'review routes to the task department HOD');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000009202',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((pg_temp.cross_update('same','{"assignedTo":"cross-other","assignedBy":"cross-same","responsibleHodId":"cross-hod","assignmentState":"assigned_staff"}')->>'ok')::boolean,false,'ordinary Staff cannot reassign work to another Staff member');
reset role;
select * from finish();
rollback;
