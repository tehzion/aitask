# System Integrity Report

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Decision:** CONDITIONAL — suitable for controlled staging verification; not approved for an unconditional production-readiness claim.

## Control summary

| Area | Assessment | Notes |
| --- | --- | --- |
| Authorization/RLS | PASS by source and database tests | Secure tables are read-scoped; writes use guarded RPCs; client projection is redacted |
| Workflow/status rules | PASS | Store and database guards cover assignment, review, completion, dependency, and deliverable progress |
| Optimistic concurrency | PASS with residual split-RPC risk | Versions, workspace locks, receipts, retries, conflict UI present |
| Failure recovery | PASS with staging verification required | Retained commands and batch cursors prevent silent loss; notification/storage reconciliation exists |
| Reporting calculations | PASS by source/unit tests | Shared completion, overdue, role-scope, progress, and pagination helpers |
| Auditability | IMPROVED / staging verification required | New immutable before/after history migration closes the value-loss gap for post-cutover mutations |
| Member lifecycle | OPEN RISK | hard-delete rather than first-class deactivation |
| Client/project archival | OPEN RISK | destructive client cascade; no durable project archive state |
| Performance at scale | PARTIAL | 500-row workspace paging and task UI pagination exist; large live dataset profiling not run |
| Live multi-role verification | NOT VERIFIED | no staging credentials/four-account run in this session |

## Implemented in this pass

1. Added `supabase/migrations/20261017113000_audit_value_history.sql`.
2. Added `supabase/tests/database/audit_entity_history.test.sql`.
3. Added `supabase/migrations/20261017130000_align_service_cycle_cancel_rpc.sql` and extended the service-transition regression test so the intent-specific RPC matches the canonical cancellation matrix.
3. History captures entity/member insert, update, and delete snapshots in the same transaction as the source mutation.
4. History is MFA/Super-Admin read-scoped and append-only.
5. Primary generic/service command paths are correlated with the command ID when the migration can install the command setting; legacy/scheduled helper paths still remain attributable by actor/type/time even when the command ID is null.

## Production blockers / acceptance gates

### Gate 1 — Apply and execute database migration in staging

- Apply migrations in filename order.
- Confirm the dynamic command-correlation block resolves the deployed RPC signatures.
- Run the new pgTAP test.
- Perform one insert/update/delete for a task, approval, service record, and member; verify before/after values.

### Gate 2 — Four-account concurrency run

- Super Admin changes a member while PM edits a task.
- PM and HOD submit/approve the same task simultaneously.
- Staff saves output while HOD reassigns or requests revision.
- Client approves while PM changes task state.
- Verify conflict messages, no duplicate notifications, no stale overwrite, and correct role-scoped refresh.

### Gate 3 — Lifecycle decision

Obtain written approval for either:

- soft deactivation/tombstones and archive projections; or
- irreversible member/client deletion with history-only retention and documented retention/privacy policy.

### Gate 4 — Large-data profile

Load at least 10,000 tasks, 5,000 notifications, 1,000 members, and 500 service records in a staging workspace. Measure initial load, Realtime refresh, search/filter/sort, reports, CSV export, and concurrent command latency.

## Final assessment

The application is materially stronger than a UI-only task manager: security decisions are repeated server-side, status/progress logic is guarded in the database, retries are idempotent, and role-scoped snapshots avoid trusting browser state. The newly added value-history layer closes a real accountability gap.

It should be classified as **conditionally ready for staging**, not production-ready, until the migration is executed against the deployed schema, the four-role concurrency/lifecycle tests pass, and the business accepts or remediates hard-delete and split-transaction semantics.
