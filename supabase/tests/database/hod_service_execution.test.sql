begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000929','authenticated','authenticated','hod-service@aitask.local','',now(),'{}','{}',now(),now());
insert into public.aitask_workspaces(id,name) values('pgtap-hod-service','HOD service QA');
insert into public.aitask_members(id,workspace_id,auth_user_id,name,email,role,department,departments,permissions)
values('hod-service-actor','pgtap-hod-service','00000000-0000-0000-0000-000000000929','HOD service','hod-service@aitask.local','HOD','Designer',array['Designer'],'{}');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('pgtap-hod-service','client','pgtap-client','{"id":"pgtap-client","clientName":"Test Client"}'),
('pgtap-hod-service','task','pgtap-assigned-task','{"id":"pgtap-assigned-task","title":"Assigned service work","clientId":"pgtap-client","clientName":"Test Client","department":"Designer","assignedTo":"hod-service-actor","createdBy":"hod-service-actor","status":"Pending","serviceCycleId":"pgtap-cycle","deliverableId":"pgtap-deliverable"}'),
('pgtap-hod-service','service_cycle','pgtap-cycle','{"id":"pgtap-cycle","clientId":"pgtap-client","clientName":"Test Client","status":"Published","publishedAt":"2099-01-14T00:00:00.000Z","periodStart":"2099-01-01","periodEnd":"2099-01-31","updatedAt":"2099-01-14T00:00:00.000Z"}'),
('pgtap-hod-service','deliverable','pgtap-deliverable','{"id":"pgtap-deliverable","clientId":"pgtap-client","clientName":"Test Client","cycleId":"pgtap-cycle","status":"Planned","taskIds":["pgtap-assigned-task"],"updatedAt":"2099-01-01T00:00:00.000Z"}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000929',true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(private.aitask_can_access_service_client('pgtap-hod-service','pgtap-client'),'HOD can access their assigned service client');
select ok(not private.aitask_has_permission('pgtap-hod-service','viewServicePrices'),'HOD cannot read service prices');
set local role authenticated;
select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'deliverable.manage',
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
  'scoped HOD cannot insert a deliverable through the RPC'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'delete', 'entityType', 'deliverable', 'entityId', 'pgtap-deliverable',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped HOD cannot delete a deliverable through the RPC'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'deliverable', 'entityId', 'pgtap-deliverable',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable'),
      'data', (select data || jsonb_build_object('status', 'In Progress', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable')
    )), null
  ) ->> 'ok')::boolean,
  true,
  'scoped HOD can still update assigned deliverable progress'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'deliverable.manage',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'deliverable', 'entityId', 'pgtap-deliverable',
        'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable'),
        'data', (select data || jsonb_build_object('status', 'Delivered', 'updatedAt', '2099-01-15T00:00:00.000Z') from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'deliverable' and entity_id = 'pgtap-deliverable')
      ),
      jsonb_build_object(
        'kind', 'entity', 'action', 'update', 'entityType', 'service_cycle', 'entityId', 'pgtap-cycle',
        'parentId', null, 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle'),
        'data', (select data || jsonb_build_object('status', 'Completed', 'publishedAt', '2099-01-15T00:00:00.000Z', 'updatedAt', '2099-01-15T00:00:00.000Z') from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle')
      )
    ), null
  ) ->> 'ok')::boolean,
  true,
  'scoped HOD can complete an assigned deliverable and persist the derived cycle transition with publishedAt'
);

reset role;
select is(
  (select jsonb_build_object('status', data ->> 'status', 'publishedAt', data ->> 'publishedAt')
   from public.aitask_entities
   where workspace_id = 'pgtap-hod-service'
     and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle'),
  jsonb_build_object('status', 'Completed', 'publishedAt', '2099-01-15T00:00:00.000Z'),
  'the derived cycle transition stores its status and publishedAt timestamp'
);
set local role authenticated;

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'service_cycle.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'service_cycle', 'entityId', 'pgtap-cycle',
      'parentId', null, 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle'),
      'data', (select data || jsonb_build_object('status', 'Published', 'publishedAt', '2099-01-16T00:00:00.000Z', 'clientName', 'Forged Client', 'updatedAt', '2099-01-16T00:00:00.000Z') from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'service_cycle' and entity_id = 'pgtap-cycle')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped HOD cannot change unrelated cycle fields during an otherwise valid derived transition'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'cycle_comment.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'insert', 'entityType', 'cycle_comment', 'entityId', 'pgtap-cycle-comment',
      'parentId', 'pgtap-cycle', 'expectedVersion', 0,
      'data', jsonb_build_object(
        'id', 'pgtap-cycle-comment', 'clientId', 'pgtap-client', 'clientName', 'Test Client',
        'cycleId', 'pgtap-cycle', 'userId', 'hod-service-actor', 'text', 'Progress update',
        'visibility', 'internal', 'attachments', jsonb_build_array(), 'createdAt', now(), 'updatedAt', now()
      )
    )), null
  ) ->> 'ok')::boolean,
  true,
  'scoped HOD can still add a valid comment to an assigned cycle'
);

select is(
  (public.aitask_execute_service_command(
    'pgtap-hod-service', gen_random_uuid(), 'cycle_comment.manage',
    jsonb_build_array(jsonb_build_object(
      'kind', 'entity', 'action', 'update', 'entityType', 'cycle_comment', 'entityId', 'pgtap-cycle-comment',
      'parentId', 'pgtap-cycle', 'expectedVersion', (select version from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'cycle_comment' and entity_id = 'pgtap-cycle-comment'),
      'data', (select data || jsonb_build_object('text', 'Rewritten comment', 'updatedAt', now()) from public.aitask_entities where workspace_id = 'pgtap-hod-service' and entity_type = 'cycle_comment' and entity_id = 'pgtap-cycle-comment')
    )), null
  ) ->> 'ok')::boolean,
  false,
  'scoped HOD cannot rewrite an existing cycle comment'
);


reset role;
select * from finish();
rollback;
