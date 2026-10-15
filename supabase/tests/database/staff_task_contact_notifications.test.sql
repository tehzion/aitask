begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000'::uuid,
  ('00000000-0000-0000-0000-' || lpad((7000+n)::text,12,'0'))::uuid,
  'authenticated','authenticated','staff-contact-' || n || '@aitask.local','',now(),'{}'::jsonb,'{}'::jsonb,now(),now()
from generate_series(1,7) n;
insert into public.aitask_workspaces(id,name) values ('pgtap-staff-contact','Staff HOD contact notices');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,custom_role_id)
select id,'pgtap-staff-contact',('00000000-0000-0000-0000-' || lpad((7000+n)::text,12,'0'))::uuid,
  id,'staff-contact-' || n || '@aitask.local',role,department,array[department],custom_role_id
from (values
  (1,'contact-worker','Staff','Designer',null),
  (2,'contact-pm','Project Manager','Management',null),
  (3,'contact-hod','HOD','Designer',null),
  (4,'contact-other','HOD','Designer',null),
  (5,'contact-former','HOD','Video Editor',null),
  (6,'contact-builtin','Staff','Designer','builtin-hod'),
  (7,'contact-creator','HOD','Video Editor',null)
) m(n,id,role,department,custom_role_id);

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
values ('pgtap-staff-contact','client','contact-company','{"id":"contact-company","clientName":"Contact Co","createdBy":"contact-pm"}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data)
select 'pgtap-staff-contact','task',id,jsonb_build_object(
  'id',id,'title','Contact artwork','clientId','contact-company','clientName','Contact Co',
  'department','Designer','assignedTo','contact-worker','assignedBy',assigner,'createdBy',creator,
  'status','Waiting Approval','visibility','internal')
from (values
  ('contact-task','contact-hod','contact-pm'),
  ('contact-builtin-task','contact-builtin','contact-pm'),
  ('contact-former-task','contact-former','contact-pm'),
  ('contact-creator-task','contact-worker','contact-hod'),
  ('contact-own-task','contact-worker','contact-creator')
) t(id,assigner,creator);

-- Exercise the public command API, not just the recipient predicate. Every
-- attempt includes a real comment, canonical task update and a targeted notice.
create function pg_temp.send_contact_notice(p_task text,p_recipient text,p_route text default null,p_command text default 'comment.add')
returns jsonb language plpgsql as $$
declare
  v_id text := gen_random_uuid()::text;
  v_task jsonb;
  v_version bigint;
begin
  select data,version into v_task,v_version from public.aitask_entities
    where workspace_id='pgtap-staff-contact' and entity_type='task' and entity_id=p_task;
  return public.aitask_execute_command('pgtap-staff-contact',gen_random_uuid(),p_command,jsonb_build_array(
    jsonb_build_object('kind','entity','action','update','entityType','task','entityId',p_task,
      'expectedVersion',v_version,'data',v_task || jsonb_build_object('updatedAt',now())),
    jsonb_build_object('kind','entity','action','insert','entityType','comment','entityId',v_id,'parentId',p_task,
      'expectedVersion',0,'data',jsonb_build_object('id',v_id,'taskId',p_task,'userId','contact-worker',
        'text','Please share the review result','createdAt',now())),
    jsonb_build_object('kind','entity','action','insert','entityType','notification','entityId','notice-' || v_id,
      'expectedVersion',0,'data',jsonb_build_object('id','notice-' || v_id,'targetUserId',p_recipient,
        'title','New Comment','message','Untrusted fabricated content','iconType','status',
        'route',jsonb_build_object('page','tasks','entityId',coalesce(p_route,p_task))))
  ));
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000007001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

select is((pg_temp.send_contact_notice('contact-task','contact-hod')->>'ok')::boolean,true,
  'Staff review enquiry saves with its displayed HOD contact notification');
select is((pg_temp.send_contact_notice('contact-task','contact-pm')->>'ok')::boolean,true,
  'Responsible PM oversight remains valid');
select is((pg_temp.send_contact_notice('contact-task','contact-other')->>'ok')::boolean,false,
  'An unrelated HOD in the same department cannot receive the notice');
select is((pg_temp.send_contact_notice('contact-task','contact-former')->>'ok')::boolean,false,
  'An unrelated HOD outside the department cannot receive the notice');
select is((pg_temp.send_contact_notice('contact-former-task','contact-former')->>'ok')::boolean,false,
  'A former assigning HOD without task visibility cannot receive the notice');
select is((pg_temp.send_contact_notice('contact-builtin-task','contact-builtin')->>'ok')::boolean,true,
  'The Staff-based builtin HOD contact receives the notice');
select is((pg_temp.send_contact_notice('contact-creator-task','contact-hod')->>'ok')::boolean,true,
  'Creator contact is selected when the assigner is the current assignee');
select is((pg_temp.send_contact_notice('contact-own-task','contact-creator')->>'ok')::boolean,true,
  'A HOD creator can receive a notice for their own task outside their department');
select is((pg_temp.send_contact_notice('contact-task','contact-hod','contact-builtin-task')->>'ok')::boolean,false,
  'A valid HOD contact does not bypass command/task context binding');

reset role;
select is((select count(*)::integer from public.aitask_entities where workspace_id='pgtap-staff-contact' and entity_type='comment'),5,
  'Rejected notification audiences roll back their comments atomically');
select ok(not exists(select 1 from public.aitask_entities where workspace_id='pgtap-staff-contact' and entity_type='notification'
  and data->>'message'='Untrusted fabricated content'),
  'HOD contact notices retain canonical message normalization');
select ok(not has_function_privilege('authenticated','private.aitask_guard_staff_notification_insert()','execute')
  and not has_function_privilege('anon','private.aitask_guard_staff_notification_insert()','execute'),
  'The notification trigger remains private and uncallable by API roles');

select * from finish();
rollback;
