# Dashboard Accuracy Report

**Date:** 2026-10-17

## Metric source and calculation map

| Dashboard metric | Source | Canonical calculation | Archived/deleted behavior | Test evidence |
| --- | --- | --- | --- | --- |
| Task completion/progress | visible `tasks` + users | `getTaskProgress` and `deriveServiceProgress` | inaccessible/deleted tasks leave the projection | `taskProgress.test.ts`, `dashboardData.test.ts` |
| Project totals | visible `tasks` grouped by `projectId` | derived counts; no stored counter authority | deleted/unlinked tasks are excluded | `dashboardData.test.ts`, project audit tests |
| Deliverable status | deliverables, tasks, cycles | `resolveDeliverableStatus` | invalid links are flagged/removed, not counted as completed | service/deliverable tests |
| Pending internal review | visible tasks | `isAwaitingInternalReview` | only authorised reviewer scope is included | workflow/review tests |
| Pending client review | visible tasks/client projection | `isAwaitingClientReview` | client projection exposes only permitted fields | client portal tests |
| Overdue/upcoming | task `dueDate` + workspace business date | `useLocalToday`, calendar-safe date helpers | cancelled/completed tasks follow shared open/completed predicates | calendar/staff workspace tests |
| Staff workload | assigned/created visible tasks | `getStaffDashboardMetrics` and workload selectors | reassignment moves counts from old to new assignee | `staffDashboard.test.ts`, `taskAssignment.test.ts` |
| PM portfolio | owned client/project/task scope | id-first portfolio scope helpers | foreign client-name collisions do not expand scope | `pmDashboard.test.ts`, `pmPortfolioIdScope.test.ts` |
| HOD department workload | department membership + task scope | `isMemberInDepartment` and department selectors | changed departments narrow the next snapshot | HOD permission/sync tests |
| SA system totals | all authorised workspace collections | same canonical selectors without portfolio/department narrowing | deleted rows absent after committed refresh | dashboard/report tests |
| Notification count | server notification feed/read state | unread count from feed RPC, optimistic local receipt until confirmed | restricted/deleted routes do not remain actionable | notification and secure workspace tests |

## Role filters

- Super Admin: workspace-wide authorised view.
- Project Manager: portfolio/client/project scope; ownership is id-first.
- HOD: department-scoped task/review visibility.
- Staff: assigned/created/permission-scoped work.
- Client projection: client-owned portal payload, separate from internal entity visibility.

## Accuracy guarantees

- No production dashboard statistic is hardcoded or placeholder-derived.
- Reassignment recalculates both old and new workload counts from the task collection.
- Deletion updates task/deliverable links and removes stale task-linked notification routes.
- Status, completion, review, and deadline semantics are shared across Dashboard, Tasks, Calendar, Approvals, Delivery Tracker, and Reports.
- Date-only business fields are calculated in the workspace calendar rather than by an arbitrary browser timezone.
- A committed workspace revision causes every active authorized session to reload the latest snapshot; polling and visibility/focus/reconnect are fallback reconciliation paths.

## Verification result

Automated dashboard and selector coverage passes. Source review confirms role filters and mutation reducers. A live database-to-four-browser comparison was not run in this session; live cells are therefore `NOT VERIFIED`, and no production data was changed.
