# Business Logic Audit — AiTask

**Date:** 2026-10-17 · **Branch:** `codex/audit-p0p1-2026-10-16`

## 1. Status transitions

| Domain | Rule | Enforcement | Verdict |
| --- | --- | --- | --- |
| Task | `Pending/In Progress → Waiting Approval → Approved → Completed`; revision returns to `In Progress`/`Revision`; completion requires PM + internal approval (or opt-out) | `taskTransitionError` (`taskWorkflowAccess.ts`), `getTaskStatusControls`, store guards | PASS |
| Task self-approval | A PM who opts out cannot self-approve ("Only the department reviewer can approve submitted work") | `taskWorkflowAccess.ts:43-44` | PASS |
| Service cycle | `Draft → Published/Cancelled`, `Published → Completed/Cancelled`; `Completed` requires all deliverables `Delivered` | `allowedServiceCycleTransitions` + `service_transition_guard.sql` (DB trigger) | PASS |
| Client plan | `Active → Draft` blocked when started cycles exist; `Ended` cannot reopen; activate via dedicated path | `setClientPlanStatus` + `service_transition_guard.sql` | PASS |
| Client approval | Approving a `Completed` task preserves completion (no reopen); rejection requires a note | `reviewClientApproval` (`store/index.ts:3032-3054`) | PASS |

## 2. Approval integrity (no duplicates / no double-processing)

- `canApproveTaskInternally` requires `task.status === 'Waiting Approval'` — a second approval is blocked once status leaves `Waiting Approval`.
- `canReviewTaskAsClient` requires `isAwaitingClientReview` — excludes already-approved/completed tasks.
- Approval decisions are recorded in `approvalHistory` (append-only) with `userId`/`status`/`note`/`createdAt`; internal review provenance in `reviewDecision` (server-owned, `reviewOverrideReason` replaced by decision provenance).

## 3. Workflow restrictions

| Restriction | Enforcement |
| --- | --- |
| HOD-first assignment (department with an HOD must delegate to HOD, not Staff) | `taskAssignmentStageError`, `assignableTaskAssignees` |
| Reassign requires returning submitted/approved/completed work for revision | `updateTaskAssignee` guard |
| Output evidence required before review/completion for linked tasks | `taskEvidenceError`, `hasTaskEvidence` |
| Workflow dependency readiness | `getTaskBlockers`, `workflowDependenciesReady` |
| Client-visible completion keeps review open (`Pending`) | store + `client_visible_completion_review.sql` |

## 4. Project lifecycle

- Project creation scoped to PM portfolio / Boss; `createProject` validates client exists.
- Plan revisioning: `createClientPlanRevision`/`scheduleClientPlanRevision`/`returnClientPlanRevisionToDraft` with `supersedesPlanId` and `revisionScheduleStatus`; `Active`/`Paused` plans edited via revision, not in place.
- Completion calculations derive from deliverables (`getPlanDeliverySummary`), never convert draft/unlinked tasks into delivered output.

## 5. Result

**No invalid-state path or conflicting business rule found.** The system cannot enter logically invalid states through normal actions; the DB triggers (`service_transition_guard`, client-ownership freeze, task-stage-progress) mirror the frontend guards. The one prior policy deviation (client-approval ordering, `fca797f`) is internally consistent and **signed off by the product owner (2026-10-17)**.
