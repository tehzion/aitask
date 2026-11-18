begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009601','authenticated','authenticated','boss-delete@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009602','authenticated','authenticated','removed@aitask.local','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000009603','authenticated','authenticated','worker@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values ('pgtap-member-delete','Member deletion recovery');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,is_super_admin) values
  ('delete-boss','pgtap-member-delete','00000000-0000-0000-0000-000000009601','Boss','boss-delete@aitask.local','Project Manager','Management','{Management}',true),
  ('delete-target','pgtap-member-delete','00000000-0000-0000-0000-000000009602','Removed Member','removed@aitask.local','HOD','Designer','{Designer}',false),
  ('delete-worker','pgtap-member-delete','00000000-0000-0000-0000-000000009603','Remaining Worker','worker@aitask.local','Staff','Designer','{Designer}',false);
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
  ('pgtap-member-delete','task','delete-owned-task','{"id":"delete-owned-task","title":"Owned","department":"Designer","createdBy":"delete-worker","assignedTo":"delete-target","assignedBy":"delete-target","assignedAt":"2026-10-01T00:00:00.000Z","responsibleHodId":"delete-target","assignmentState":"assigned_staff","status":"Pending"}'),
  ('pgtap-member-delete','task','delete-other-task','{"id":"delete-other-task","title":"Other assignee","department":"Designer","createdBy":"delete-worker","assignedTo":"delete-worker","assignedBy":"delete-target","assignedAt":"2026-10-01T00:00:00.000Z","responsibleHodId":"delete-target","assignmentState":"assigned_staff","status":"Pending"}');

select is((public.aitask_delete_member_account('delete-boss','delete-target')->>'ok')::boolean, true, 'member deletion completes');
select is((select count(*)::int from public.aitask_members where workspace_id='pgtap-member-delete' and id='delete-target'), 0, 'the removed member row is gone');
select is((select data->>'assignedTo' from public.aitask_entities where workspace_id='pgtap-member-delete' and entity_id='delete-owned-task'), '', 'the assigned task is unassigned');
select is((select data->>'assignedBy' from public.aitask_entities where workspace_id='pgtap-member-delete' and entity_id='delete-owned-task'), '', 'the removed member attribution is cleared');
select is((select data->>'responsibleHodId' from public.aitask_entities where workspace_id='pgtap-member-delete' and entity_id='delete-owned-task'), '', 'the removed member HOD reference is cleared');
select is((select data->>'assignedTo' from public.aitask_entities where workspace_id='pgtap-member-delete' and entity_id='delete-other-task'), 'delete-worker', 'another assignee is preserved');
select is((public.aitask_delete_member_account('delete-boss','delete-target')->>'alreadyDeleted')::boolean, true, 'a retry after a lost response is idempotent');

select * from finish();
rollback;
