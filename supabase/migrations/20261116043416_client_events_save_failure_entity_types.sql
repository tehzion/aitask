-- Let a save_failure event carry the entity type names of the refused save
-- (for example 'FORBIDDEN:client,task'). Type names are lowercase identifiers
-- only: no ids, names or data. Free text is still rejected.
alter table public.aitask_client_events drop constraint aitask_client_events_fields;
alter table public.aitask_client_events add constraint aitask_client_events_fields check ((
  (event_type = 'banner_shown' and detail in ('conflict','retry','offline','auth','upgrade','connection','remote_update') and duration_ms is null)
  or (event_type = 'save_failure'
    and detail ~ '^(OFFLINE|CONFLICT|FORBIDDEN|VALIDATION|NOT_FOUND|RETRY_REQUIRED|AUTH_REQUIRED)(:[a-z_]{1,40}(,[a-z_]{1,40}){0,11})?$'
    and duration_ms is null)
  or (event_type = 'recovery_duration' and detail is null and duration_ms between 0 and 86400000)
  or (event_type = 'chunk_load_failure' and detail is null and duration_ms is null)
) is true);
