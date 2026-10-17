# Business Logic Audit

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Scope:** Super Admin, Project Manager, HOD, Staff, Client review projection; React/Zustand local path; authenticated Supabase path; database migrations and pgTAP coverage.

## Executive conclusion

The application has a strong command-based design. Business mutations are optimistically projected in the browser, then committed through guarded Supabase RPCs with row versions, workspace versions, command receipts, RLS, and server-side workflow triggers. Client-side permission checks are not treated as the security boundary.

The audit confirmed and remediated one historical-integrity defect: the existing audit event index recorded only actor/action/changed-field names, so it could not reconstruct deleted or replaced values. Migration `20261017113000_audit_value_history.sql` adds immutable before/after snapshots for member and entity rows, with actor ID and actor snapshot, command, timestamp, field-diff, indexes, RLS, and an immutability trigger.

The system is not yet unconditionally production-ready. The two material residual risks are hard deletion of members and client cascades, and the fact that a browser mutation containing both generic and service-domain rows is committed through more than one RPC transaction. Both are controlled enough for staging validation, but require an explicit business decision before production approval.

## Workflow and invariant matrix

| Domain | Required invariant | Client/store control | Database control | Result |
| --- | --- | --- | --- | --- |
| Assignment | Staff can only receive work in an eligible department; PM-to-staff assignment is HOD-first where an HOD exists | `taskAssignmentStageError`, `isEligibleTaskAssignee` | `aitask_task_assignment_is_valid`, assignment guards | PASS in source and tests |
| Assignment history | Reassignment changes attribution and does not rewrite prior work events | `assignedBy`, `assignedAt`, `workHistory` | optimistic row version; history snapshot | PASS; historical query/UI reconciliation remains a staging check |
| Submission | Work cannot be submitted without the required evidence/reviewer path | `taskEvidenceError`, `getDepartmentReviewers` | workflow/evidence/reviewer triggers | PASS in unit/database coverage |
| Internal approval | Only an independent eligible HOD/reviewer or explicitly justified Super Admin override can approve | `canApproveTaskInternally`, `taskTransitionError` | `aitask_can_sign_task_review`, review/stage guards | PASS |
| Client approval | Only the owning Client projection can approve/reject client-visible work and rejection requires a note | `canReviewTaskAsClient` | client projection and approval command guards | PASS |
| Completion | Completion is distinct from client acceptance; completion requires internal approval unless the PM configured an allowed opt-out | `taskTransitionError`, `resolveTaskCompletedAt` | stage-progress and optional-approval guards | PASS |
| Reopen/revision | Approved/completed work cannot be edited silently; revision increments and approval state is invalidated | `taskTransitionError`, `recordTaskWorkTransition` | stage/dependency invalidation triggers | PASS |
| Workflow dependency | A downstream workflow task cannot be treated as ready before required predecessors | `workflowTransitionError` | workflow dependency triggers | PASS |
| Deliverable status | Deliverable status derives from required task evidence and cannot be manually marked ready/delivered early | `resolveDeliverableStatus` | `aitask_guard_deliverable_progress`, refresh triggers | PASS |
| Service cycle | Draft → Published/Cancelled and Published → Completed/Cancelled; completion requires all deliverables delivered | service management helpers | `aitask_guard_service_status` plus aligned intent-specific RPC | PASS; the narrow RPC now accepts the same Cancelled transitions |
| Duplicate approval | A second approval must conflict or be rejected, not append an unintended decision | awaiting-review selectors and row versions | reviewer/status guards and version preflight | PASS by design; concurrent live execution not run |
| Project totals | Totals are derived from authorized tasks rather than mutable counters | dashboard selectors | authoritative entity snapshot | PASS |
| Notifications | Notifications must be tied to the committed task/action and audience | recipient resolver and secure notification paths | audience/task context guards | PASS in notification database tests |
| Registration | Only Super Admin can approve/reject and an already-reviewed registration cannot be reviewed again | store checks | registration command authorization | PASS |

## Confirmed remediation

### BLI-001 — Audit events could not reconstruct values — FIXED

**Root cause:** `aitask_audit_events` stored `changed_fields` and limited metadata, but not `before_data` or `after_data`.

**Correction:** `aitask_entity_history` is populated by `SECURITY DEFINER` triggers on `aitask_entities` and `aitask_members`. The source mutation and history row share the same database transaction. `UPDATE` and `DELETE` history is append-only and cannot be modified through table privileges or normal DML.

**Verification:** `supabase/tests/database/audit_entity_history.test.sql`, migration non-empty gate, source inspection. A live database execution is still required before production rollout.

## Residual business-logic risks

### BLI-002 — Member removal is hard deletion, not deactivation — HIGH

The current account-removal flow deletes the member directory row and unassigns tasks. Historical task data retains IDs, but normal reports can no longer resolve the former member’s name. The new history table preserves the deleted member snapshot, which improves forensic traceability but does not provide an active/inactive directory state or reactivation workflow.

**Required decision:** introduce `is_active`/`deactivated_at` and retain a redacted member tombstone, or formally approve irreversible account deletion with history-only lookup.

### BLI-003 — Client deletion cascades business history — HIGH

The client-delete cascade deletes client, project, task, service-plan, cycle, deliverable, comment, add-on, pricing, and related notification entities. The audit history remediation now preserves deleted row values, but ordinary reporting and operational views cannot browse those historical records after the cascade.

**Required decision:** replace destructive client deletion with archive/tombstone semantics, or document retention/legal policy and expose an authorized historical archive view.

### BLI-004 — Mixed generic/service changes are not one database transaction — MEDIUM

The frontend partitions a local diff into generic and service RPC groups. The batch runner sequences them and re-derives service progress after an earlier command, but a failure between RPCs can temporarily leave a partially committed multi-domain intent.

**Mitigation:** workspace and row optimistic locks, retained batch cursor, retries, idempotent receipts, and derived-progress reconciliation.

**Required improvement:** add a single server-side batch command for mutations that must commit atomically across generic and service entities.

## Business logic conclusion

Ordinary status, approval, assignment, authorization, and derived-progress rules are consistently enforced in both the store and database. The remaining concerns are lifecycle policy and transaction boundary decisions rather than an observed ability for an ordinary UI user to bypass the current workflow guards.
