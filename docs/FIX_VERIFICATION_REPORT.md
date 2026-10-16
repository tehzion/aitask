# Fix Verification Report — AiTask

**Date:** 2026-10-17 · **Branch:** `codex/audit-p0p1-2026-10-16` (HEAD `7ac0b25`, ahead of origin by 3 commits)
**Method:** Independent source inspection + executed local gate. No destructive testing; no production mutation.

Classification legend:
- **Verified Fixed** — root cause addressed, tested with evidence.
- **Partially Fixed** — some scenarios unresolved.
- **Not Fixed** — original problem still present.
- **Regression Detected** — fix introduced a new issue.
- **Policy Reversal** — a fix was implemented then deliberately reverted by a later policy decision (needs product sign-off).
- **Unable to Verify** — needs live environment/DB.

---

## 1. P0 fixes

| Finding | Fix | Result | Evidence |
| --- | --- | --- | --- |
| OPS-01 / SUP-I2 / A1 — empty migration `20261015140049_monthly_plan_revision_scheduling.sql` (0 bytes) | DDL restored (backfill + `private.aitask_generate_due_service_cycles` recreation); CI guard `scripts/verify-migrations-nonempty.mjs` wired as `verify:migrations` | **Verified Fixed** | File now 8,899 bytes; `pnpm verify:migrations` → "109 SQL migrations are non-empty" (exit 0); guard exists and is called in `ci.yml` |
| DBG-01 / BUG-01 / A2 — completion auto-approves client with no audit trail | On completion of client-visible work keep `clientApprovalStatus='Pending'`; DB trigger aligned (`20261016140000_client_visible_completion_review`) | **Verified Fixed** | `src/store/index.ts:2394,2870` (now also preserves `'Rejected'`); migration replaces the auto-approve anchor for non-internal tasks; tests `clientApprovalProgress.test.ts:110`, `taskStageProgress.test.ts:140` assert `clientApprovalStatus:'Pending'` |
| P0-4 / SEC-01 — live anon/authenticated grants on `aitask_app_state` | Verified during `auditP0P1ProductionRollout` | **Verified Fixed (manifest evidence)** | `migration_repair_manifest.review.json` `auditP0P1ProductionRollout.liveVerification`: `anonymousDirectTableAccess:false`, `anonymousCommandRpcExecution:false`, `authenticatedDirectTableMutation:false`, `securityDefinerSearchPathsFixed:true` |

## 2. P1 fixes

| Finding | Fix | Result | Evidence |
| --- | --- | --- | --- |
| DBG-02 / BUG-02 / B1 — "awaiting client review" defined 3 ways | Canonical `isAwaitingClientReview` / `isAwaitingInternalReview` in `clientPortal.ts`, used by all surfaces | **Verified Fixed** | `src/lib/clientPortal.ts:36-42`; consumers: `pmDashboard.ts:7,9`, `deliveryTracker.ts:185`, `access.ts:653`, `ServiceRoleDashboard.tsx`; test `clientPortal.test.ts:61-65` |
| DBG-03 / BUG-03 / B2 — client approval reopens Completed task | `reviewClientApproval` preserves completion | **Verified Fixed** | `src/store/index.ts:3032-3054` (`preserveCompletion` → `nextStatus:'Completed'`, `completionPercentage:100`); `canReviewTaskAsClient` now requires `isAwaitingClientReview` (`access.ts:648-654`) |
| DBG-06 / BUG-04 / B3 — `setServiceCycleStatus` accepts any status | Transition table + all-delivered gate | **Verified Fixed** | `allowedServiceCycleTransitions` `store/index.ts:579-584`; guard `store/index.ts:4262-4271`; DB mirror `service_transition_guard.sql`; pgTAP `service_transition_guard.test.sql` |
| DBG-07 / BUG-05 / B3 — `setClientPlanStatus` allows Active→Draft | Block Active→Draft when started cycles exist | **Verified Fixed** | `store/index.ts:4245-4248`; DB trigger `service_transition_guard.sql:45-57` |
| AUTH-01 / BUG-06 / B4 — non-grantable permissions exposed | `getGrantablePermissionGroups` hides restricted keys; `sanitizeRolePermissions` strips | **Verified Fixed** | `src/lib/access.ts:132-139,177-187,197-209` |
| SYN-03 / BUG-07 / B5 — flaky `taskStatusControls.test.ts` | Fresh fixtures + `vi.useFakeTimers()` | **Verified Fixed** | `taskStatusControls.test.ts:30-34`; full suite green (105 files / 811 tests) |
| SEC-02 / SUP-R2 / B7 — feedback `results` branch unthrottled | IP/actor rate limit on results branch | **Verified Fixed (source)** | `supabase/functions/aitask-feedback/index.ts:209-225` (`aitask_consume_feedback_rate_limit` keyed `results:{userId}:{ip}`); test `feedbackEdgeRateLimit.test.ts` |

## 3. P1 — Policy reversal (needs product sign-off)

