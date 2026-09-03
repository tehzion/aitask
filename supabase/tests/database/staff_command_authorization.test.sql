begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_function(
  'private',
  'aitask_guard_staff_notification_insert',
  array[]::text[],
  'Staff notification inserts have a database guard'
);
select has_function(
  'private',
  'aitask_seed_staff_task_context',
  array['text', 'jsonb'],
  'Staff task context is seeded before command operations execute'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.aitask_execute_command_before_staff_context(text,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the Staff context wrapper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.aitask_execute_command_with_lock_before_staff_context(text,uuid,text,jsonb,bigint)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the workspace-lock Staff context wrapper'
);
select has_function(
  'private',
  'aitask_guard_scoped_staff_service_write',
  array[]::text[],
  'scoped Staff service writes have a database guard'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_track_staff_task_command',
  'task commands record their Staff authorization context'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_00_guard_staff_notification_insert',
  'notification inserts enforce Staff task context'
);
select has_trigger(
  'public',
  'aitask_entities',
  'aitask_00_guard_scoped_staff_service_write',
  'service records enforce scoped Staff execution permissions'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000912',
  'authenticated',
  'authenticated',
  'pgtap-staff-authorization@aitask.local',
  '',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.aitask_workspaces(id, name)
values ('pgtap-staff-authorization', 'Staff authorization test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments
) values
  (
    'pgtap-staff-actor', 'pgtap-staff-authorization',
    '00000000-0000-0000-0000-000000000912', 'Staff Actor',
    'pgtap-staff-authorization@aitask.local', 'Staff', 'Designer', array['Designer']
  ),
  (
    'pgtap-staff-coworker', 'pgtap-staff-authorization', null, 'Staff Coworker',
    'pgtap-staff-coworker@aitask.local', 'Staff', 'Designer', array['Designer']
  );

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  (
    'pgtap-staff-authorization', 'client', 'pgtap-client',
    '{"id":"pgtap-client","clientName":"Test Client"}'::jsonb
  ),
  (
    'pgtap-staff-authorization', 'task', 'pgtap-assigned-task',
    '{"id":"pgtap-assigned-task","title":"Assigned task","clientId":"pgtap-client","clientName":"Test Client","department":"Designer","assignedTo":"pgtap-staff-actor","createdBy":"pgtap-staff-actor","status":"Pending","visibility":"client-visible","dueDate":"2099-01-01"}'::jsonb
  ),
  (
    'pgtap-staff-authorization', 'task', 'pgtap-legacy-delete-task',
    '{"id":"pgtap-legacy-delete-task","title":"Legacy delete task","clientId":"pgtap-client","clientName":"Test Client","department":"Designer","assignedTo":"pgtap-staff-actor","createdBy":"pgtap-staff-actor","status":"Pending","visibility":"internal","dueDate":"2099-01-02"}'::jsonb
  ),
  (
    'pgtap-staff-authorization', 'service_cycle', 'pgtap-cycle',
    '{"id":"pgtap-cycle","clientId":"pgtap-client","clientName":"Test Client","status":"Draft","periodStart":"2099-01-01","periodEnd":"2099-01-31","updatedAt":"2099-01-01T00:00:00.000Z"}'::jsonb
  ),
  (
    'pgtap-staff-authorization', 'deliverable', 'pgtap-deliverable',
    '{"id":"pgtap-deliverable","clientId":"pgtap-client","clientName":"Test Client","cycleId":"pgtap-cycle","status":"Planned","taskIds":["pgtap-assigned-task"],"updatedAt":"2099-01-01T00:00:00.000Z"}'::jsonb
  );

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000912', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pgtap-coworker-task',
      'expectedVersion', 0, 'data', jsonb_build_object(
        'id', 'pgtap-coworker-task', 'title', 'Coworker task', 'clientName', 'Test Client',
        'department', 'Designer', 'assignedTo', 'pgtap-staff-coworker',
        'createdBy', 'pgtap-staff-actor', 'status', 'Pending', 'visibility', 'internal'
      )
    ))
  ) ->> 'code'),
  'FORBIDDEN',
  'ordinary Staff cannot assign a newly created task to a coworker'
);

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'task.create',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'task', 'entityId', 'pgtap-self-task',
      'expectedVersion', 0, 'data', jsonb_build_object(
        'id', 'pgtap-self-task', 'title', 'Self task', 'clientName', 'Test Client',
        'department', 'Designer', 'assignedTo', 'pgtap-staff-actor',
        'createdBy', 'pgtap-staff-actor', 'status', 'Pending', 'visibility', 'internal'
      )
    ))
  ) ->> 'ok')::boolean,
  true,
  'ordinary Staff can still create a task assigned to themselves'
);

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'workspace.patch',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'pgtap-forged-notification',
      'expectedVersion', 0, 'data', jsonb_build_object(
        'id', 'pgtap-forged-notification', 'targetRole', 'Admin', 'title', 'Security alert',
        'message', 'Forged by Staff', 'route', jsonb_build_object('page', 'tasks', 'entityId', 'pgtap-assigned-task'),
        'isRead', false, 'readByUserIds', jsonb_build_array(), 'createdAt', now()
      )
    ))
  ) ->> 'ok')::boolean,
  false,
  'Staff cannot insert a standalone notification for an unchanged task'
);

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'task.update',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task', 'entityId', 'pgtap-assigned-task',
        'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'task' and entity_id = 'pgtap-assigned-task'),
        'data', (select data || jsonb_build_object('status', 'In Progress', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'task' and entity_id = 'pgtap-assigned-task')
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification', 'entityId', 'pgtap-status-notification',
        'expectedVersion', 0, 'data', jsonb_build_object(
          'id', 'pgtap-status-notification', 'targetRole', 'Admin', 'title', 'Task Status Updated',
          'message', 'Forged content', 'route', jsonb_build_object('page', 'tasks', 'entityId', 'pgtap-assigned-task'),
          'isRead', false, 'readByUserIds', jsonb_build_array(), 'createdAt', now()
        )
      )
    )
  ) ->> 'ok')::boolean,
  true,
  'Staff task updates can still create an approved task-linked notification'
);

