-- Grant the service role the table privileges the invite function needs.
--
-- invite-aitask-member finalizes the member through the SECURITY DEFINER RPC
-- (which runs as the owner), then sets worker_type with a direct PostgREST
-- update on public.aitask_members. The service_role only held
-- REFERENCES/TRIGGER/TRUNCATE on that table, so the update was denied with
-- "permission denied for table aitask_members" and the function returned
-- "Member created, but worker type could not be saved. Retry the invitation
-- update." The service role is the trusted server-side admin, so grant the
-- table DML it needs.

grant select, insert, update, delete on public.aitask_members to service_role;

-- The aitask_members_departments_valid CHECK calls this normalizer on every
-- UPDATE, so the service role also needs EXECUTE on it.
grant execute on function private.aitask_normalize_member_departments(text, text[]) to service_role;
