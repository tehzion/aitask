# Role User Journeys — AiTask

**Date:** 2026-10-17 · Navigation source: `src/lib/navigation.ts`, `src/lib/access.ts`, `src/App.tsx`.

---

## Super Admin (Boss Koo)

**Pages:** Dashboard, Tasks (management), Calendar, Delivery tracker, Companies, Reports, Approvals, Settings (+ `/notifications`).

**Primary responsibilities:**
- Approve/reject registrations (`/approvals`, `canApproveRegistrations` — super-admin-only).
- Manage users, roles, and departments (`/settings`, `manageUsers`/`deleteUsers`/`approveRegistrations`).
- Edit every task (`editTasks`), view production reports, service prices, system-wide data.
- Oversee the whole workspace (no scoping — `isBossKoo` bypass).

**Journey:** sign in → Dashboard (workspace metrics) → Approvals (pending registrations) → Settings (member/role management) → Tasks/Companies/Reports for oversight. Super Admin can override review and manage review config on any task.

**Notes:** Approvals page is Boss-Koo-only (RoleRoute + `nonSuperAdminOnlyPermissionKeys`); navigation hides it from other roles.

---

## Project Manager

**Pages:** Dashboard, Tasks ("Portfolio work"), Calendar, Delivery tracker, Companies, Reports, Settings.

**Primary responsibilities:**
- Create/own clients, projects, tasks; assign work to HOD/Staff.
- Monitor portfolio progress, deadlines, and commercial (plan/cycle/deliverable) cards.
- Approve internal review as configured reviewer; request revisions; complete tasks.
- Manage service packages/plans/cycles/prices for owned portfolio.

**Journey:** sign in → "Portfolio work" (task list) or Dashboard → create task / assign → monitor progress via Delivery tracker → manage client plans/cycles → Reports.

**Notes:** PM is portfolio-scoped (`ownedClientIds`, `matchesOwnedClient`, `isTaskInOwnedPortfolio`); duplicate company names never widen scope. Service management actions are portfolio-gated (`isServiceClientInScope`).

---

## HOD (Head of Department)

**Pages:** Dashboard, "Department work" (Tasks), "All work" (Schedule/Calendar), Delivery tracker, Companies, Reports, Settings.

**Primary responsibilities:**
- Oversee department members' work; delegate to Staff (HOD-first assignment rule).
- Approve department submissions (internal review) via `canReviewTaskInternally`.
- Track department workload, pending approvals, and performance.

**Journey:** sign in → "Department work" (delegated + department tasks) → approve/review submissions → assign/reassign within department → track workload (TeamWorkload) → Reports.

**Notes:** HOD is department-scoped (`isDepartmentScopedUser`, `isMemberInDepartment`); cannot gain workspace-wide visibility (`hodRestrictedPermissionKeys`, DB `department_scoped_visibility_cleanup`).

---

## Staff

**Pages:** My work (`/`), Schedule (`/calendar`), Inbox (`/notifications`), All work (`/tasks`), Delivery tracker, Companies, Reports, Settings.

**Primary responsibilities:**
- See assigned tasks ("My work" with urgency queues: Needs action / Up next / Waiting / Done).
- Update status, accept assignment, request help/handover, request review update.
- Upload output files, comment, submit for review.

**Journey:** sign in → "My work" (what needs action) → open task → accept / update status / add comment / upload output → submit for review → receive decision via Inbox.

**Notes:** Staff sees only assigned/created work (`canViewTask`); no management actions (`canEditTask` only assigned/created; `canDeleteTask` only open tasks; no `manageUsers`/service management). Navigation intentionally trims to avoid complexity (`staffPrimary`/`staffSecondary` with "More" disclosure).

---

## Cross-role shared journeys

- **Task assignment** (PM→Staff/HOD): covered in `CROSS_ROLE_WORKFLOW_TESTS.md` Scenario A.
- **Task status update** (Staff→PM/HOD/Boss): Scenario B.
- **Approval** (Staff submit → HOD/PM review → Staff decision): Scenario C.

All journeys route through the same store actions, notification resolver (`resolveTaskUpdateRecipientIds`), and authorization helpers, ensuring consistent feedback across roles.
