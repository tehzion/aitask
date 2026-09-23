begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000957', 'authenticated', 'authenticated', 'pgtap-owner-boss@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000958', 'authenticated', 'authenticated', 'pgtap-owner-pm-one@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000959', 'authenticated', 'authenticated', 'pgtap-owner-pm-two@aitask.local', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.aitask_workspaces(id, name)
values ('pgtap-client-ownership', 'Client ownership backfill test workspace');

insert into public.aitask_members(
  id, workspace_id, auth_user_id, name, email, role, department, departments, permissions, is_super_admin
) values
  ('pgtap-owner-boss', 'pgtap-client-ownership', '00000000-0000-0000-0000-000000000957', 'Boss Owner', 'pgtap-owner-boss@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, true),
  ('pgtap-owner-pm-one', 'pgtap-client-ownership', '00000000-0000-0000-0000-000000000958', 'PM One', 'pgtap-owner-pm-one@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false),
  ('pgtap-owner-pm-two', 'pgtap-client-ownership', '00000000-0000-0000-0000-000000000959', 'PM Two', 'pgtap-owner-pm-two@aitask.local', 'Project Manager', 'Management', array['Management'], '{}'::jsonb, false);

-- A client that lost its creator, still linked to a PM One project.
insert into public.aitask_entities(workspace_id, entity_type, entity_id, data)
values
  ('pgtap-client-ownership', 'client', 'orphan-client', '{"id":"orphan-client","clientName":"Orphan One Co"}'::jsonb),
  ('pgtap-client-ownership', 'project', 'orphan-project', '{"id":"orphan-project","clientName":"Orphan One Co","projectName":"Orphan Project","createdBy":"pgtap-owner-pm-one"}'::jsonb),
  -- A client with no creator and no linked work at all.
  ('pgtap-client-ownership', 'client', 'stranded-client', '{"id":"stranded-client","clientName":"Stranded Co"}'::jsonb);

select ok(
  (select created_by from public.aitask_entities where workspace_id = 'pgtap-client-ownership' and entity_type = 'client' and entity_id = 'orphan-client') is null,
  'ownerless client starts without a created_by'
);

select private.aitask_backfill_client_ownership();

select is(
  (select created_by from public.aitask_entities where workspace_id = 'pgtap-client-ownership' and entity_type = 'client' and entity_id = 'orphan-client'),
  'pgtap-owner-pm-one',
  'backfill derives the owner from the linked project'
);
select is(
  (select data ->> 'createdBy' from public.aitask_entities where workspace_id = 'pgtap-client-ownership' and entity_type = 'client' and entity_id = 'orphan-client'),
  'pgtap-owner-pm-one',
  'backfill records createdBy in the client data'
);
select ok(
  (select created_by from public.aitask_entities where workspace_id = 'pgtap-client-ownership' and entity_type = 'client' and entity_id = 'stranded-client') is null,
  'a client with no derivable creator stays ownerless'
);

-- PM One can now view the company they created.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000958', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_view_client('pgtap-client-ownership', 'orphan one co'), true, 'PM One can view the backfilled company');
select is(private.aitask_can_view_client('pgtap-client-ownership', 'stranded co'), false, 'PM One cannot view an ownerless company');
reset role;

-- PM Two is still scoped out of PM One's company.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000959', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_view_client('pgtap-client-ownership', 'orphan one co'), false, 'PM Two cannot view another PM''s backfilled company');
reset role;

-- Boss Koo keeps full visibility, including ownerless companies.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000957', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(private.aitask_can_view_client('pgtap-client-ownership', 'stranded co'), true, 'Boss can view an ownerless company');
reset role;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

select * from finish();
rollback;
