-- Cover the member foreign keys used by command receipts and audit history.

create index if not exists aitask_audit_actor_member_idx
  on public.aitask_audit_events(actor_member_id);

create index if not exists aitask_command_receipts_actor_member_idx
  on public.aitask_command_receipts(actor_member_id);
