begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

insert into public.aitask_workspaces(id, name) values ('monthly-renewal-test', 'Monthly renewal test');

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'monthly-renewal-test', 'client_plan', 'source-plan',
  '{"id":"source-plan","clientId":"renewal-client","status":"Active"}'::jsonb
);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'monthly-renewal-test', 'client_plan', 'next-plan',
  '{"id":"next-plan","clientId":"renewal-client","status":"Draft","supersedesPlanId":"source-plan"}'::jsonb
);

select throws_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
    values ('monthly-renewal-test', 'client_plan', 'duplicate-next-plan',
      '{"id":"duplicate-next-plan","clientId":"renewal-client","status":"Draft","supersedesPlanId":"source-plan"}'::jsonb)$$,
  '23505',
  'A next-month plan already exists for this service plan.',
  'only one pending monthly renewal may exist per source plan'
);

insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values (
  'monthly-renewal-test', 'client_plan', 'other-source-plan',
  '{"id":"other-source-plan","clientId":"other-renewal-client","status":"Active"}'::jsonb
);

select lives_ok(
  $$insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
    values ('monthly-renewal-test', 'client_plan', 'other-next-plan',
      '{"id":"other-next-plan","clientId":"other-renewal-client","status":"Draft","supersedesPlanId":"other-source-plan"}'::jsonb)$$,
  'a different source plan may have its own pending renewal'
);

select * from finish();
rollback;