reset role;
select is(
  (select data ->> 'message' from public.aitask_entities
   where workspace_id = 'pgtap-staff-authorization'
     and entity_type = 'notification' and entity_id = 'pgtap-status-notification'),
  '"Assigned task" was moved to In Progress by Staff Actor.',
  'the database replaces Staff-supplied notification text with canonical content'
);
set local role authenticated;

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'service_cycle.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'service_cycle', 'entityId', 'pgtap-cycle',
      'parentId', null, 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle'),
      'data', (select data || jsonb_build_object('status', 'Published', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped Staff cannot publish a service cycle through the RPC'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'deliverable', 'entityId', 'pgtap-forged-deliverable',
      'parentId', 'pgtap-cycle', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-forged-deliverable', 'clientId', 'pgtap-client', 'clientName', 'Test Client',
        'cycleId', 'pgtap-cycle', 'status', 'Planned', 'taskIds', jsonb_build_array(), 'updatedAt', now()
      )
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped Staff cannot insert a deliverable through the RPC'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'deliverable', 'entityId', 'pgtap-deliverable',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped Staff cannot delete a deliverable through the RPC'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'deliverable', 'entityId', 'pgtap-deliverable',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable'),
      'data', (select data || jsonb_build_object('status', 'In Progress', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable')
    )), null
  ) ->> 'ok')::boolean,
  true,
  'scoped Staff can still update assigned deliverable progress'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'cycle_comment.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'cycle_comment', 'entityId', 'pgtap-cycle-comment',
      'parentId', 'pgtap-cycle', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-cycle-comment', 'clientId', 'pgtap-client', 'clientName', 'Test Client',
        'cycleId', 'pgtap-cycle', 'userId', 'pgtap-staff-actor', 'text', 'Progress update',
        'visibility', 'internal', 'attachments', jsonb_build_array(), 'createdAt', now(), 'updatedAt', now()
      )
    )), null
  ) ->> 'ok')::boolean,
  true,
  'scoped Staff can still add a valid comment to an assigned cycle'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'cycle_comment.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'cycle_comment', 'entityId', 'pgtap-cycle-comment',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'cycle_comment' and entity_id = 'pgtap-cycle-comment'),
      'data', (select data || jsonb_build_object('text', 'Rewritten comment', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'cycle_comment' and entity_id = 'pgtap-cycle-comment')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped Staff cannot rewrite an existing cycle comment'
);

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'task.delete',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'task', 'entityId', 'pgtap-self-task',
      'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-staff-authorization' and entity_type = 'task' and entity_id = 'pgtap-self-task')
    ))
  ) ->> 'ok')::boolean,
  true,
  'Staff can still delete an assigned task without supplying a notification'
);

reset role;
select is(
  (select count(*)::integer
   from public.aitask_entities
   where workspace_id = 'pgtap-staff-authorization'
     and entity_type = 'notification'
     and data ->> 'title' = 'Task Deleted'
     and data -> 'route' ->> 'entityId' = 'pgtap-self-task'
     and data ->> 'message' = 'Staff Actor deleted "Self task".'),
  1,
  'the database creates one canonical Admin notice for a Staff task deletion'
);
set local role authenticated;

