begin transaction read only;
select set_config('request.jwt.claim.sub','200c1908-8c4a-439f-a565-922e17f31afc',true);
select set_config('request.jwt.claim.role','authenticated',true);
with current_task as (
  select data from public.aitask_entities
  where workspace_id='aitask-main' and entity_type='task' and entity_id='T-1793697276711-uc19q'
), proposed as (
  select data || jsonb_build_object(
    'assignedTo','U-1782900298644-bhjyb',
    'assignedBy','326b6b5e-fe78-4f81-acbe-7dcd0324ea2a',
    'responsibleHodId','326b6b5e-fe78-4f81-acbe-7dcd0324ea2a',
    'assignmentState','assigned_staff'
  ) as data from current_task
), proposed_with_pending as (
  select data || jsonb_build_object('status','Pending') as data from proposed
)
select
  (select private.aitask_member_id('aitask-main')) as resolved_actor_member_id,
  (select private.aitask_member_role('aitask-main')) as resolved_actor_role,
  (select private.aitask_is_hod('aitask-main')) as resolved_actor_is_hod,
  private.aitask_task_assignment_is_valid('aitask-main','update',(select data from current_task),(select data from proposed)) as assignment_valid_unchanged_status,
  private.aitask_can_mutate_entity('aitask-main','update','task','T-1793697276711-uc19q',null,(select data from current_task),(select data from proposed)) as mutation_allowed_unchanged_status,
  private.aitask_task_assignment_is_valid('aitask-main','update',(select data from current_task),(select data from proposed_with_pending)) as assignment_valid_pending_status;
rollback;
