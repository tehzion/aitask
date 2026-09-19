# Boss Koo, Project Manager, HOD and Staff audit — 18 September 2026

Audit target: current working tree, application version 2.6.1, including the authorization and responsive UI changes already present when this follow-up began. Production deployment and authenticated production probes remain out of scope.

## Assessment

The application has a substantial authorization foundation. This follow-up closes the task-detail visibility/action mismatch between Boss Koo, Project Manager, HOD, and Staff surfaces and the Supabase command/RLS boundary. Other findings below remain tracked separately unless explicitly marked remediated.

This is a local code and browser audit, not certification of the deployed environment. Browser tests used local demo data. SQL findings trace the latest migration definitions and their command/trigger paths; authenticated production RPCs, deployed migration state, email delivery and private storage were not exercised.

## Current role contract

| Capability | Boss Koo | Project Manager | HOD, default role | Staff, default |
| --- | --- | --- | --- | --- |
| Identity | `isSuperAdmin` grants all permissions | Portfolio-scoped non-superadmin | HOD department scope | Assignment/creator scope |
| View tasks | All | Assigned/created plus owned company/project portfolio | Assigned/created plus member departments | Assigned/created |
| Edit tasks | All | Assigned or created only | Assigned/created plus member departments | Assigned/created |
| Comment on task | All | Assigned or created only | Same as edit scope | Same as edit scope |
| Delegate tasks | Yes | Own created tasks | Own created tasks | No |
| Delete tasks | All | Same scope as editing | Same scope as editing | Same scope as editing |
| Users, registration and permissions | Boss-only powers | No | No | No |
| Internal service prices and service administration | Yes | As configured, never workspace-wide task access | Not enabled by default | Not enabled by default |
| Dashboard | Management dashboard | Portfolio dashboard | Department workbench | Assigned workbench |

PM portfolio-only task details are explicitly read-only. HOD department access is intentionally broader than ordinary Staff, while protected Boss Koo capabilities cannot be delegated. Individual permission overrides and explicit department-scoped custom Staff roles are resolved by the shared frontend/server contract. Changes made by Boss Koo can alter non-protected defaults above.

Sources: `src/lib/access.ts`, the HOD migration, and the September member-permission migration.

## Findings

### 1. P1 — Internal-task status changes generate client notifications

**Roles:** Boss Koo, HOD, Staff.

`updateTaskStatus` creates a client-targeted notification whenever the next status is Completed or Waiting Approval, without checking task visibility. Staff task creation defaults to internal visibility.

For Staff/HOD, the database's staff notification trigger explicitly rejects notifications targeting a client for an internal task. The notification is included in the task save, so this can reject the entire command. For Boss Koo with the Admin base role, the staff-only trigger does not run, leaving a notification containing the internal task title available to the client. Notification audience checks do not check the linked task's visibility.

**Evidence:** A local browser/store probe completed an internal task titled “Confidential internal task” and observed a client notification containing that title. Backend rejection/disclosure consequences are established by source tracing, not a live production test.

**References:** [status mutation](/Users/user/Downloads/aitask-master/src/store/index.ts:2409), [staff notification enforcement](/Users/user/Downloads/aitask-master/supabase/migrations/20260903160806_harden_staff_command_authorization.sql:169), [client notification audience](/Users/user/Downloads/aitask-master/supabase/migrations/20260802121500_notification_center.sql:262).

**Fix:** Generate client notifications only for explicitly client-visible work, and enforce this for every actor on the server. Test both review and completion for all three roles, with internal and client-visible tasks.

### 2. P1 — Revoking Create tasks is not enforced by the command authorization predicate

**Roles:** Staff/HOD whose Create tasks permission is disabled by Boss Koo.

The frontend checks `createTasks`, but the latest `aitask_can_mutate_entity` task-insert branch only checks internal role and creator identity. The assignment helper checks identity, department and assignee, not `createTasks`. The project-link helper accepts a null project. Consequently the reviewed SQL permits a self-created, self-assigned task with no project even when creation is disabled, bypassing both the UI permission and its required company-link workflow.

**Evidence:** Static review of the latest function definitions, their wrappers and entity guard. No adversarial request was sent to production.

**References:** [insert authorization](/Users/user/Downloads/aitask-master/supabase/migrations/20260911020546_enforce_task_project_link_authorization.sql:83), [null-project handling](/Users/user/Downloads/aitask-master/supabase/migrations/20260911020546_enforce_task_project_link_authorization.sql:17), [assignment validation](/Users/user/Downloads/aitask-master/supabase/migrations/20260907043633_hod_task_ownership_permissions.sql:120), [frontend check](/Users/user/Downloads/aitask-master/src/store/index.ts:2890).

**Fix:** Check `createTasks` server-side on insertion and enforce the same project/service-deliverable requirements as the application. Add negative SQL tests for revoked creation permissions and unauthorized unlinked work.

### 3. P1 — Workspace loading silently truncates above the API row cap

**Roles:** Primarily Boss Koo; any role with enough visible records.

