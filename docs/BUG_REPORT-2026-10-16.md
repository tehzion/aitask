# AiTask — Bug Report

**Date:** 2026-10-16 · **Version:** `3.0.0` · branch `codex/delivery-review-blindspots` (HEAD `d35e2a1`, uncommitted tree)
**Scope:** Supabase production path prioritized; local mode considered for divergence.
**Status legend:** Confirmed · Potential · Unverified.

> Reproductions below that reference the local backend use `VITE_AITASK_BACKEND=local` + demo login (`docs/AITASK_1_WEEK_USER_CHECKLIST.md`); secure-path items require a Supabase deployment.

---

## BUG-01 — Task completion auto-approves the client with no audit trail
- **Severity:** High
- **Module:** Tasks / Client portal
- **Issue:** Completing a task sets `clientApprovalStatus = 'Approved'` but writes no `approvalHistory` event. The client can then neither see an approval date nor review the task.
- **Root Cause:** `updateTaskStatus` derives `clientApprovalStatus` from completion state instead of recording an explicit client decision.
- **Impact:** `getClientApprovalDate()` returns `null`; `canReviewTaskAsClient` blocks review (`clientApprovalStatus === 'Approved'`). Client-facing approval reporting is wrong and customer acceptance is bypassed.
- **Evidence:** `src/store/index.ts:2550-2554`; `src/lib/clientPortal.ts:155-161`; `src/lib/access.ts:596`. `updateTask` mirrors the same logic (`src/store/index.ts:2996-3002`).
- **Recommended Fix:** On PM completion of a client-visible task, either append a synthetic `TaskApprovalEvent` (`userId = PM`, note = "Auto-completed") **or** transition `clientApprovalStatus` to `Pending` so the client review flow remains available.
- **Status:** Confirmed

**Reproduction (local):** as PM, open a `client-visible` task, set status → `Completed`. Inspect the task JSON: `clientApprovalStatus === 'Approved'`, `approvalHistory` empty. Log in as the client: no approval date is shown and the task is not reviewable.

---

## BUG-02 — "Awaiting client review" is three different things
- **Severity:** High
- **Module:** Dashboards (PM, Boss/Service, Delivery tracker)
- **Issue:** Three independent predicates count "waiting on client" differently.
- **Root Cause:** No canonical selector; each surface in-lined its own logic.
- **Impact:** The same task appears in different queues/counters across dashboards; PM vs Boss vs client views disagree.
- **Evidence:**
  - `src/lib/pmDashboard.ts:9` → `visibility !== 'internal' && getClientTaskStage === 'awaiting_review'`.
  - `src/components/ServiceRoleDashboard.tsx:127` → `status === 'Waiting Approval' && visibility === 'client-visible'` (this is internal review).
  - `src/lib/deliveryTracker.ts:185` → client `getClientTaskStage === 'awaiting_review'`, staff `status === 'Waiting Approval'`.
- **Recommended Fix:** Export one `isAwaitingClientReview(task)` from `clientPortal.ts` and use it everywhere; express internal review separately as `isAwaitingInternalReview(task)`.
- **Status:** Confirmed

---

## BUG-03 — Client approval reopens a completed task
- **Severity:** High
- **Module:** Client portal
- **Issue:** A client approving a client-visible task that is already `Completed` reverts it to `Approved` / 80%.
- **Root Cause:** `reviewClientApproval` sets `isCompleted:false`/`completedAt:undefined` unconditionally, and `canReviewTaskAsClient` allows review of `Completed` tasks.
- **Impact:** Completed work silently drops to 80% and re-enters the pipeline; progress metrics regress.
- **Evidence:** `src/store/index.ts:3141-3152`; `src/lib/access.ts:590-597`; intended-as-legacy behaviour asserted in `src/store/clientApprovalProgress.test.ts:44-62`.
- **Recommended Fix:** If `task.isCompleted`, route approval to a no-op "already accepted" acknowledgement, or require an explicit `reopenTask` action rather than reusing approval.
- **Status:** Confirmed

---

## BUG-04 — `setServiceCycleStatus` accepts any status
- **Severity:** High
- **Module:** Service cycles
- **Issue:** Any status string is written with no transition validation.
- **Root Cause:** The action checks permission and scope only.
- **Impact:** A cycle can be `Completed` with zero `Delivered` deliverables, or move `Completed → Draft`, contradicting `deriveServiceProgress`.
- **Evidence:** `src/store/index.ts:4325-4335`; canonical progress `src/lib/serviceManagement.ts:157-176`.
- **Recommended Fix:** Validate allowed transitions and require all required deliverables satisfied before `Completed`.
- **Status:** Confirmed

---

## BUG-05 — `setClientPlanStatus` allows `Active → Draft`
- **Severity:** High
- **Module:** Client plans
- **Issue:** An `Active` plan with published cycles can be moved to `Draft`, orphaning those cycles/deliverables.
- **Root Cause:** Guard blocks `Active` (direct set) and reopened `Ended`, but not an existing `Active` source moving to `Draft`.
- **Evidence:** `src/store/index.ts:4311-4322`.
- **Recommended Fix:** Reject `Active → Draft` when non-draft cycles exist; require an explicit "supersede/terminate" flow.
- **Status:** Confirmed

---

