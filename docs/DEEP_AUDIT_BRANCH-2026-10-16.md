# AiTask — Deep Audit of Branch `codex/audit-p0p1-2026-10-16`

**Date:** 2026-10-16
**Scope:** All 13 commits on the branch vs base `d35e2a1` (74 files, +2,577 / −1,158), covering the audit P0/P1 fixes (A1–B7), the pre-existing in-flight work bundled into the branch, and the Phase C P2 items (C1–C6).
**Method:** Full diff review + targeted runtime probes + full local gate. No live Supabase.

**Gate (green):** `pnpm check` ✓ · `pnpm lint` ✓ · `pnpm verify:i18n` ✓ (0/170) · `pnpm verify:migrations` ✓ (105 non-empty) · `pnpm test` **100 files / 772 tests** ✓.

---

## 1. Verdict

The branch is **high quality and safe to continue reviewing toward release**. The audit fixes are well-tested and materially close the original findings. One **confirmed functional inconsistency** (DA-01) and a few **behavioural changes to confirm** (DA-02, DA-05, DA-06) remain. No security regressions were found; no new crash/type/lint issues.

---

## 2. Confirmed findings

### DA-01 — Client-approval-before-completion guard is bypassable (Medium)
- **Module:** Workflow / client approval (fix B6 / DBG-10 / BUG-11)
- **Issue:** The new guard `'Client approval is required before completion.'` fires only for the direct `Waiting Approval → Completed` transition. A Project Manager can instead self-approve first (`Waiting Approval → Approved`, allowed by `responsiblePmBypass`), after which completion is permitted even while `clientApprovalStatus` is still `Pending`.
- **Evidence (runtime probe):**
  - `completion(pm, {status:'Waiting Approval', client-visible, requiresInternalApproval:false})` → `{status:'Completed', disabledReason:'Client approval is required before completion.'}` ✅ blocked
  - `completion(pm, {status:'Approved', client-visible, requiresInternalApproval:false, clientApprovalStatus:'Pending'})` → `{status:'Completed'}` ❌ **allowed (no reason)**
  - Code: `src/lib/taskWorkflowAccess.ts:40-42` — the guard requires `canSkipInternalApproval(before)`, which requires `before.status === 'Waiting Approval'` (`:24-25`); `responsiblePmBypass` (`:38`) permits the self-approval.
- **Impact:** The rule the fix advertises (and that its own test asserts) is not reliably enforced. **Mitigated:** A2 keeps `clientApprovalStatus='Pending'` on completion, so `canReviewTaskAsClient` still lets the client review afterwards — client review is *not* lost, only the ordering rule is inconsistent.
- **Status:** Confirmed → **Fixed** (2026-10-16). The guard now keys off `isApprovalOptOut(before)` (opt-out flag + non-internal-review step) at any status, so `Approved → Completed` with `clientApprovalStatus:'Pending'` is blocked. Regression test added to `taskStatusControls.test.ts`.

### DA-02 — Delivery tracker "review" metric changed meaning for the agency view (Low–Medium)
- **Module:** Delivery tracker
- **Issue:** `review` now counts `isAwaitingClientReview` for **both** the client and staff/agency views (`src/lib/deliveryTracker.ts:185`). Previously the staff view counted internal review (`status === 'Waiting Approval'`).
- **Impact:** The agency delivery tracker no longer surfaces internal-review counts; "review" now always means client review. Arguably intended for a client-delivery board, but it is a silent semantic change.
- **Status:** Confirmed (behaviour); intent unverified.
- **Recommended fix:** Confirm intent. If the agency view still needs internal-review visibility, add a separate `internalReview` counter.

---

## 3. Behavioural changes to confirm (Low)

### DA-05 — Review-config management narrowed to the "responsible PM"
- `canManageTaskReview` now requires `isResponsibleProjectManager` (Boss, or PM who is creator/assignee/owned-portfolio) in addition to `canEditTask` (`src/lib/taskWorkflowAccess.ts:8-10`). A PM who could previously manage review settings for a task they manage but did not create/own may now be blocked. Intent appears deliberate (PM portfolio boundaries) — confirm.

