# Save/retry recovery repair — audit 21 October, implementation 22 October 2026

## Scope

Repairs the five reproduced findings in `save-recovery-audit-2026-10-21.md`
and extends equivalent delivery linking/publication confirmation. This is a
frontend/state recovery release, not a service-plan rewrite.

The flow is editor → Zustand optimistic mutation → typed Supabase command →
acknowledgement/canonical refresh → originating editor confirmation. A clean
workspace alone is not evidence that a specific submitted record was saved.

## Repairs

- Restore holds the mutation lock and retained retry command until the canonical
  workspace reload succeeds. Failed restores preserve the pending overlay and
  recovery identity and cannot leak abandoned records into unrelated saves.
- Successful explicit restore preserves the authenticated account scope for
  future persisted retry commands. Session changes cannot settle old operations;
  signing out explicitly releases the abandoned restore busy flag.
- Plan revision and creation screens retain and compare submitted plan identity,
  scope, pricing and schedule state before clearing draft recovery or closing.
  Missing/superseded submissions keep the form and explain review/resubmission.
- Milestones retain the original submitted ID. Busy/failed save retry reuses that
  operation rather than generating another milestone. Submitted fields remain
  locked until confirmation, with unsaved-change and account/context protection.
- Delivery linking and publication verify their specific canonical state on retry.
- The creation dialog surfaces the underlying backend failure. English/Chinese
  recovery guidance explicitly explains that Restore discards pending changes.
- Async restore callbacks are awaited; restore/retry controls respect restore busy
  state and do not announce success before completion.
- Relative-time formatting and its locale data now load with the authenticated
  screens that use them, rather than the eager runtime. Formatting behavior and
  bundle-size limits are unchanged.
- The store imports the unchanged `isTaskOpen` predicate from the lightweight
  `taskCompletion.ts`, not the full reporting module. `taskReporting.ts` re-exports
  it for existing callers. This removes reporting/calendar formatting from startup.

## Modified files

- Recovery implementation: `src/store/index.ts`, `src/lib/secureWorkspace.ts`,
  `src/lib/saveConfirmation.ts`, `src/components/BackendFreshness.tsx`,
  `src/components/CreateClientPlanModal.tsx`, `src/components/DraftServicePlanEditor.tsx`,
  `src/components/ProjectManagementPanel.tsx`, `src/components/DeliveryReviewPanel.tsx`.
- Localization/performance: `src/lib/i18n.ts`, `src/lib/relativeTime.ts`; relative-time
  import changes only in `src/pages/Clients.tsx`, `src/pages/Notifications.tsx`,
  `src/components/ClientPortalDashboard.tsx`, `src/components/ClientDeliveryFocus.tsx`,
  `src/components/StaffTaskFocus.tsx`, `src/components/TaskDetailsModal.tsx`,
  `src/components/NotificationPopupHost.tsx`, `src/components/NotificationPreviewText.tsx`.
- Date helper imports use their equivalent public `date-fns/<function>` exports
  rather than the aggregate barrel, avoiding manual-chunk retention of lazy-only
  helpers. Import-only changes also cover `src/mock/index.ts`,
  `src/lib/dashboardData.ts`, `src/lib/calendarMetrics.ts`,
  `src/lib/projectManagement.ts`, `src/lib/notificationCenter.ts`,
  `src/lib/workWeek.ts`, `src/lib/pmDashboard.ts`, `src/lib/utils.ts`,
  `src/lib/deliveryTracker.ts`, `src/lib/calendarRanges.ts`,
  `src/lib/taskReporting.ts`, `src/lib/managementIntelligence.ts`,
  `src/hooks/useLocalToday.ts`, `src/components/ServiceRoleDashboard.tsx`,
  `src/pages/Calendar.tsx`, `src/pages/DeliveryTracker.tsx`, `src/pages/Tasks.tsx`,
  and `src/pages/Dashboard.tsx`. Existing chunk configuration is retained.
- Lightweight task predicate: `src/lib/taskCompletion.ts` and the store/reporting
  import/re-export; behavior is unchanged.
- Tests: `src/store/restoreIntegrity.test.ts`, `src/lib/saveConfirmation.test.ts`,
  `src/lib/secureWorkspace.test.ts`, `src/lib/i18n.test.ts`,
  `e2e/save-recovery-regressions.spec.ts`, `e2e/audit-regressions.spec.ts`,
  `e2e/delivery-review.spec.ts`.
- Evidence: this report and `docs/save-recovery-audit-2026-10-21.md`.

## Data and permissions

No migrations, SQL, RLS, memberships, historical records or production data are
modified by this repair. Existing monthly renewal and unique-cycle constraints
remain intact. No production database migration/backup operation is needed.
Read-only secure-cutover verification and dependency audit are required before
rollout. No production customer transaction is generated as a smoke test.

## Verification and release evidence

Final stable development-browser suite: **46 passed**. Coverage includes all five
reproduced defects, restored-away delivery linking/publication, client feedback
and approvals, context/account ownership, plan reconciliation and recovery,
English/Chinese date handling, and desktop/mobile project lifecycle controls.

Final unit suite: **119 files / 904 tests passed**, including sign-out during
restore. Typecheck, lint and i18n
audit passed (194 source files, zero findings). Production dependency audit:
no known vulnerabilities. Anonymous Supabase RPC/table/legacy access probes passed.
All 120 migrations are nonempty; recorded production alignment is through
`20261021110000_monthly_plan_renewal_integrity`. Read-only live inspection confirms
the unique monthly cycle and pending-plan-revision indexes remain present.

Production build and static PWA checks passed. Unchanged bundle budgets passed:
eager graph **297.9 KiB gzip / 300 KiB cap**, entry **27.9 KiB raw / 10.7 KiB gzip**,
report charts **381.8 KiB raw / 107.4 KiB gzip**. The earlier pre-existing over-budget
startup graph is resolved, not waived. An experimental chunk configuration that
produced circular chunk warnings was rejected; `vite.config.ts` is unchanged.

Built local-mode PWA suite: **3 passed**, covering offline startup, an offline
authenticated Reports deep link, and real service-worker replacement preserving
a dirty draft until save. This uses the explicit local-only production-mode test
build; deployment always builds Supabase mode from Git, never this demo artifact.

Verification notes: one original delivery restore fixture omitted the reciprocal
deliverable back-reference and was corrected, then all five delivery tests passed.
A later development-server cold dependency-discovery run timed out on initial Plan
loading, before any save assertion. Its isolated rerun passed in 4.4 seconds.
Interrupted/HMR-affected runs are not counted as passing release evidence.

This committed report records pre-deployment verification. The final handoff
provides the deployed commit/status after staging and production checks complete.
Authenticated live customer saves require an authorized browser session; the
available production tab is currently at the login screen. Local browser failure
injection is not presented as authenticated production verification.
