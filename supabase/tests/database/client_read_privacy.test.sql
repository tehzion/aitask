begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'private',
  'aitask_client_deliverable_projection',
  array['text', 'jsonb'],
  'client deliverable projection exists'
);

select ok(
  position(
    'taskIds' in pg_get_functiondef('private.aitask_client_deliverable_projection(text,jsonb)'::regprocedure)
  ) = 0,
  'client deliverable projection never exposes the task-chain list'
);

select ok(
  position(
    '''primaryTaskId''' in pg_get_functiondef('private.aitask_client_deliverable_projection(text,jsonb)'::regprocedure)
  ) > 0,
  'client deliverable projection exposes a single representative task'
);

select ok(
  position(
    'workflowStepOrder' in pg_get_functiondef('private.aitask_client_task_projection(jsonb)'::regprocedure)
  ) = 0,
  'client task projection drops workflow step ordering'
);

select ok(
  position(
    'revisionCount' in pg_get_functiondef('private.aitask_client_task_projection(jsonb)'::regprocedure)
  ) = 0,
  'client task projection drops internal revision counters'
);

select ok(
  position(
    'serviceCycleId' in pg_get_functiondef('private.aitask_client_task_projection(jsonb)'::regprocedure)
  ) = 0,
  'client task projection drops raw cycle linkage'
);

select ok(
  position(
    'taskComments' in pg_get_functiondef('public.aitask_read_client_portal(text)'::regprocedure)
  ) > 0,
  'client portal returns task comments for the focus view'
);

select ok(
  position(
    'taskApprovals' in pg_get_functiondef('public.aitask_read_client_portal(text)'::regprocedure)
  ) > 0,
  'client portal returns task approval history for the focus view'
);

select ok(
  position(
    'member_role(workspace_id) <> ''Client''' in pg_get_functiondef('public.aitask_read_client_portal(text)'::regprocedure)
  ) >= 0
  and position(
    'entity_type in (''comment'', ''approval'') and private.aitask_member_role(workspace_id) <> ''Client'''
    in (select pg_get_policy_def('public.aitask_entities', 'members can read scoped entities'))
  ) > 0,
  'comment/approval RLS branch is no longer readable by clients'
);

select finish();

rollback;
