begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.aitask_workspaces(id,name) values('manual-progress-test','Manual delivery regression');
insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('manual-progress-test','service_cycle','manual-cycle','{"id":"manual-cycle","clientId":"manual-client","status":"Published","serviceItems":[]}'),
('manual-progress-test','deliverable','manual-output','{"id":"manual-output","clientId":"manual-client","cycleId":"manual-cycle","status":"Planned","taskIds":[],"attachments":[]}');

-- A foreign-client task referencing this deliverable must not control it.
create function pg_temp.check_manual_statuses() returns setof text language plpgsql as $$
declare status text;
begin
  foreach status in array array['Planned','In Progress','Ready','Delivered'] loop
    update public.aitask_entities set data=jsonb_set(data,'{status}',to_jsonb(status))
      where workspace_id='manual-progress-test' and entity_type='deliverable' and entity_id='manual-output';
    insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
      ('manual-progress-test','task','foreign-task','{"id":"foreign-task","clientId":"foreign-client","deliverableId":"manual-output","status":"Pending","isCompleted":false}');
    return query select is((select data->>'status' from public.aitask_entities where workspace_id='manual-progress-test' and entity_type='deliverable' and entity_id='manual-output'),status,'foreign task does not reset manual '||status);
    delete from public.aitask_entities where workspace_id='manual-progress-test' and entity_type='task' and entity_id='foreign-task';
    return query select is((select data->>'status' from public.aitask_entities where workspace_id='manual-progress-test' and entity_type='deliverable' and entity_id='manual-output'),status,'removing foreign task preserves manual '||status);
  end loop;
end;
$$;
select * from pg_temp.check_manual_statuses();

insert into public.aitask_entities(workspace_id,entity_type,entity_id,data) values
('manual-progress-test','task','linked-task','{"id":"linked-task","clientId":"manual-client","deliverableId":"manual-output","status":"Pending","isCompleted":false}');
select is((select data->>'status' from public.aitask_entities where workspace_id='manual-progress-test' and entity_type='deliverable' and entity_id='manual-output'),'Planned','same-client tasks still determine progress');
update public.aitask_entities set data=jsonb_set(data,'{status}','"In Progress"')
  where workspace_id='manual-progress-test' and entity_type='task' and entity_id='linked-task';
update public.aitask_entities set data=data-'deliverableId'
  where workspace_id='manual-progress-test' and entity_type='task' and entity_id='linked-task';
select is((select data->>'status' from public.aitask_entities where workspace_id='manual-progress-test' and entity_type='deliverable' and entity_id='manual-output'),'In Progress','unlinking the last task preserves manual progress');
select * from finish();
rollback;
