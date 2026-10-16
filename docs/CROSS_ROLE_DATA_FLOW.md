# Cross-Role Data Flow — AiTask

**Date:** 2026-10-17 · **Dependency map of every data mutation → affected records/roles/dashboards/notifications.**

Legend: roles = SA (Super Admin), PM, HOD, Staff.

---

## Mutation dependency map

| Mutation | Source | Affected records | Affected roles | Dashboards | Notifications | Invalidation |
| --- | --- | --- | --- | --- | --- | --- |
| Create project | `createProject` | `projects`, `clients` (implied) | creator (PM/SA) | PM portfolio, Companies | — (creation notice where configured) | `projects`/`clients` set + selectors |
| Create task | `addTask` | `tasks`, `deliverables` (via `deriveServiceProgress`) | PM/HOD/Staff (creator/assigned) | PM/HOD/Staff lists | assignee "Task Assigned To You" | task list + progress |
| Assign / reassign task | `updateTaskAssignee` | `tasks.assignedTo/assignedBy/assignedAt` | SA, PM (owner), HOD (dept), old+new assignee | PM/HOD/Staff workload | new assignee `Task Assigned To You`; old assignee via status return | `tasks` + workload + counts |
| Task status update | `updateTaskStatus`/`updateTaskWork` | `tasks.status/completion/…`, `deliverables` | SA, PM, HOD (dept), Staff | all role dashboards + progress | `resolveTaskUpdateRecipientIds` (Boss + owning PM + contact) | `deriveServiceProgress` |
| Submit for review | `updateTaskStatus('Waiting Approval')` | `tasks.status`, `workState` | HOD/PM reviewers | review queues | `localHodReviewNotifications` → department reviewers | review queues |
| Approve / reject (internal) | `updateTaskStatus('Approved')` / `requestRevision` | `tasks.status/reviewDecision/internalReview` | requester (Staff), PM, HOD | pending approval counts | requester + PM + Boss | review queues + progress |
| Client approve / request changes | `reviewClientApproval` | `tasks.clientApprovalStatus/approvalHistory` | Client + PM + assignee | client portal + delivery tracker | assignee + PM + Boss | approval history + stage |
| Delete task | `deleteTask` | `tasks`, `deliverables.taskIds/primaryTaskId`, notification routes | PM/creator/SA | lists + counts | routes to deleted task filtered (`store/index.ts:2983`) | task list + progress |
| Delete company/client | `deleteClientProfile` | `clients`, orphaned Client portal accounts | PM/SA | Companies + portfolio | — | client list + portfolio |
| Change role/permission | `updateMember`/role editor | `aitask_members`, `custom_role` rows | all (access recalc) | nav + access | — | **Realtime** member-access channel → refresh |
| Change department | `updateMember`/`updateTask.department` | `members.departments`, `tasks.department/reviewCover` | HOD/Staff (dept scope) | dept workload | — | access + workload |

## Key invariants (verified in source + tests)

- **Reassignment** (`Scenario E`): old assignee loses edit access (unless creator/HOD-scope), new assignee gains it; `resolveTaskUpdateRecipientIds` notifies the right parties; no stale visibility.
- **Deletion** (`Scenario F`): `primaryTaskId` cleared, notification routes to deleted task removed, Client portal accounts cleaned on company delete; `canDeleteTask`/`canDeleteClientProfile` enforce ownership/portfolio.
- **Department change**: `reviewCover`/`accountableLeadId` invalidated on department change (`store/index.ts:2895-2900`).
- **No cross-tenant exposure**: PM scope is id-first (`matchesOwnedClient`), HOD is department-scoped, Staff is assignment-scoped; server-side `aitask_can_view_task`/`aitask_can_mutate_entity` match.

## Cross-role scenarios (source-verified; browser e2e not re-run)

| Scenario | Result | Evidence |
| --- | --- | --- |
| A — Project creation | PASS | `createProject`, `getVisibleProjects` |
| B — Task assignment | PASS | `updateTaskAssignee`, `unassignedTaskNotifications.test.ts` |
| C — Task status update | PASS | `updateTaskStatus`, `taskStageProgress.test.ts` |
| D — Approval workflow | PASS | `hodReviewHandoff.test.ts`, `workflowReviewGate.test.ts`, `clientApprovalProgress.test.ts` |
| E — Reassignment | PASS | `taskAssignment.test.ts`, `canEditTask`/`canAssignTasksToOthers` |
| F — Deletion/archiving | PASS | `deleteTask` cleanup, `duplicateClientDelete.test.ts` |

## Verification matrix

| Workflow | Super Admin | Project Manager | HOD | Staff | Dashboard | Notification |
| --- | --- | --- | --- | --- | --- | --- |
| Project Creation | PASS | PASS | PASS | NA | PASS | PASS |
| Task Assignment | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Status Update | PASS | PASS | PASS | PASS | PASS | PASS |
| Approval / Rejection | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Reassignment | PASS | PASS | PASS | PASS | PASS | PASS |
| Record Deletion | PASS | PASS | PASS | PASS | PASS | PASS |
| Department Changes | PASS | NA | PASS | PASS | PASS | PASS |
| Role Changes | PASS | PASS | PASS | PASS | PASS | PASS |

*(All PASS = source + unit-test verified. Live simultaneous multi-user browser sessions were not run in this offline environment — they run in CI.)*
