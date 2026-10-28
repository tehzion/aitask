# AiTask Task Assignment, Acceptance & Role-Based Workflow Audit

**Assessment date:** 2026-10-26 (Asia/Kuala_Lumpur)  
**Scope:** Current working tree, task application rules, authorization helpers, Supabase migrations, database tests, and role-focused browser tests.  
**Release decision:** **NO-GO for production.** Local UI and lifecycle checks pass, but the disposable database suite reproduced an assignment authorization defect. No production data, production schema, or deployment was changed.

## A. Current task workflow inventory

| Workflow | Current behavior | Authorized roles and scope | Verification | Gap / status |
| --- | --- | --- | --- | --- |
| Create and route task | PM task creation routes to an eligible project HOD as `pending_hod`. If no eligible HOD exists, direct Staff assignment is supported without adding a new task status. | Super Admin broadly; PM in assigned projects; HOD and Staff according to effective role permissions and department/project scope. Client cannot create internal work. | Application unit tests, the PM no-HOD Playwright case, and local pgTAP routing tests. | **PASS in UI/application.** Direct fallback target membership is not enforced consistently in the database; see D-04. |
| HOD delegation | The responsible HOD can hand pending work to eligible Staff while retaining HOD responsibility. | Project and department scoped HOD; Staff target must be eligible for the project. | Unit tests and the existing local pgTAP HOD delegation case passed. | **PASS locally;** hosted authorization not verified. |
| Reassignment | Assignment changes update `assignedBy` attribution and route fields. PM can reassign within an owned portfolio; bypassing an eligible HOD requires a reasoned override. Assignment is locked during review, after approval, after completion, and when cancelled. | Super Admin; scoped PM; eligible HOD. Staff and Client cannot reassign. | Unit tests, attribution pgTAP tests, browser coverage; DB suite reported one direct-fallback boundary failure. | **PARTIAL.** UI and normal routed changes are scoped; direct no-HOD database mutation can escape Staff project membership. |
| Acknowledgment | Staff has an **Accept assignment** action. It records `acceptedBy`/`acceptedAt` and activity. Acceptance is optional; starting work also records acceptance. Reassignment clears prior acceptance. | Assigned Staff member. | Focused unit suite and source path inspection; acceptance is not a prerequisite to start. | **PASS locally.** No decline action or decline reason is implemented. |
| Progress and execution | Assigned Staff can start work, update progress, record blockers/help requests, add work notes, and attach output evidence. Progress updates do not themselves complete a task. | Assigned Staff; authorized PM/HOD can manage or monitor within their scope; Super Admin. | Unit tests, 31 role/responsive Playwright tests including Staff save/retry recovery, and local pgTAP workflow checks. | **PASS locally.** Successful hosted Storage upload/download and Realtime delivery were not verified. |
| Internal review | Effective task/project approval mode determines whether review is required. HOD or PM reviewers are selected by configured mode and scope. PM can perform authorized review within their portfolio. | Independent eligible HOD, responsible PM, or Super Admin under the configured approval rules. | Unit tests, role-readiness browser flow, and local pgTAP review tests. | **PASS locally.** No universal approval chain was introduced. |
| Revision and resubmission | An authorized reviewer can request changes. Work returns to an editable state, revision count/history updates, and the assignee is notified; Staff can resubmit. | HOD/PM/Super Admin when authorized; assigned Staff resubmits. | Unit tests, browser workflow coverage, and database workflow tests in the local suite. | **PASS locally.** Live notification delivery is not verified. |
| Completion and reopening | Staff can complete work directly when internal approval mode is `none`; otherwise internal review and PM finalization apply. Authorized reviewers can return completed work for revision. | Assigned Staff in no-approval mode; PM after required approval; Super Admin under administrative rules; HOD/PM can request revisions in scope. | Unit tests, role-readiness Playwright, client-visible completion pgTAP tests. | **PASS locally.** Production role behavior remains unverified. |
| Client delivery review | Client-visible work can be reviewed, commented on, and accepted by a matching Client. `clientApprovalStatus` is separate from internal task status; client acceptance does not replace internal completion. | Client restricted to matching company and published/client-visible work; internal reviewers remain separate. | Client delivery browser tests from current run and local database tests. | **PASS locally.** No production Client session was used. |
| Notifications and history | Assignment, status, review, and revision actions generate scoped notifications. Creator, assigner, work-state changes, and audit events are recorded. Entity-history rows are append-only in repository migrations; task-facing work history retains a rolling 50 entries. | Recipients follow task responsibility and role scope; entity-history access is Super Admin restricted in the migration. | Notification, attribution, workflow, and history pgTAP coverage ran in the local database suite; Staff save/recovery browser cases passed. | **PARTIAL.** Local persistence tests pass except the assignment regression; Realtime delivery and production history retention were not tested. |

## B. Role permission matrix