The initial member and entity reads perform a single `select` without pagination or a completeness check. All non-notification entity types share that one query: tasks, comments, approvals, clients, plans and other rows compete for the same cap. The returned subset is treated as the entire workspace. This can omit tasks, comments or custom-role definitions and produce incomplete reports. The separate member read can also miss the current member at larger scale.

The actual deployed cap and row counts were not checked. Supabase documents a default maximum of 1,000 rows and recommends pagination; the issue applies at whatever cap is configured. [Official Supabase documentation](https://supabase.com/docs/reference/python/select).

**Reference:** [workspace reads](/Users/user/Downloads/aitask-master/src/lib/secureWorkspace.ts:1756).

**Fix:** Load with stable ordering and pagination, fetch the authenticated member directly, and verify complete loading before publishing the workspace state. Add a fixture exceeding the API cap with mixed entity types.

### 4. P2 — HOD permissions were not exposed by the task workspace — remediated

**Roles:** HOD; Staff for attachment editing.

Every Staff-base user is routed to `StaffAllWork` and `StaffTaskFocus`. This includes HODs with `manageCreatedTasks`. The focus panel exposes status and comments but no edit, reassign, delete, revision-request or attachment-update controls. The richer task modal contains those capabilities but is only rendered by the other task-screen branch. Calendar date editing remains available where permitted.

**Evidence:** Browser probe opened an HOD-created task assigned to another member and confirmed that its panel had a status selector but no edit/delete/reassignment buttons.

**References:** [Staff route branch](/Users/user/Downloads/aitask-master/src/pages/Tasks.tsx:1235), [focus panel](/Users/user/Downloads/aitask-master/src/components/StaffTaskFocus.tsx:94), [existing editing UI](/Users/user/Downloads/aitask-master/src/components/TaskDetailsModal.tsx:198).

**Resolution:** The shared task focus now derives actions from the task-access resolver, exposes HOD department work and full-edit controls where allowed, keeps reassignment limited to HOD-created work, and allows assigned Staff to use permitted detail/attachment actions. Coverage is included in the task-detail role matrix.

### 5. P2 — Read-only Staff receive editing controls and can lose a typed comment — remediated

**Roles:** Staff/HOD granted View all tasks, inspecting an unrelated task.

The focus panel disables controls for backend activity but never checks `canEditTask` or `canCommentOnTask`. Store actions correctly reject unauthorized changes by returning without modifying state. The panel then commits an empty mutation, interprets success as a successful comment save and clears the draft.

**Evidence:** Browser probe used a Staff account with View all tasks on an unrelated task: controls were enabled; submitting a comment cleared the textarea; no comment was added and no error appeared. This is misleading UI/data-entry loss, not proof of unauthorized backend editing.

**References:** [status controls](/Users/user/Downloads/aitask-master/src/components/StaffTaskFocus.tsx:102), [comment submission](/Users/user/Downloads/aitask-master/src/components/StaffTaskFocus.tsx:82), [comment authorization](/Users/user/Downloads/aitask-master/src/store/index.ts:3942).

**Resolution:** `StaffTaskFocus` and `TaskDetailsModal` now hide unauthorized actions, return explicit comment mutation results, retain drafts after rejected/sync-failed saves, and fail closed when a task is no longer visible.

### 6. P2 — Cancelled tasks count as open and overdue in the client tracker

**Roles:** All three.

The tracker defines open work as anything not completed. A Cancelled task therefore contributes to open/overdue totals, next deadline and incomplete progress, and can carry forward into later periods. Other reporting helpers correctly exclude Cancelled tasks, so the screens disagree.

**Reproduction:** Cancel a task whose due date is yesterday. The client tracker can still show it in Open work and Overdue while the main reporting helper excludes it.

**References:** [tracker counts](/Users/user/Downloads/aitask-master/src/lib/deliveryTracker.ts:159), [carry-forward rule](/Users/user/Downloads/aitask-master/src/lib/deliveryTracker.ts:94), [shared open-task definition](/Users/user/Downloads/aitask-master/src/lib/taskReporting.ts:75).

**Fix:** Use one shared definition of open work across queues, tracker, reminders and reports. Show cancelled work separately if needed.

### 7. P2 — Cross-assignee dependencies can disappear from the Staff warning

**Roles:** Staff and HOD working on multi-person task chains.

The task focus panel resolves predecessor IDs only against locally loaded tasks and drops missing records. In production, RLS intentionally withholds unrelated tasks. A predecessor assigned to another employee may therefore be absent even when it is incomplete. The panel treats that situation as no blocker and skips the confirmation. The dashboard further limits its blocker calculation to the user's own assigned tasks.

**Evidence:** Source trace of predecessor resolution against role-scoped workspace reads; no production dependency chain was altered.

**References:** [predecessor resolution](/Users/user/Downloads/aitask-master/src/components/StaffTaskFocus.tsx:58), [personal queue scope](/Users/user/Downloads/aitask-master/src/components/StaffMyWork.tsx:29), [database task scope](/Users/user/Downloads/aitask-master/supabase/migrations/20260907043633_hod_task_ownership_permissions.sql:65).

**Fix:** Return a minimal authorized dependency-state projection, or evaluate dependency readiness on the server. Treat missing predecessor information as unknown, not completed. Keep the existing override behavior only if it is the intended workflow.

### 8. P2 — Reminders are tied to app startup and are not reset after rescheduling

**Roles:** All three.

Reminders run during app bootstrap, not from a scheduled server process or a midnight refresh. Tasks created after bootstrap or tabs left open across days can miss reminders until another boot. Once `dueReminderSent` becomes true, changing the due date leaves it true, suppressing reminders for the new deadline. Cancelled work is also not excluded.

An additional role interaction needs a database regression test: reminder generation walks all loaded tasks, including tasks a View-all Staff account can see but cannot edit. Their combined save can be rejected by task mutation authorization.

**Evidence:** Browser/store probe confirmed `dueReminderSent` remains true after rescheduling. Startup-only invocation and role interaction are source findings.

**References:** [startup invocation](/Users/user/Downloads/aitask-master/src/App.tsx:97), [reminder generator](/Users/user/Downloads/aitask-master/src/store/index.ts:4004), [rescheduling](/Users/user/Downloads/aitask-master/src/store/index.ts:2551).

**Fix:** Generate reminders on the server with a workspace timezone and an idempotency key incorporating the deadline and reminder type. Reset/supersede reminders on rescheduling and exclude terminal tasks.

### 9. P2 — Four-week report mixes period trends with lifetime metrics

**Roles:** All three.

The report heading and description promise the latest four weeks. The trend uses four weeks, but summary cards and department performance use every visible task. Old completions and future pending work inflate the apparent period totals. Active Assignees also includes assignees of historical completed work.

**References:** [unbounded summary](/Users/user/Downloads/aitask-master/src/pages/Reports.tsx:39), [department aggregation](/Users/user/Downloads/aitask-master/src/pages/Reports.tsx:52), [period description](/Users/user/Downloads/aitask-master/src/pages/Reports.tsx:96).

**Fix:** Apply an explicit period definition to all metrics, or label lifetime/current-backlog cards separately. Define Active Assignees using open work in the selected period.

## Enhancement priorities

1. **Boss Koo:** A permission preview showing each member's effective role, individual overrides, visible scope and allowed actions; a searchable audit log for reassignment, permission changes, deletion and client-visible updates; bulk reassignment before staff offboarding.
2. **HOD:** Separate My work and Delegated work views; team workload and overdue escalation within a deliberately defined scope; review/revision controls for owned tasks. If department-wide oversight is wanted, add an explicit department-scoped capability rather than granting global View all tasks.
3. **Staff:** Add/edit attachment links, retain unsaved comments, display dependency readiness, clearly distinguish internal work from client review, and show confirmed save status rather than immediate optimistic success alone.
4. **Shared:** Unify task-state calculations, paginate large data sets, make notification audience selection server-owned, and add secure-backend integration coverage for every role. Current demo browser tests cannot exercise RLS or database trigger failures.

## Verification and coverage

- Unit tests: **259 passed across 39 files**.
- TypeScript check and ESLint: **passed**.
- Production Vite/PWA build: **passed**, with the existing large-chunk warning (main bundle approximately 507 kB minified).
- First browser batch: **6 passed, 3 failed**. The three failures were Staff visual snapshot mismatches. The inspected desktop diff is around queue-tab rendering; do not treat this as an authorization failure or silently replace the baselines.
- Re-run of those three Staff tests with image comparisons disabled: **3 passed**, including task status/review action and mobile/Chinese-mode checks.
- Two temporary audit reproduction tests: **2 passed**, confirming HOD action absence, silent read-only comment loss, internal-task notification generation and reminder-flag retention. The initial HOD probe required a fixture correction to avoid a full-page reload resetting the synthetic role; the corrected run passed.
- Additional service/accessibility browser checks: **9 passed**, covering keyboard/theme accessibility, service plans and role workbenches, company/project creation, demo file and price isolation, per-account release notices, and service catalog/template creation and deletion guards. Screenshot comparisons were disabled for this batch.
- Across these runs, **18 existing browser scenarios passed functionally**, plus **2 focused audit probes**. The three initial visual comparison failures remain unresolved; no screenshot baselines were updated. Temporary probe files were removed after recording their results because they deliberately asserted the observed buggy behavior.
- Runtime: Node 22.23.2 with pnpm 10.4.1 is now configured as the default fresh-login toolchain; Supabase CLI 2.117.0 and JS 2.116.0 are installed and verified. No production accounts, client records, emails or files were changed.
- Subsequent local Supabase verification passes **24 database test files/375 tests**, with no lint or advisor findings. Authenticated production probes remain deployment-gated.

The audit covered routing/login setup, effective permissions, Boss account/registration management, task creation/edit/status/comment/delete paths, HOD ownership, calendar dates, companies/client tracker, service workspaces and files, reports, notifications, settings, synchronization and relevant SQL/Edge Function enforcement. This does not imply every UI permutation or production integration was exercised.
