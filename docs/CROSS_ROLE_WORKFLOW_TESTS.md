# Cross-Role Workflow Tests — AiTask

**Date:** 2026-10-17 · **Method:** source review + executed unit suites (`src/store/*.test.ts`, `src/lib/*.test.ts`). Live e2e not run (no browsers); pgTAP not run (no linked Postgres).

Each workflow is traced through its canonical store action → notification resolver → authorization helpers, and where a unit test exists it is cited.

---

## Scenario A — Task assignment (PM → Staff)

1. PM assigns task to Staff — `updateTaskAssignee` / `updateTask` (`store/index.ts`).
2. Save correctness — command `task.update` with per-entity authorization; optimistic concurrency + idempotency receipts (secure mode).
3. Staff sees assigned task — `canViewTask` (`access.ts:574`) matches `task.assignedTo === user.id`.
4. Staff notification — `taskUpdateNotifications(resolveTaskUpdateRecipientIds(...))` includes assignee via `targetUserId`.
5. PM sees updated assignment — `canViewTask` matches `task.createdBy === user.id` / owned portfolio.
6. HOD sees if department rules allow — `canViewTask` matches `isDepartmentScopedUser && isMemberInDepartment`.
7. Super Admin sees system-level record — `isBossKoo` bypass.
8. Dashboard stats update — `deriveServiceProgress` + dashboard selectors.

**Evidence:** `src/store/taskAssignment.test.ts`, `src/store/unassignedTaskNotifications.test.ts`, `src/lib/access.test.ts`, `src/lib/pmPortfolioIdScope.test.ts` (delegated-PM deletion denial). **Pass (unit).**

## Scenario B — Task status update (Staff → everyone)

1. Staff updates progress — `updateTaskStatus` / `updateTaskWork` (guarded by `canEditTask`).
2. DB record updates — versioned command; `clientApprovalStatus` computed per visibility (A2 fix).
3. PM sees new status — `canViewTask` portfolio.
4. HOD dashboard updates — `isDepartmentScopedUser`.
5. Super Admin reporting — Boss bypass.
6. Notifications — `resolveTaskUpdateRecipientIds` (Boss + owning PM + task contact), dedup via `Set`, actor excluded.
7. No duplicate/incorrect — `makeNotification` one-audience invariant (`audienceCount !== 1 → null`).

**Evidence:** `src/store/taskStageProgress.test.ts`, `src/store/notificationRecipients.test.ts`, `src/store/staffTaskRestrictions.test.ts`. **Pass (unit).**

## Scenario C — Approval workflow (Staff submits → reviewer decides → Staff notified)

1. Staff submits for review — `updateTaskStatus('Waiting Approval')`; `localHodReviewNotifications` routes to `getDepartmentReviewers`.
2. Correct reviewer notified — department HOD or review cover (`canReviewTaskInternally`).
3. Reviewer approves/rejects — `canApproveTaskInternally` (HOD/PM reviewer) or Boss override.
4. Status updates — approval/revision transitions; `reviewDecision`/`internalReview` provenance preserved.
5. Staff receives decision — `resolveTaskUpdateRecipientIds` includes assignee.
6. Dashboards reflect result — `isAwaitingInternalReview` / `isAwaitingClientReview` canonical selectors.
7. Approval history preserved — `approvalHistory` events + `recordTaskWorkTransition`.

**Evidence:** `src/store/hodReviewHandoff.test.ts`, `src/store/workflowReviewGate.test.ts`, `src/lib/taskWorkflowAccess.test.ts`, `src/store/clientApprovalProgress.test.ts`. **Pass (unit).**

---

## Additional verified cross-role invariants

| Invariant | Evidence |
| --- | --- |
| PM cannot delete a foreign task they are merely assigned to | `pmPortfolioIdScope.test.ts`, `canDeleteTask` (`access.ts:616`) |
| Duplicate company names do not widen a PM's portfolio (id-first matching) | `pmDuplicateClientScope.test.ts`, `duplicateClientDelete.test.ts`, `matchesOwnedClient` (`access.ts:42`) |
| HOD cannot grant workspace-wide visibility via custom role | `hodPermissionParity.test.ts`, `department_scoped_visibility_cleanup.sql` |
| Staff cannot delete submitted/approved/completed work | `protect_staff_submitted_task_deletion.sql`, `canDeleteTask` (`access.ts:628-629`) |
| Client approval does not reopen a Completed task | `clientApprovalProgress.test.ts`, `reviewClientApproval` (`store/index.ts:3032`) |
| Service-cycle transitions validated (frontend + DB) | `servicePlans.test.ts`, `service_transition_guard.sql` |

## Gaps

- **No live e2e / pgTAP run** in this session — cross-role enforcement at the DB layer (RLS/RPC) is source-verified + manifest-evidenced, not freshly exercised.
- Component-level e2e for the full UI flows (sheet navigation, uploads) is present in `e2e/*.spec.ts` but not executed here.
