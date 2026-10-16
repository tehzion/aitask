# Dashboard Accuracy Report — AiTask

**Date:** 2026-10-17

## 1. Metric → source → calculation map

| Metric | Source | Calculation | Tested |
| --- | --- | --- | --- |
| Task progress % | `tasks` | `getTaskProgress(task, users)` (`taskProgress.ts`) | `taskProgress.test.ts` |
| Deliverable status | `deliverables` + `tasks` | `resolveDeliverableStatus(deliverable, tasks, cycles)` | `serviceManagement.test.ts` |
| Plan delivery summary | `cycles`/`deliverables`/`visibleTasks` | `getPlanDeliverySummary` (`dashboardData.ts:35`) | `dashboardData.test.ts` |
| Company activity | `visibleTasks` | `getCompanyTaskActivity` (completed-this-month, unassigned, per-handler open) | `dashboardData.test.ts` |
| Staff metrics | `assignedTasks` | `getStaffDashboardMetrics` (`staffDashboard.ts:8`) | `staffDashboard.test.ts` (14) |
| PM review queues | `tasks` | `getPortfolioReviewQueues` (`pmDashboard.ts:6`) | `pmDashboard.test.ts` |
| "Awaiting review" | `tasks` | `isAwaitingClientReview` / `isAwaitingInternalReview` | `clientPortal.test.ts` |
| Deadline/overdue | `dueDate` + today | `getRelativeDueDateString`, `buildStaffWorkQueue` | `staffWorkspace.test.ts` |

## 2. Role-scoped accuracy

| Dashboard | Role filter | Evidence |
| --- | --- | --- |
| Super Admin | `isBossKoo` → all records | `dashboardData.test.ts` |
| Project Manager | `getOwnedPortfolioClientKeys` / `isTaskInOwnedPortfolio` (id-first) | `pmDashboard.test.ts`, `pmPortfolioIdScope.test.ts`, `pmDuplicateClientScope.test.ts` |
| HOD | `isDepartmentScopedUser` + `isMemberInDepartment` | `hodPermissionParity.test.ts` (12) |
| Staff | `assignedTo === user.id` + `createdBy` | `staffDashboard.test.ts` (14) |

## 3. Specific accuracy guarantees

- **No hardcoded/placeholder stats** — all metrics derive from store tasks/clients/projects/deliverables/cycles. (`Project.totalTasks/completedTasks` were removed; counts are derived.)
- **Archived/deleted handling** — `getPlanDeliverySummary`/`getCompanyTaskActivity` only count `visibleTasks` (permission-filtered); deleted records are absent from the store after commit. `getDeliveryReviewRecords` flags invalid/unlinked links rather than silently miscounting.
- **Reassignment** — workload/activity recomputed from `assignedTo`, so both old and new assignees' counts update via `deriveServiceProgress`.
- **Date/timezone** — `useLocalToday()` (midnight timer + focus/visibility refresh) drives date-dependent metrics; `startOfDay`/`differenceInCalendarDays` for cycle/contract math (calendar-safe).
- **Change triggers update** — every mutation calls `set()` with `...deriveServiceProgress(...)` (or the relevant reducer), so dashboards reading the store react immediately.

## 4. Prior dashboard defects — resolved

| Defect | Status |
| --- | --- |
| "Awaiting client review" counted 3 ways (DBG-02) | FIXED — canonical selector |
| Project totals permanent zeros (DBG-04) | FIXED — derived |
| Boss/PM/HOD dashboard disagreement | FIXED — `boss-dashboard-accuracy-audit`, `staff-dashboard-accuracy-audit` remediations |
| Delivery-tracker "review" semantic drift (DA-02) | Accepted as intended (view-neutral label) |

## 5. Verification

- `dashboardData.test.ts` (21), `staffDashboard.test.ts` (14), `pmDashboard.test.ts`, `hodPermissionParity.test.ts` (12) — all PASS.
- Full gate: `pnpm test` **105 files / 814 tests** PASS.
- **Not executed**: live DB-vs-display comparison (no live Supabase session in this environment); the manifest records prior live verification (`auditP0P1ProductionRollout.liveVerification`, business hashes unchanged after migration).

## 6. Conclusion

Dashboard metrics use canonical selectors fed by a single `deriveServiceProgress` reducer, with correct role-scoping, archived/deleted handling, and local-date awareness. **No dashboard-accuracy defect was found.**