| Finding | Original fix | Current state | Result | Evidence |
| --- | --- | --- | --- | --- |
| DBG-10 / BUG-11 / B6 — opt-out can skip client review for client-visible work | Require client approval before completion (commits `a7ddf7d`, `52ab3b1`) | Reversed in `fca797f` to "PM may complete client-visible work; client acceptance is a separate, audited post-completion decision" | **Policy Reversal** | `taskWorkflowAccess.ts:40-50` (completion guard no longer checks `visibility`/`clientApprovalStatus`); test `taskStatusControls.test.ts:62-70` explicitly asserts completion-before-acceptance is allowed |
| DA-01 — client-approval guard bypassable via self-approval | Extend guard to any status (`isApprovalOptOut`) | Self-approval bypass removed entirely (PM self-approval path deleted), and the "must approve before completion" rule itself removed | **Policy Reversal (consistent)** | `taskWorkflowAccess.ts:43-44` ("Only the department reviewer can approve submitted work"); completion guard at `:48-50` |

> **Assessment:** The frontend (`A2` keep `Pending`) and database (`client_visible_completion_review`) are now mutually consistent under this policy: a PM-completed client-visible task stays at `Pending` and remains reviewable by the client afterwards (`canReviewTaskAsClient` → `isAwaitingClientReview`). Client review is **not lost**; only the *ordering* (approval-after-completion instead of before) changed. This is a legitimate business-rule decision but is a deviation from the audit's P1 recommendation and **must be explicitly confirmed by the product owner.**

## 4. Phase C (P2) fixes

| Finding | Result | Evidence |
| --- | --- | --- |
| DBG-04 / C1 — `Project.totalTasks/completedTasks` permanent zeros | **Verified Fixed** | No `totalTasks`/`completedTasks` on `Project` in `src/types/index.ts` or `security.ts` (grep clean) |
| DBG-05 / C2 — dangling `deliverable.primaryTaskId` | **Verified Fixed** | `store/index.ts:2975-2980` (deleteTask) and `:4331` (linkTaskToDeliverable) clear it |
| DBG-08 / C3 — revision double-notify assignee | **Verified Fixed** | Notification dedup at `store/index.ts:2983-2987` (filters `route.entityId === taskId`) |
| SYN-04 / C4 — unvalidated service collections in snapshot | **Verified Fixed** | Field-level validation replaces `as unknown as T[]` (see `security.ts` diff) |
| SYN-01 / C5 — dead legacy snapshot bridge | **Verified Fixed (partial)** | `legacySnapshot.ts` deleted; `supabaseSnapshot.ts` reduced to 35 lines (two type interfaces only, still imported as types); `pages/Projects.tsx` deleted |
| ARC-02 / C6 — dead `Projects.tsx` | **Verified Fixed** | `src/pages/Projects.tsx` no longer exists |
| UI-01 / UI-02 / C7 — staff upload abandonment + midnight-stale dates | **Verified Fixed (pre-existing)** | `StaffTaskFocus.tsx` wires `outputUpload` into exit/close guards; `StaffAllWork.tsx:102` uses `useLocalToday()` |

## 5. Deep-dive cross-layer gaps (GAP-D1…D5)

| Gap | Result | Evidence |
| --- | --- | --- |
| GAP-D1 — DB overrides client-approval on completion | **Verified Fixed (source)** | `20261016140000_client_visible_completion_review.sql` gates auto-approve on `visibility<>'client-visible'`; pgTAP `client_visible_completion_review.test.sql` |
| GAP-D2 — service transitions frontend-only | **Verified Fixed (source)** | `20261016150000_service_transition_guard.sql` command-scoped trigger; pgTAP `service_transition_guard.test.sql` |
| GAP-D3 — cycle progress drops legacy rows | **Verified Fixed** | `src/lib/serviceManagement.ts` keeps legacy deliverables |
| GAP-D4 — monthly record plan scoping | **Verified Fixed** | `src/lib/monthlyRecords.ts` keeps cycles without `planId`; test `monthlyRecords.test.ts` |
| GAP-D5 — no DB-layer test | **Verified Fixed** | Two pgTAP files added (unrun locally — see §7) |

## 6. PM role remediation (2026-10-16)

| Finding | Result | Evidence |
| --- | --- | --- |
| PM could rename/edit/delete any company via service command | **Verified Fixed (source, pending production)** | `20261016160000_pm_client_scope_and_ownership.sql` (10,044 bytes, FORCE RLS trigger); pgTAP `pm_client_scope_and_ownership.test.sql` |
| Company ownership mutable / duplicate-name scope leak | **Verified Fixed** | `isServiceClientInScope` `store/index.ts:562-576`; `deleteClientProfile` id-first `:3682-3695`; tests `pmPortfolioIdScope.test.ts`, `pmDuplicateClientScope.test.ts`, `duplicateClientDelete.test.ts` |
| Department-scoped roles leak workspace-wide visibility | **Verified Fixed (source, pending production)** | `20261016170000_department_scoped_visibility_cleanup.sql` |

## 7. Unable to verify locally (needs live Postgres / browsers)

- **pgTAP DB suite** (`supabase/tests/database/*.sql`, incl. `client_visible_completion_review`, `service_transition_guard`, `pm_client_scope_and_ownership`) — not executed (no linked Postgres). Prior rollouts recorded `completePgTapSuitePassed: 208` in the manifest, but the two newest test files are unrun.
- **Playwright e2e** (61+ specs) — not executed (no browsers). CI runs these on `ci.yml`.
- **Deno edge-function type-check** — `deno` not installed; `aitask-feedback`/`invite-aitask-member` verified by static read only.
- **Live RLS/grants state** — verified only via manifest `liveVerification` evidence, not an independent live probe.

## 8. Regressions

No regressions introduced by the 3 local commits were observed in the executed gate (typecheck, lint, i18n, 811 unit tests, production build all green). The only behavioural change requiring attention is the §3 policy reversal.