-- The store emits a 'New Comment' notification targeted at the task assignee
-- whenever Staff comment on a task assigned to someone else (editTasks scope).
-- The guard must accept this trusted shape, not reject the whole command.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'comment.add',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task',
        'entityId', 'pgtap-assigned-task',
        'expectedVersion', (select version from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-assigned-task'),
        'data', (select data || jsonb_build_object('updatedAt', now())
          from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-assigned-task')
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'comment',
        'entityId', 'pgtap-self-comment', 'parentId', 'pgtap-assigned-task',
        'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-self-comment', 'taskId', 'pgtap-assigned-task',
          'userId', 'pgtap-staff-actor', 'text', 'A note on my task',
          'createdAt', now()
        )
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', 'pgtap-self-comment-notice', 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-self-comment-notice', 'targetUserId', 'pgtap-staff-actor',
          'title', 'New Comment', 'message', 'You have a new comment on "Assigned task".',
          'route', jsonb_build_object('page', 'tasks', 'entityId', 'pgtap-assigned-task'),
          'isRead', false, 'readByUserIds', jsonb_build_array(),
          'createdAt', now(), 'iconType', 'status'
        )
      )
    )
  ) ->> 'ok')::boolean,
  true,
  'assignee-targeted New Comment from Staff is permitted'
);

-- A 'New Comment' targeted at a member who is not the task assignee is rejected.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'comment.add',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task',
        'entityId', 'pgtap-assigned-task',
        'expectedVersion', (select version from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-assigned-task'),
        'data', (select data || jsonb_build_object('updatedAt', now())
          from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-assigned-task')
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'comment',
        'entityId', 'pgtap-bad-comment', 'parentId', 'pgtap-assigned-task',
        'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-bad-comment', 'taskId', 'pgtap-assigned-task',
          'userId', 'pgtap-staff-actor', 'text', 'Sneaky mention',
          'createdAt', now()
        )
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', 'pgtap-bad-comment-notice', 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-bad-comment-notice', 'targetUserId', 'pgtap-staff-coworker',
          'title', 'New Comment', 'message', 'Sneaky mention',
          'route', jsonb_build_object('page', 'tasks', 'entityId', 'pgtap-assigned-task'),
          'isRead', false, 'readByUserIds', jsonb_build_array(),
          'createdAt', now(), 'iconType', 'status'
        )
      )
    )
  ) ->> 'ok')::boolean,
  false,
  'a New Comment targeted at a non-assignee member is rejected'
);

-- A 'New Comment' targeted at an unrelated member is not a trusted shape.
select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'comment.add',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'task',
        'entityId', 'pgtap-coworker-task',
        'expectedVersion', (select version from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-coworker-task'),
        'data', (select data || jsonb_build_object('updatedAt', now())
          from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-coworker-task')
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'comment',
        'entityId', 'pgtap-bad-comment', 'parentId', 'pgtap-coworker-task',
        'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-bad-comment', 'taskId', 'pgtap-coworker-task',
          'userId', 'pgtap-staff-actor', 'text', 'Sneaky mention',
          'createdAt', now()
        )
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', 'pgtap-bad-comment-notice', 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-bad-comment-notice', 'targetUserId', 'pgtap-staff-actor',
          'title', 'New Comment', 'message', 'Sneaky mention',
          'route', jsonb_build_object('page', 'tasks', 'entityId', 'pgtap-coworker-task'),
          'isRead', false, 'readByUserIds', jsonb_build_array(),
          'createdAt', now(), 'iconType', 'status'
        )
      )
    )
  ) ->> 'ok')::boolean,
  false,
  'a New Comment targeted at an unrelated member is rejected'
);

select is(
  (public.aitask_execute_command(
    'pgtap-staff-authorization', gen_random_uuid(), 'task.delete',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'insert', 'entityType', 'notification',
        'entityId', 'pgtap-legacy-delete-notification', 'expectedVersion', 0,
        'data', jsonb_build_object(
          'id', 'pgtap-legacy-delete-notification', 'targetRole', 'Admin',
          'title', 'Task Deleted', 'message', 'Untrusted legacy content',
          'route', jsonb_build_object('page', 'tasks'), 'isRead', false,
          'readByUserIds', jsonb_build_array(), 'createdAt', now(), 'iconType', 'alert'
        )
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'delete', 'entityType', 'task',
        'entityId', 'pgtap-legacy-delete-task',
        'expectedVersion', (select version from public.aitask_entities
          where workspace_id = 'pgtap-staff-authorization'
            and entity_type = 'task' and entity_id = 'pgtap-legacy-delete-task')
      )
    )
  ) ->> 'ok')::boolean,
  true,
  'a cached client can still send its deletion notice before the task delete'
);

reset role;
select is(
  (select count(*)::integer
   from public.aitask_entities
   where workspace_id = 'pgtap-staff-authorization'
     and entity_type = 'notification'
     and data ->> 'title' = 'Task Deleted'
     and data -> 'route' ->> 'entityId' = 'pgtap-legacy-delete-task'
     and data ->> 'message' = 'Staff Actor deleted "Legacy delete task".'),
  1,
  'the cached deletion flow is canonicalized and does not create a duplicate notice'
);
set local role authenticated;

reset role;

select * from finish();
rollback;
