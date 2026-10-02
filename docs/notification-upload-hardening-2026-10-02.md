# Notification audience and private upload hardening

## Implemented

- Added `shouldNotifyClientForTask` to centralize client-notification eligibility. Missing or malformed visibility is treated as internal, and a client notice is created only for `Completed` or `Waiting Approval` tasks with a normalized client identity.
- Applied the same predicate to direct status updates and the full task-edit path, preventing the two workflows from drifting.
- Added migration `20261002101435_universal_notification_audience_guard`. The database now rejects forged, missing-task, internal-task, and mismatched-client notices for every actor. The existing Staff-specific guard remains in place.
- Added pgTAP coverage for trigger presence, security configuration, anonymous execution denial, accepted client-visible notices, rejected internal/mismatched/missing-task notices, and atomic task-update rollback.
- Preserved and verified the existing per-file upload reconciliation implementation and its local storage tests. It retains uploads after uncertain saves, fences abandoned references, requires ownership for cleanup, and fails closed when reconciliation is unavailable.

## Verification

- Focused frontend and recovery tests: **17 passed**.
- TypeScript: **passed**.
- ESLint: **passed**.
- The disposable Supabase stack applied all migrations and ran **556 pgTAP assertions**. The new notification suite passed after correcting the expected command error contract (`VALIDATION`).
- Production read-only inspection confirms `public.aitask_reconcile_service_upload` exists as a security-definer function with anonymous execution denied, and the private service-file storage policies are present.

## Release status

The new migration is recorded as locally validated and pending production application in `supabase/preflight/migration_repair_manifest.review.json`. Production was not changed in this implementation. Hosted staging access remains a release prerequisite; the migration must be applied and the authenticated Storage cross-account suite must pass there before production deployment.
