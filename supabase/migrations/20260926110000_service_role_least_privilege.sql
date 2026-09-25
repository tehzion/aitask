-- Least privilege for the invite function's service-role table access.
--
-- 20260925120000 granted SELECT/INSERT/UPDATE/DELETE on public.aitask_members to
-- service_role so invite-aitask-member could set worker_type with a direct
-- PostgREST update. It only ever reads and updates that table (inserts/deletes
-- happen through SECURITY DEFINER RPCs and the GoTrue admin API), so drop the
-- unused INSERT/DELETE grants.

revoke insert, delete on public.aitask_members from service_role;
