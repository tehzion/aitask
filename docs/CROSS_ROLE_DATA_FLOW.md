# Cross-Role Data Flow

**Date:** 2026-10-17
**Roles:** Super Admin (SA), Project Manager (PM), HOD, Staff. Client projection is included where it participates in approval/review.

## Dependency map

| Mutation/source action | Committed records | Affected roles | Dashboards/modules | Notifications | Cache/realtime behavior |
| --- | --- | --- | --- | --- | --- |
| Create/update/delete project | `project`; related client/task scope | SA, owning PM, authorised HOD/Staff | Dashboard, Companies, Reports, Tasks | Contextual project/task notices where configured | optimistic store update → command → workspace revision event → authorised snapshot |
| Create task | `task`; linked deliverable progress | SA, PM, HOD, assignee Staff | Tasks, Dashboard, Calendar, Delivery Tracker, Reports | assignee/reviewer/portfolio recipients | task and derived progress recompute; revision invalidates all sessions |
| Assign/reassign task | `task.assignedTo`, attribution fields | SA, PM, HOD; old/new Staff | workload, task counts, review queues | new assignee; affected prior/portfolio recipients | old visibility is removed by the next RLS snapshot; counts recalculate |
| Status/work update | task status, completion, work-state, timestamps | SA, PM, HOD, Staff; Client projection when visible | all role dashboards, Calendar, Delivery Tracker, Reports | task owner, reviewer, PM/SA, client when applicable | canonical transition/progress reducer + revision event |
| Internal approval/revision | task review fields, comments, approval history | Staff requester, HOD/PM reviewer, SA/PM reporting | Approvals, Dashboard, Tasks, Reports | requester/reviewer/portfolio recipients | review queue and progress recalculate from committed task |
| Client approval/rejection | task client approval and approval history | Client, Staff, PM, HOD/SA reporting | Client Workspace, Delivery Tracker, Reports | assigned Staff and internal recipients | client projection reloads through portal RPC; internal users reload RLS snapshot |
| Delete/archive task | task, deliverable links, task-linked notifications | authorised owner/manager/reviewer; all viewers lose visibility | Tasks, Calendar, dashboards, Reports | deletion notice retained; stale task routes removed | DB cleanup trigger + optimistic unlink + revision event |
| Delete project/client | project/client and related service records per policy | SA/owner PM; affected HOD/Staff/Client | Companies, portfolio, service workspace | restricted/deleted links do not remain actionable | canonical snapshot removes inaccessible rows |
| Service plan/cycle/deliverable change | service package, plan, cycle, deliverable, comments, add-ons | SA/PM and authorised operational roles | Delivery Tracker, Dashboard, Reports | service/review recipients where configured | service RPC transaction + derived status + revision event |
| Comment/attachment/output | comment/attachment metadata and task/service link | authorised task/service viewers | task detail, Client Workspace, delivery review | comment/review recipients | storage reconciliation and entity snapshot reload |
| Notification read/unread | notification receipt/read fields | current recipient only | Navbar, Notifications, dashboard counters | no new notification | notification read RPC; revision event; local optimistic receipt rollback on failure |
| Due-date reminder | notification plus reminder claim | assigned Staff/reviewer/PM/SA as configured | Dashboard, Calendar, Notifications | deduplicated server reminder recipients | claim/idempotency guard; revision event |
| Member role/department/permission | `aitask_members`, custom-role entity | affected member and all scopes | navigation, dashboards, workload, settings | admin/member notices where configured | access Realtime + workspace revision; pending stale commands are discarded |
| Registration approve/reject | registration and member rows | SA; new member; affected PM/HOD | Settings, people/reporting surfaces | onboarding/decision recipients | command transaction + access refresh |
| Task status/template/role administration | `task_status`, custom-role/template entities | SA and members whose access/status list changes | Settings, task forms, navigation | admin notices where configured | workspace revision; guarded by permissions |

## Mutation contract

Every mutation must satisfy:

1. The browser validates the role-scoped action for immediate UX feedback.
2. The secure backend rechecks authorization, versions, relationships, and transition rules.
3. The transaction commits business rows, derived rows, audit history, and notifications together where applicable.
4. The local projection is only acknowledged as saved after the RPC succeeds.
5. A workspace revision update invalidates other active sessions.
6. Each session reloads only the rows allowed by its current RLS/portal projection.
7. Dashboard selectors recalculate from the refreshed canonical collections.

## Scenario verification

| Scenario | Automated/source result | Live four-account result |
| --- | --- | --- |
| A — Project creation | FIXED & VERIFIED | NOT VERIFIED |
| B — Task assignment | PASS | NOT VERIFIED |
| C — Task status update | PASS | NOT VERIFIED |
| D — Approval/rejection | PASS | NOT VERIFIED |
| E — Reassignment | PASS | NOT VERIFIED |
| F — Deletion/archiving | PASS | NOT VERIFIED |

`PASS` means existing source, unit, database, or E2E coverage passed. `FIXED & VERIFIED` identifies the new revision-invalidation path specifically. `NOT VERIFIED` means no simultaneous live accounts/browser sessions were available in this workspace.

## Verification matrix

| Workflow | Super Admin | Project Manager | HOD | Staff | Dashboard | Notification |
| --- | --- | --- | --- | --- | --- | --- |
| Project Creation | FIXED & VERIFIED | FIXED & VERIFIED | PASS | PASS | FIXED & VERIFIED | PASS |
| Task Assignment | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |
| Task Status Update | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |
| Approval / Rejection | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |
| Task Reassignment | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |
| Record Deletion | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |
| Department Changes | PASS | NOT VERIFIED | PASS | PASS | FIXED & VERIFIED | PASS |
| Role Changes | PASS | PASS | PASS | PASS | FIXED & VERIFIED | PASS |

Live simultaneous cross-role verification remains `NOT VERIFIED` for this session; the automated result is not being represented as live production evidence.