## BUG-06 — Super-admin-only permissions are exposed as grantable but silently stripped
- **Severity:** High
- **Module:** Permissions / Settings
- **Issue:** `manageUsers`, `approveRegistrations`, `deleteUsers`, `viewApprovals` appear as editable checkboxes (`permissionLabels`/`permissionGroups`) but are stripped for non-super-admins by `sanitizeRolePermissions`.
- **Root Cause:** Super-admin capability is modelled as both a flag and a permission set; the UI does not distinguish non-grantable keys.
- **Impact:** Admins "grant" permissions that never take effect; `/approvals` looks grantable but is super-admin-only.
- **Evidence:** `src/lib/access.ts:66-122` (`permissionLabels`, `nonSuperAdminOnlyPermissionKeys`), `:265-294` (`getEffectivePermissions`), `:337-348`.
- **Recommended Fix:** Mark those keys as non-grantable (read-only/hidden) in the role editor and in `sanitizeRolePermissions`.
- **Status:** Confirmed

---

## BUG-07 — Flaky unit test
- **Severity:** High (CI reliability)
- **Module:** Tests
- **Issue:** `src/lib/taskStatusControls.test.ts:40` failed once (`expected { status: 'Completed', … } to be undefined`), then passed across the next 4 full-suite runs and 5 isolated runs.
- **Root Cause:** Not yet determined — likely cross-file/module state or worker parallelism rather than the shared-fixture mutation theory (the returned array is freshly constructed at `taskWorkflowAccess.ts:45`).
- **Impact:** Nondeterministic CI; a genuine regression could be masked by a re-run.
- **Evidence:** `pnpm test` run #1 → `1 failed | 755 passed`; runs #2/#3 (full) and 5 isolated runs → all pass.
- **Recommended Fix:** Reproduce with `vitest --no-file-parallelism` / `--sequence.shuffle` to isolate cross-file state, then harden the fixture.
- **Status:** Confirmed

---

## BUG-08 — Project task totals are permanent zeros
- **Severity:** Medium
- **Module:** Projects
- **Issue:** `Project.totalTasks` / `completedTasks` are always `0`.
- **Root Cause:** Initialized at creation and never recomputed on task create/complete/delete.
- **Impact:** Any consumer of these fields shows 0; silent data inconsistency.
- **Evidence:** `src/store/index.ts:3433-3434`; only other writes are sanitization (`src/lib/security.ts:321-322`).
- **Recommended Fix:** Remove the fields and derive counts, or recompute inside `deriveServiceProgress`-style reducers.
- **Status:** Confirmed

---

## BUG-09 — `deleteTask` leaves a dangling `deliverable.primaryTaskId`
- **Severity:** Medium
- **Module:** Deliverables
- **Issue:** Deleting a task removes it from `deliverables[].taskIds` but not from `primaryTaskId`.
- **Root Cause:** `deleteTask` only remaps `taskIds`; `linkTaskToDeliverable` never maintains `primaryTaskId`.
- **Impact:** Delivery tracker link resolution references a non-existent task (`deliveryTracker.ts:152,177`).
- **Evidence:** `src/store/index.ts:3093-3095`, `:4362-4389`.
- **Recommended Fix:** Clear/recompute `primaryTaskId` when its task is removed or unlinked.
- **Status:** Confirmed

---

## BUG-10 — Revision can double-notify the assignee
- **Severity:** Medium
- **Module:** Notifications
- **Issue:** `requestRevision` sends a `Revision Requested` notice to the assignee, and the subsequent status return can send a second `Task Status Updated` to the same user.
- **Root Cause:** Notifications are appended from two code paths without de-duplication.
- **Evidence:** `src/store/index.ts:3231-3237` and `:2596-2605`.
- **Recommended Fix:** De-dupe by `(recipient, task, event)` or route revision returns through a single notifier.
- **Status:** Confirmed

---

## BUG-11 — Opt-out can skip client review for client-visible work
- **Severity:** Medium
- **Module:** Workflow
- **Issue:** When `requiresInternalApproval === false`, a PM can complete (and auto-approve) a client-visible task directly from `Waiting Approval`, bypassing `reviewClientApproval`.
- **Root Cause:** `taskTransitionError` allows direct completion and completion auto-approves (BUG-01).
- **Evidence:** `src/lib/taskWorkflowAccess.ts:24-25,35-39`; `src/store/index.ts:2550-2554`.
- **Recommended Fix:** Require client approval before completion when `visibility === 'client-visible'`.
- **Status:** Confirmed

---

## BUG-12 — Accessibility: duplicate tablists on HOD `/tasks`
- **Severity:** Low
- **Module:** UI / a11y
- **Issue:** Two tablists controlled one panel (invalid ARIA).
- **Status:** Confirmed fixed in the in-flight hardening (`docs/task-role-assignment-hardening-2026-10-16.md` row 2) — re-verify on deploy.

---

## BUG-13 — Staff: upload abandoned when task sheet closes; stale midnight dates
- **Severity:** Medium
- **Module:** Staff UX
- **Issue:** (1) Closing the task sheet during an output upload abandons the attachment; (2) All-work urgency/relative dates stay stale across midnight.
- **Status:** Confirmed via `docs/staff-latest-deep-audit-2026-10-15.md`; **still open** (not addressed by the 2026-10-16 hardening, which covered the *notification* contact gap only).

---

## Non-defect observations (not bugs, but flagged)
- **Local demo pricing divergence:** local mode shows real money that the secure backend zeroes inline (`src/lib/secureWorkspace.ts:786-802`). Intentional, but document it.
- **Dead legacy snapshot bridge:** `lib/supabaseSnapshot.ts` + `lib/legacySnapshot.ts` are unreachable (`src/lib/supabaseClient.ts:18`). Removal candidate, not a runtime bug.
- **Dead page:** `src/pages/Projects.tsx` is unrouted (`/projects` renders `Clients.tsx`).
