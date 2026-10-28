begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001701', 'authenticated', 'authenticated', 'workflow-action-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001702', 'authenticated', 'authenticated', 'workflow-action-staff@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001703', 'authenticated', 'authenticated', 'workflow-action-other@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000001704', 'authenticated', 'authenticated', 'workflow-action-pm@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-workflow-actions', 'Task workflow action guards');

insert into public.aitask_members(id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin)
values
  ('workflow-boss', 'pgtap-workflow-actions', '00000000-0000-0000-0000-000000001701', 'Workflow Boss', 'workflow-action-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}', true),
  ('workflow-staff', 'pgtap-workflow-actions', '00000000-0000-0000-0000-000000001702', 'Workflow Staff', 'workflow-action-staff@aitask.local', 'Staff', 'Designer', array['Designer'], '{}', false),
  ('workflow-other', 'pgtap-workflow-actions', '00000000-0000-0000-0000-000000001703', 'Other Staff', 'workflow-action-other@aitask.local', 'Staff', 'Designer', array['Designer'], '{}', false),
  ('workflow-pm', 'pgtap-workflow-actions', '00000000-0000-0000-0000-000000001704', 'Workflow PM', 'workflow-action-pm@aitask.local', 'Project Manager', 'Management', array['Management'], '{}', false);

create function pg_temp.task_command(p_action text, p_id text, p_data jsonb)
returns jsonb language sql as $$
  select public.aitask_execute_command(
    'pgtap-workflow-actions', gen_random_uuid(),
    'task.update',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', p_action, 'entityType', 'task', 'entityId', p_id,
      'expectedVersion', (select version from public.aitask_entities
        where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = p_id),
      'data', p_data
    ))
  );
$$;

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-workflow-actions', 'task', 'workflow-no-approval', jsonb_build_object(
    'id', 'workflow-no-approval', 'title', 'No approval work', 'clientName', 'Workflow Co',
    'serviceType', 'Design', 'department', 'Designer', 'assignedTo', 'workflow-staff',
    'createdBy', 'workflow-boss', 'status', 'Pending', 'approvalMode', 'none',
    'requiresInternalApproval', false, 'isCompleted', false, 'completionPercentage', 0,
    'clientApprovalStatus', 'Pending', 'revisionCount', 0
  )),
  ('pgtap-workflow-actions', 'task', 'workflow-reviewed', jsonb_build_object(
    'id', 'workflow-reviewed', 'title', 'Reviewed work', 'clientName', 'Workflow Co',
    'serviceType', 'Design', 'department', 'Designer', 'assignedTo', 'workflow-staff',
    'createdBy', 'workflow-pm', 'status', 'In Progress', 'approvalMode', 'hod',
    'requiresInternalApproval', true, 'isCompleted', false, 'completionPercentage', 30,
    'clientApprovalStatus', 'Pending', 'revisionCount', 0
  )),
  ('pgtap-workflow-actions', 'task', 'workflow-pm-review', jsonb_build_object(
    'id', 'workflow-pm-review', 'title', 'PM reviewed work', 'clientName', 'Workflow Co',
    'serviceType', 'Design', 'department', 'Designer', 'assignedTo', 'workflow-staff',
    'createdBy', 'workflow-pm', 'status', 'In Progress', 'approvalMode', 'hod',
    'requiresInternalApproval', true, 'isCompleted', false, 'completionPercentage', 30,
    'clientApprovalStatus', 'Pending', 'revisionCount', 0
  ));

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001702', true);
set local role authenticated;

select is(((pg_temp.task_command('update', 'workflow-no-approval',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-no-approval')
    || jsonb_build_object('status', 'In Progress', 'completionPercentage', 30)
))->>'ok')::boolean, true, 'assigned Staff can start no-approval work');

select is(((pg_temp.task_command('update', 'workflow-no-approval',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-no-approval')
    || jsonb_build_object('status', 'Waiting Approval')
))->>'ok')::boolean, false, 'no-approval work cannot be diverted into review');

select is(((pg_temp.task_command('update', 'workflow-no-approval',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-no-approval')
    || jsonb_build_object('status', 'Completed', 'isCompleted', true)
))->>'ok')::boolean, true, 'assigned Staff can complete no-approval work');

select is((select data->>'status' from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-no-approval'), 'Completed', 'no-approval completion is persisted atomically');

select is(((pg_temp.task_command('update', 'workflow-reviewed',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-reviewed')
    || jsonb_build_object('status', 'Completed', 'isCompleted', true)
))->>'ok')::boolean, false, 'Staff cannot complete work that requires review');

select is(((pg_temp.task_command('update', 'workflow-reviewed',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-reviewed')
    || jsonb_build_object('status', 'Waiting Approval')
))->>'ok')::boolean, true, 'assigned Staff can submit reviewed work');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001703', true);
select is(((pg_temp.task_command('update', 'workflow-reviewed',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-reviewed')
    || jsonb_build_object('status', 'Approved')
))->>'ok')::boolean, false, 'an unassigned Staff member cannot approve submitted work');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001704', true);
select is(((pg_temp.task_command('update', 'workflow-pm-review',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-pm-review')
    || jsonb_build_object('status', 'Waiting Approval')
))->>'ok')::boolean, true, 'the responsible Project Manager can submit owned reviewed work');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001702', true);
select is(((pg_temp.task_command('update', 'workflow-reviewed',
  (select data from public.aitask_entities where workspace_id = 'pgtap-workflow-actions' and entity_type = 'task' and entity_id = 'workflow-reviewed')
    || jsonb_build_object('status', 'QA review')
))->>'ok')::boolean, false, 'direct custom status changes are rejected for ordinary Staff');

select * from finish();
rollback;
