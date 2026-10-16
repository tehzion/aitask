# Data Synchronisation Audit — AiTask

**Date:** 2026-10-17 · **Branch:** `codex/audit-p0p1-2026-10-16`

## 1. Single source of truth

| Concern | Mechanism | Verdict |
| --- | --- | --- |
| Authoritative store | Supabase (Postgres + RLS + versioned command RPCs) is authoritative; frontend is a canonical projection | PASS |
| Frontend ↔ DB alignment | `secureWorkspace.ts` diffs current state against a module-level `baseline` and emits versioned operations (`aitask_execute_command`); optimistic concurrency + idempotency receipts | PASS |
| Task/deliverable/cycle progress | `deriveServiceProgress` (`store/index.ts:805`) is the single reducer called on every task/deliverable mutation; `getTaskProgress` (`taskProgress.ts`), `resolveDeliverableStatus` (`serviceManagement.ts:157`) are canonical | PASS |
| Review queues | `isAwaitingClientReview` / `isAwaitingInternalReview` (`clientPortal.ts`) — one definition used by PM/Staff/Boss/delivery surfaces (DBG-02 fixed) | PASS |
| Project counters | Removed `Project.totalTasks/completedTasks`; counts derived from tasks (DBG-04 fixed) | PASS |
| Status/deadline/progress definitions | Shared `isTaskCompleted`/`isTaskOpen`/`getClientTaskStage` predicates | PASS |

## 2. Synchronisation mechanism

| Mechanism | Implementation | Notes |
| --- | --- | --- |
| Polling (primary) | 15 s `setInterval(pullLatest)` + `focus`/`visibilitychange`/`online` listeners (`store/index.ts:5992-5996`) | Reconciles background tabs, missed events |
| Realtime (narrow) | `subscribeToCurrentMemberAccessChanges` (`supabaseClient.ts:29`) — only member-access/permission changes; safe filter `^[A-Za-z0-9_-]+$`, cleanup on unmount | Deliberately NOT full entity push (avoids over-subscription + exposure) |
| Offline/online | `handleOffline`/`handleOnline` set backend status + reconcile on reconnect | PASS |
| Cleanup | `backendAutoSyncCleanup` removes interval, listeners, realtime channel | PASS (no leak) |

**Expected update interval:** 15 s polling + immediate on focus/visibility/online. This is the documented, accepted interval for a task-management workflow (not realtime chat); the README/DEPLOYMENT docs state this explicitly.

## 3. Concurrency & integrity

- Workspace-level optimistic lock (5-arg RPC overload) + per-row `expectedVersion` preflight → `CONFLICT` + actual version.
- Command-id idempotency (`aitask_command_receipts`) → duplicate/replayed commands are no-ops.
- `makeNotification` one-audience invariant + `resolveTaskUpdateRecipientIds` dedup (`Set`) → no duplicate notifications.
- Optimistic local updates with `discardMutation`/`retryPendingSave` reconciliation (no blind retry of non-idempotent ops).

## 4. Known prior defects — resolved & re-verified

| ID | Defect | Status |
| --- | --- | --- |
| DBG-02 | "Awaiting client review" computed 3 incompatible ways | FIXED (canonical selector) |
| DBG-04 | Project task totals permanent zeros | FIXED (derived counts) |
| DBG-05 | Dangling `deliverable.primaryTaskId` after delete/unlink | FIXED |
| DBG-06/07 | Impossible service-cycle/plan states | FIXED (transitions + DB trigger) |
| DBG-08 | Double-notify on revision | FIXED (dedup) |
| GAP-D1/D2 | DB overrode client-approval / transitions frontend-only | FIXED (migrations) |

No **new** data-consistency or synchronisation defect was found this pass.

## 5. Residual

- Live multi-user browser sessions were **not** run in this environment (no browsers); the `e2e/` suite (staff/PM/HOD role flows, action-save-gaps, session-action-gaps) runs in CI.
- Immediate cross-user push is not implemented for entity data (15 s poll instead) — documented and acceptable; a realtime push of all entities would risk exposure and over-subscription.
