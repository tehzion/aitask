alter table public.aitask_workspaces
  add column if not exists sync_protocol_version integer not null default 1;

comment on column public.aitask_workspaces.sync_protocol_version is
  'Frontend/database command protocol contract. Clients must reject unsupported versions before editing.';
