begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

select ok(
  position(
    'Only Project Managers can rename clients'
    in pg_get_functiondef('private.aitask_guard_entity()'::regprocedure)
  ) > 0,
  'the client rename guard reports the canonical Project Manager role'
);

select ok(
  position(
    'may target Project Manager only'
    in pg_get_functiondef('private.aitask_guard_staff_notification_insert()'::regprocedure)
  ) > 0,
  'the staff notification guard reports the canonical Project Manager role'
);

select * from finish();
rollback;