This is the current built-in role behavior. Custom role templates and member-level permissions can change grants, but project, department, task-state, and server checks still apply. “Super Admin” refers to the `isSuperAdmin` identity, not every member with an Admin-like label.

| Action | Super Admin | Project Manager | HOD | Staff | Client |
| --- | --- | --- | --- | --- | --- |
| Create task | Allowed across workspace | Allowed in assigned projects | Allowed by effective permissions in department/project scope | Default role includes task creation; assignment remains self/scope limited | Denied |
| Assign / delegate | Allowed, with administrative boundary | Own project: eligible HOD first; direct eligible Staff if no eligible HOD; reasoned override where HOD stage exists | Delegate to eligible project Staff in department scope | Cannot assign work to others | Denied |
| Reassign | Allowed | Own portfolio only; review/terminal states locked; reason required to bypass HOD | Scoped delegation authority; terminal states locked | Denied | Denied |
| View work | Workspace-wide | Assigned project portfolio | Department work and explicitly assigned projects | Assigned/created work plus permitted department scope | Matching company, client-visible work only |
| Update progress / submit | Allowed as admin | Own portfolio | Scoped oversight and delegated work | Assigned task execution and submission | Denied for internal task workflow |
| Internal review / approve | Independent reviewer or explicit administrative override reason | Responsible PM in portfolio; can perform configured PM review/finalization | Eligible HOD when configured approval mode permits | Denied | Denied; client delivery acceptance is separate |
| Request revision / reopen | Allowed under administrative review rules | Own portfolio | Eligible department review scope | Cannot reopen; can revise/resubmit returned work | Can give delivery feedback; cannot reopen internal task |

The current permission helpers are in `src/shared/authorization/access.ts` and `src/shared/authorization/taskWorkflowAccess.ts`. The role-readiness database cases verify several key boundaries, but the test results below are local evidence only.

## C. Assignment test report

| Scenario | Result | Evidence and limitation |
| --- | --- | --- |
| A — PM assigns directly to Staff when project has no eligible HOD | **UI PASS; server FAIL** | New Playwright case passed for project-scoped Staff selection and task creation. The database regression case sent an authorized `task.create` command for active same-department Staff omitted from `staffMemberIds`; the server returned `ok: true` where the test expected rejection. |
| B — PM creates for HOD, HOD delegates to Staff | **PASS locally** | Existing database test verifies PM creation in `pending_hod` and HOD delegation to project Staff. The full local pgTAP run executed this case successfully. |
| C — HOD assigns department work | **PARTIAL** | Department/project eligibility is enforced in application helpers and HOD database cases passed. An end-to-end HOD assignment case was not run in this pass. |
| D — one Staff member across PM portfolios | **PARTIAL** | Project-scoped assignee selection and PM ownership helpers are covered by unit/database tests. The direct no-HOD database path proves project membership is not uniformly enforced; live cross-project authenticated sessions were not available. |
| E — invalid, inactive, unlinked, or foreign-project assignee | **PARTIAL / FAIL at database boundary** | UI/application changes filter inactive, unlinked, wrong-department, and out-of-project candidates; unit tests pass. The active foreign-project Staff pgTAP reproduction failed because the database accepted it. Inactive and unlinked direct RPC attempts were not separately executed in this pass. |

## D. Acceptance and approval report

- **Task assignment** gives a task to an owner; it is not the same event as acceptance.
- **Staff acknowledgment** is already implemented as optional `Accept assignment`. It records the acting Staff member and time, and starting work also records acceptance. Work is not blocked while waiting for that optional acknowledgment. There is no decline/decline-reason flow.
- **Internal approval** is independently controlled by the effective task/project approval mode. The implementation keeps the existing optional mode and supports HOD/PM review, approval, revision, resubmission, and no-approval completion.
- **Client delivery acceptance** uses the separate client-review state and is limited to client-visible deliveries for the matching company. It does not mark an internally incomplete task complete or overwrite the task’s internal completion state.
- No new task status, required acceptance step, or approval policy was introduced.

## E. Defect register

| ID | Severity | Affected role | Reproduction / root cause | Fix and evidence | Status |
| --- | --- | --- | --- | --- | --- |
| D-01 | P2 — task creation blocked | PM | Create a task in a project with no eligible HOD. The modal previously required a HOD even though the route and database design preserve direct assignment when no HOD is available. | Updated the modal and `addTask` fallback to offer eligible project Staff without adding route-state markers. PM no-HOD Playwright case passed; focused unit tests passed. | **Fixed and verified locally.** |
| D-02 | P2 — incorrect routing | PM | A department HOD not assigned to the selected project could make the client-side flow require HOD routing, while the SQL validator uses project membership. | Pass project context through routing and assignee selection; HOD eligibility now matches project membership. Unit coverage passed. | **Fixed and verified locally.** |
| D-03 | P2 — misleading/unusable assignee options | PM/HOD | Directory entries without a login or outside project membership could appear as assignment candidates, while the command path requires linked active members and project eligibility. | Filter candidate options and reject unlinked/out-of-scope targets in the application mutation layer. Focused unit suite passed. | **Fixed in UI/application; server defense still needs D-04.** |
| D-04 | P1 — authorization boundary failure | PM; indirectly affected Staff and project owners | In a no-HOD project, an authorized PM sends `task.create` for active Staff in the same department but absent from the project’s `staffMemberIds`, omitting route state as the supported direct-fallback flow does. The current local pgTAP run observed `have: true`, `want: false`. The SQL membership predicate is conditional on `v_new_state = 'assigned_staff'`, so the no-state direct route bypasses it. | Added a regression assertion in `supabase/tests/database/pm_hod_staff_assignment.test.sql`. A forward database migration should enforce target project membership on every new or changed assignment, including direct fallback, while preserving existing task statuses and approval policy. | **Open; migration requires your approval.** |

