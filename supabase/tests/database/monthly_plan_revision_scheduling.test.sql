begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.aitask_workspaces(id, name) values
  ('revision-draft-test', 'Draft revision scheduling regression'),
  ('revision-scheduled-test', 'Scheduled revision scheduling regression');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data) values
  (
    'revision-draft-test', 'client_plan', 'draft-source',
    '{"id":"draft-source","clientId":"draft-client","clientName":"Draft client","name":"Source","revision":1,"status":"Active","currency":"MYR","serviceItems":[],"discountType":"none","discountValue":0,"taxRateBps":0,"startDate":"2026-09-09","billingDay":9,"nextCycleStart":"2026-10-09","createdBy":"fixture","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z"}'::jsonb
  ),
  (
    'revision-draft-test', 'client_plan', 'draft-revision',
    '{"id":"draft-revision","clientId":"draft-client","clientName":"Draft client","name":"Draft revision","revision":2,"status":"Draft","currency":"MYR","serviceItems":[],"discountType":"none","discountValue":0,"taxRateBps":0,"startDate":"2026-10-09","billingDay":9,"supersedesPlanId":"draft-source","effectiveFromCycleStart":"2026-10-09","revisionScheduleStatus":"draft","createdBy":"fixture","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z"}'::jsonb
  ),
  (
    'revision-scheduled-test', 'client_plan', 'scheduled-source',
    '{"id":"scheduled-source","clientId":"scheduled-client","clientName":"Scheduled client","name":"Source","revision":1,"status":"Active","currency":"MYR","serviceItems":[],"discountType":"none","discountValue":0,"taxRateBps":0,"startDate":"2026-09-09","billingDay":9,"nextCycleStart":"2026-10-09","createdBy":"fixture","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z"}'::jsonb
  ),
  (
    'revision-scheduled-test', 'client_plan', 'scheduled-revision',
    '{"id":"scheduled-revision","clientId":"scheduled-client","clientName":"Scheduled client","name":"Scheduled revision","revision":2,"status":"Draft","currency":"MYR","serviceItems":[],"discountType":"none","discountValue":0,"taxRateBps":0,"startDate":"2026-10-09","billingDay":9,"supersedesPlanId":"scheduled-source","effectiveFromCycleStart":"2026-10-09","revisionScheduleStatus":"scheduled","createdBy":"fixture","createdAt":"2026-09-01T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z"}'::jsonb
  );

select is(
  private.aitask_generate_due_service_cycles('revision-draft-test', '2026-10-09'::date),
  1,
  'the due cycle is generated while an unscheduled draft revision remains inactive'
);
select is(
  (select data ->> 'status' from public.aitask_entities where workspace_id = 'revision-draft-test' and entity_type = 'client_plan' and entity_id = 'draft-source'),
  'Active',
  'an unscheduled draft does not end the active source plan'
);
select is(
  (select data ->> 'status' from public.aitask_entities where workspace_id = 'revision-draft-test' and entity_type = 'client_plan' and entity_id = 'draft-revision'),
  'Draft',
  'an unscheduled revision remains a draft at its proposed boundary'
);

select is(
  private.aitask_generate_due_service_cycles('revision-scheduled-test', '2026-10-09'::date),
  1,
  'the due cycle is generated after activating a scheduled revision'
);
select is(
  (select data ->> 'status' from public.aitask_entities where workspace_id = 'revision-scheduled-test' and entity_type = 'client_plan' and entity_id = 'scheduled-source'),
  'Ended',
  'a scheduled revision ends the source plan at the boundary'
);
select is(
  (select data ->> 'status' from public.aitask_entities where workspace_id = 'revision-scheduled-test' and entity_type = 'client_plan' and entity_id = 'scheduled-revision'),
  'Active',
  'a scheduled revision becomes active at the boundary'
);
select is(
  (select data ->> 'planId' from public.aitask_entities where workspace_id = 'revision-scheduled-test' and entity_type = 'service_cycle' and period_start = '2026-10-09'::date),
  'scheduled-revision',
  'the generated cycle uses the explicitly scheduled revision'
);

select * from finish();
rollback;