### DA-06 — PM commercial cards limited to owned companies
- `ServiceRoleDashboard` now gates plan/delivery/commercial cards on `getOwnedPortfolioClientKeys` (own client records + own-project clients), excluding merely-assigned companies (`src/components/ServiceRoleDashboard.tsx:103-110,123,125`). Intended per PM portfolio boundaries; confirm no PM loses visibility they need.

### DA-03 — Reopen progress uses `scope.users || []`
- `prepareWorkflowTasks` re-derives `completionPercentage` via `getTaskProgress(reopened, scope.users || [])` (`src/lib/workflowReview.ts`). If a caller passes no `users`, a reopened Pending task falls back to 20/10 without the assignee's role. Low impact (only affects the displayed milestone on reopen).

---

## 4. Verified positives (evidence)

| Item | Finding | Verification |
| --- | --- | --- |
| A1 / OPS-01 | Empty migration repaired → 231-line backfill + `private.aitask_generate_due_service_cycles` recreation; `verify:migrations` guard added | File non-empty; guard passes (105 migrations) |
| A2 / B2 / DBG-01/03 | Completion of client-visible work keeps `clientApprovalStatus='Pending'`; approving a completed task preserves completion | `clientApprovalProgress.test.ts` asserts Pending + reviewable + `getClientApprovalDate()===null` |
| B1 / DBG-02 | Canonical `isAwaitingClientReview` / `isAwaitingInternalReview`; three surfaces unified | `clientPortal`/`pmDashboard`/`deliveryTracker`/`ServiceRoleDashboard` all use the selector |
| B3 / DBG-06/07 | `allowedServiceCycleTransitions`; `Completed` requires all deliverables `Delivered`; `Active→Draft` blocked | `servicePlans.test.ts` negative cases pass |
| B4 / AUTH-01 | `getGrantablePermissionGroups` hides non-grantable keys; "Protected" disabled UI removed | `Approvals.tsx` uses grantable groups |
| B5 / SYN-03 | Flaky `taskStatusControls.test.ts` de-flaked with fresh fixtures + `vi.useFakeTimers()` | Repeated runs green; root cause documented in test comment |
| B7 / SEC-02 | `aitask-feedback` results branch rate-limited (503 fail-closed / 429 + `Retry-After`) | `feedbackEdgeRateLimit.test.ts` (80 lines) |
| C1–C6 | Project counters removed, `primaryTaskId` cleared, snapshot validation, dead legacy bridge + page removed | Gate green; +5 tests |

**Additional checks:** `access.ts → clientPortal.ts` import introduces **no cycle** (clientPortal imports only `types` + `utils`). `getClientTaskStage` `Waiting Approval → 'active'` is redundant but harmless. DB and frontend guards are consistent enough; where they differ (frontend B6 stricter than the DB stage guard) the frontend is the stricter side.

---

## 5. Deployment status (unchanged)

The branch is **local only** and not pushed. `supabase/preflight/migration_repair_manifest.review.json` still lists **9 pending production migrations**, now including `20261016120000_task_role_assignment_and_contact_notification_hardening`. The `aitask-feedback` edge-function change is committed but **not deployed**. None of the DB work has been applied to production — the pending backlog still carries the previously-fixed live issues until deployed under the documented preflight/backup gate.

---

## 6. Resolution (2026-10-16)
1. **DA-01 — Fixed.** `isApprovalOptOut` extracted and the client-approval-before-completion guard now applies at any task status, closing the self-approval bypass. Regression test added (`Approved → Completed` with `clientApprovalStatus:'Pending'` blocked; `...:'Approved'` allowed).
2. **DA-02 — Accepted as intended.** Unifying the tracker's "in review" to client review is the deliberate outcome of B1; the label is view-neutral ("in review") and consistent across client/staff. No code change.
3. **DA-05 / DA-06 — Accepted as intended.** Both are the PM portfolio-boundary tightenings from the remediation; covered by `accessPmScope.test.ts`. No code change.
4. **DA-03 — No production impact.** The only production caller (`store/index.ts`) always passes `user`, `clients`, and `projects`; the `scope.users || []` fallback only affects direct test calls. No code change.
5. **Deploy checkpoint (unchanged):** apply the pending migrations + edge function behind the runbook, then re-verify on staging/production.

**Unverified (needs live env):** pgTAP suite, Playwright e2e, live RLS/grants, and production data integrity.