The database source also treats a Project Manager assignee as eligible without requiring that PM to appear in `projectManagerIds`. The application filter is project-scoped, but that SQL target-scope case was not separately reproduced in this run; include it in the proposed database guard and regression tests if approved.

## F. UI/UX findings

- The task creation form now reflects the selected project’s HOD and Staff membership. If no eligible HOD exists, PMs can assign an active project Staff member directly.
- Task assignment candidates now exclude unlinked directory rows and out-of-project HOD/Staff/PM entries in the application flow.
- Staff has a clear **Accept assignment** and **Start work** path; optional acknowledgment does not prevent task execution.
- Staff save/retry tests passed for delayed acknowledgments, failed saves, duplicate-comment prevention, newer drafts, desktop/mobile draft confirmation, and “Use latest” recovery.
- The 31-test browser run covered responsive role routes, dark/Chinese mode, reduced motion, Staff mobile focus/actions, and accessibility. It passed with no reported skips. Narrow HOD tab strips remain horizontally scrollable at 320px, as designed.
- Empty eligible-Staff messaging, successful remote evidence download, hosted failure behavior, and live notification link delivery were not independently verified in this pass.

## G. Automated test results

### Passed

- `pnpm test` — **122 files, 943 tests passed**.
- Focused task/role unit suite — **7 files, 58 tests passed**.
- `pnpm check` — TypeScript passed.
- `pnpm lint` — passed.
- `pnpm verify:architecture` — **9 checks passed**; 228 files, 0 runtime cycles, 0 type-inclusive cycles.
- `pnpm verify:i18n:strict` — **0 findings across 228 source files**.
- `pnpm build` — passed. Vite reported a non-fatal chunk-size warning for bundles over 500 kB.
- PM direct-to-Staff no-HOD Playwright case — **1 passed**.
- Role/responsive regression command (`client-wizard`, `responsive-audit`, `session-action-gaps`, `staff-save-recovery`, `staff-workspace-v2`) — **31 passed, 0 failed, 0 skipped** in 5.5 minutes.

### Failed

- `AITASK_PHASE5_UAT=true pnpm verify:supabase:rollout` — **76 database files, 1,162 pgTAP assertions, 1 failed** (no skips reported). The failing assertion is the new D-04 direct-fallback assignment case: database returned `ok: true` for a Staff target outside the project membership. The remaining database assertions passed. The first local stack attempt hit an unhealthy Realtime/Storage health check; a retry started the disposable stack and reached the database tests.

### Blocked or not verified

- The rollout exited after the failing pgTAP suite, so its later schema lint/advisor steps did not run.
- Live production/staging role sessions, hosted database policy, Realtime delivery, remote Storage permissions, production notification routing, and production data were not tested.
- No migration was applied to production, and no deployment was performed. The database suite replayed the repository migrations only in a disposable local stack.

## H. Final readiness assessment

| Workflow | Readiness |
| --- | --- |
| PM task creation and no-HOD UI fallback | **PASS locally** |
| PM → HOD → Staff routing | **PASS locally; hosted scope not verified** |
| Staff acknowledgment, progress, and submission | **PASS locally** |
| Optional internal approval, revision, and completion | **PASS locally** |
| Client delivery review separate from task completion | **PASS locally** |
| UI/application assignment candidate filtering | **PASS locally** |
| Server rejection of out-of-project direct fallback assignment | **FAIL** |
| Production authorization and release | **NO-GO / NOT VERIFIED** |

**Recommendation:** Keep production NO-GO. The front-end and application routing defects found in this audit are fixed and their local tests pass. The database test reproduced a real project-membership authorization gap in the supported no-HOD direct-assignment path. A migration is needed to close it; this audit has not created or applied one because the request requires your approval first.

**Approval requested:** Authorize a forward migration and corresponding pgTAP coverage that enforce active project membership for every assignment target (including the no-HOD direct route and scoped PM targets), without adding task statuses or changing approval policy. Once authorized, the migration can be implemented and the full disposable database rollout rerun before reassessing readiness.
