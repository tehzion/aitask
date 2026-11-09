# Team Feedback Redesign Plan — 2026-11-09

Source: team meeting (Y.L + Participant 1 + Participant 2) ahead of Monday 9 Nov 2026.
Guiding principle from the meeting: **the system adapts to how the team works, not the other way round.**

Every workstream is planned across **all roles** (Boss Koo / Super Admin, Project Manager, HOD, Staff,
Client) and states the **data** it needs: new fields, derived numbers, backfills or migrations.

---

## 0. Baseline: which code is live (read first)

| Line | Branch | Matches live DB? |
|---|---|---|
| **Production** | `origin/codex/posting-date-production-20261104`, then stacked to `origin/codex/hod-workflow-regression-20261106` (6 small commits on top) | **Yes**: every migration up to `20261104062406_block_project_delete_with_linked_tasks` is applied on Supabase `ohjhwyiffgzyatcmmdql` |
| Diverged | `codex/live-production-stabilization-2026-10-26` (this worktree) | **No**: it carries 9 commits and 6 migrations (`20261027144157` … `20261028110000`) that were **never applied** live, and it lacks 84 production commits |

Rules for this work:
1. **Branch from `origin/codex/hod-workflow-regression-20261106`.** Do not ship from this worktree's branch.
2. The live DB has a migration that is **in no branch**: `20261106041228_optimize_pm_service_access`. Before writing any new migration, pull its SQL from the live DB into `supabase/migrations/` so replay stays clean.
3. The 9 diverged commits (UI language re-audit, explicit task visibility, etc.) should be reviewed separately. Cherry-pick only what is still wanted. Not part of this plan.

---

## 1. Decisions (answered by Y.L, 2026-11-09)

| ID | Question | Decision |
|---|---|---|
| D1 | Who approves after Staff sends for review? | **PM approves.** HOD only assigns. |
| C1 | Who may create tasks outside a project? | **HOD inside own projects only.** Staff cannot create tasks; the server already disables Staff creation since `20261103125940`. |
| F1 | Does the Client see Ready-but-not-Delivered as progress? | **Yes, same % for everyone.** |
| E1 | Output link/file required before review/complete? | **Fully optional.** Already true on production (`20261028160000_optional_task_output`); keep it that way. |
| B2 | Special notes per client or per month? | **Per client**, reusing `ClientProfile.notes`. |
| B1 | What is "Block extra request"? | The **"Extra requests this month"** block on the Add-ons tab (`ClientWorkspace.tsx` ~L1038 on production), plus the "N extra requests" chip in `RenewalSignals`. **Remove the block; keep the add-on data.** |

---

## 2. Summary

| # | Workstream | Root cause on production code | Data change | Release |
|---|---|---|---|---|
| A | One home per role (Portfolio, not Dashboard, for PM) | PM Dashboard (MetricStrip, StuckWorkPanel, 6 queues) and Portfolio work (`StaffAllWork`) count the same tasks with different code | None; data-quality check on project PM ownership | R1 |
| B | Merge Plan + Cycle + Add-ons into one "Plan & delivery" page | 5 tabs; schedule rendered twice; Activate, Publish and progress on different tabs | None for layout; reuse `ClientProfile.notes` | R2 |
| C | Open tasks from inside a project | Global "New task" with long company/project dropdowns | New tasks always carry `projectId`; optional legacy backfill | R1 |
| D | Approval = PM only | Approval mode selectable at project and task level (`none/hod/pm/inherit`) | **Backfill** to `pm` (migration) | R1 UI / R3 data |
| E | HOD can't assign, Staff can't Send for review | Evidence gate already removed on production, so the cause is still **unknown** → repro with Mabel | Check Mabel's user/project records | R1 |
| F | Progress stuck at 0% | Link rule removed ✓, but % still counts only **Delivered**, and completing tasks only reaches **Ready** | Formula change; reconcile stale statuses | R1 |
| G | Yellow save banner | Auto-resend exists ✓, but the banner still fires on `backend.hasRemoteUpdate` / pending resolution while a save is in flight | None | R1 |
| H | Activate/Publish in one place; correct typos after publish | Actions on separate tabs; published snapshots immutable | New audited correction command → migration | R2 UI / R3 data |

Release cuts:
- **R1 (front end only, no migration).** Ships A, C, D-UI, E, F, G. Target: this week, first thing.
- **R2.** B and H-UI.
- **R3 (needs Y.L approval and the backup gate).** D backfill, H corrections, C legacy backfill.

---

## A. One home per role

### Current (production)
| Role | `/` | `/tasks` | Issue |
|---|---|---|---|
| Boss Koo | Agency operations (company-wide, charts) | Tasks (board-capable) | Fine; two distinct purposes |
| PM | "Dashboard": `MetricStrip` (Open tasks, Overdue, …), `StuckWorkPanel` (quick re-date/assign), queues: Requires your action · Awaiting your review · Ready to finalize · With department review · Awaiting Staff assignment · Client review (optional) | "Portfolio work" (`StaffAllWork`): the same tasks grouped by stage | **Duplicate numbers** |
| HOD | Department work (`StaffMyWork`) | Department tasks | OK |
| Staff | My work | All work | OK |
| Client | Home | Deliveries | OK |

### Target
| Role | Landing | Number strip (same selector as the list below it) |
|---|---|---|
| Boss | Agency operations (unchanged) | company-wide |
| **PM** | **Portfolio** at `/tasks`; `/` redirects there; Dashboard hidden in desktop and mobile nav | Open · Overdue · Awaiting your approval (D1) · Waiting HOD/Staff assignment |
| HOD | Department work | To assign · Overdue (no "to review" now that the PM approves) |
| Staff | My work | Due today · Overdue · Revisions |
| Client | unchanged | — |

R1 changes (PM):
1. `navigation.ts`: drop the Dashboard item for PM in `primary` and in the mobile list; rename "Portfolio work" to **"Portfolio"**.
2. `access.ts` `getDefaultAccessiblePath`: PM lands on `/tasks`. `Dashboard.tsx` PM branch: `<Navigate to="/tasks" replace />`.
3. **Move `MetricStrip` and `StuckWorkPanel` to the top of the PM Portfolio page** so nothing from the dashboard is lost. The queues already exist as Portfolio stage filters.
4. Remove the PM dashboard "Create task" button (see C).

R2: one shared `getRoleWorkSummary(user, scope)` feeding `ServiceRoleDashboard`, `StaffMyWork` and `StaffAllWork`, plus a unit test that strip counts = queue counts.

### Data
No schema change. The PM portfolio is only as good as project ownership. Run these read-only checks:
```sql
-- projects with no PM (their tasks are missing from every PM portfolio)
select entity_id, data->>'projectName', data->>'clientName' from public.aitask_entities
where entity_type='project' and coalesce(jsonb_array_length(data->'projectManagerIds'),0)=0;
-- open tasks with no project (counted only through fallback rules)
select count(*) from public.aitask_entities
where entity_type='task' and nullif(data->>'projectId','') is null
  and data->>'status' not in ('Completed','Cancelled');
```
Fix any hits through the UI (Edit project → PMs). No migration.

---

## B. One "Plan & delivery" page (merge Plan, Cycles, Add-ons)

### Current (production)
- Tabs: Overview / Plan / Cycles / Add-ons / Activity. `MonthlyPlanSchedule` is rendered on both Plan and Cycles.
- "Activate plan" is in the header, "Publish" is on Cycles, progress is on Overview, and add-ons plus "Extra requests this month" are on Add-ons.
- Production also added monthly **payment records** (`20261103143949_service_cycle_payments`) and plan-details editing. The merged page must keep those.
- Adding a service: standard-package items are read-only. After activation, services can only be added via "Create next revision".

### Target layout (per month, using the existing month picker)
Tabs: **Plan & delivery** · **Activity / Files**.
1. **Month header**: billing period, status, one primary action (see H), payment status.
2. **Delivery progress**: % (F) plus open/overdue tasks and waiting approval. This replaces Overview and cycle closeout.
3. **This month's services**: per item, name · platforms · qty · price (finance only) · deliverables · linked tasks · **+ Task**.
4. **Add-ons this month**: inline list plus **Add service / add-on** (`Addon` with `targetCycleId`; one-off or monthly). The Add-ons tab goes away. **"Extra requests this month" block removed (B1).**
5. **Next month's plan**: the scheduled revision preview, plus **Edit next month** (`DraftServicePlanEditor`; Add service works there).
6. **Special notes**: `ClientProfile.notes`, editable inline (B2).
7. **Amounts and payment** (finance roles): plan total, add-ons, month total, payment record.

### Role matrix
| Section | Boss | PM (owner) | Account & Finance | HOD | Staff | Client |
|---|---|---|---|---|---|---|
| Month header / actions | edit | edit | view + payment | view | view | published months only |
| Progress | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (same %, F1) |
| Services and tasks | ✓ | ✓ + "+ Task" | ✓ | dept tasks; "+ Task" if a project HOD (C1) | own tasks | deliverables only |
| Prices / amounts / payment | ✓ | per `canViewServicePrices` | ✓ | ✗ | ✗ | ✗ |
| Add-ons | edit | edit | view | ✗ | ✗ | ✗ |
| Next month plan | edit | edit | view | ✗ | ✗ | ✗ |
| Special notes | edit | edit | view | view | view | **✗** |

### Data
- Billing period, this month's and next month's plan, amounts, add-ons and payments **all already exist**. This is layout only.
- Special notes: `ClientProfile.notes` exists, so no migration. **Verify before R2** that the client-portal projection (`client_portal_projection`, `client_read_privacy`) does not return `notes` to the Client role.
- B1: no data removed. One-off add-ons remain and still bill. Only the "extra requests" block and the chip are hidden.
- "Add service this month": confirm that a one-off add-on with `targetCycleId` gives the cycle a slot that tasks can link to. If not, add-on rows get "+ Task" (front end only).
- Old deep links (`?tab=plan|cycles|addons`, `#cycle-…`) redirect to the merged tab with the month selected.

---

## C. Open tasks from inside a project

### Target
| Role | Task entry |
|---|---|
| Boss / PM | "+ Task" on each project row/card and project detail; "+ Task" on deliverables (exists). Client and project **prefilled and locked**. |
| HOD | Same "+ Task", only on projects where they are in `hodMemberIds` (C1). |
| Staff | None (C1; server already blocks it). |
| Client | Unchanged (help requests). |

- Companies header keeps only **New client** and **New project**. Remove "New task" (`Clients.tsx` ~L807 on production), the PM dashboard "Create task" button, and the Tasks page create button for non-Boss users.
- Make the company search box prominent on Companies (search state already exists).
- Trimmed form:
  - Main fields: Title · Department → Assignee/Responsible HOD · Service type · Priority · Start/Due · Posting date (optional, exists on production) · Description · Client visibility.
  - Under **More options**: Milestone (optional), Attachment URL/label, Internal notes.
  - **Removed**: Approval workflow (D). Facebook/Website are read from the client profile.

### Data
- New tasks always carry `clientId` and `projectId`, so PM scope (A) becomes exact.
- Legacy tasks without `projectId`: list them with the A query. Optional R3 backfill only where the client has exactly one active project; the rest are fixed manually.

---

## D. Approval: PM only (D1)

### Target flow (all roles)
**PM creates** → **HOD assigns** to Staff → **Staff does** → **Send for review** → **PM approves = Completed** → optional client review (unchanged).

| Role | Can | Cannot |
|---|---|---|
| PM | create, approve, request revision, finalise | — |
| HOD | assign/reassign in department, do work | approve (no "With department review" queue for new tasks) |
| Staff | do work, send for review | create, approve |
| Boss | everything, plus audited override | — |
| Client | optional client review | — |

UI changes:
- Remove "Approval workflow" from `CreateProjectModal`, `CreateTaskModal` and `TaskReviewSettings`.
- Keep Accountable lead / Temporary cover / Boss override collapsed. Cover now means "another PM covers approvals".
- HOD dashboard and Portfolio drop the HOD review queue for `pm`-mode tasks.

### Data
- R1 (UI only): new projects and tasks are saved with mode `pm`. Server support for `pm` already exists (`pm_project_approval_authority`).
- R3 (migration, needs approval). Size it first:
  ```sql
  select data->>'defaultApprovalMode' mode, count(*) from public.aitask_entities
  where entity_type='project' group by 1;
  select coalesce(data->>'approvalMode','(unset)') mode, data->>'status' status, count(*)
  from public.aitask_entities where entity_type='task'
    and data->>'status' not in ('Completed','Cancelled') group by 1,2;
  ```
  Backfill:
  - project `defaultApprovalMode` → `pm`
  - open tasks → `inherit`
  - **leave tasks currently in `Waiting Approval` untouched** so no pending review changes hands mid-flight.
  
  Do it as an audited server command; never edit history.

---

## E. HOD can't assign / Staff can't Send for review

### Findings on production
- The output-evidence gate was **already removed** (`20261028160000_optional_task_output`, and no client check). So "Send for review" is blocked for another reason.
- Production has many HOD fixes: `hod_legacy_task_reassign`, `hod_department_delegation_disable_staff_creation`, `restore_hod_handoff_and_codify_live_grants`. The 6 Nov branch adds HOD acceptance/review regression tests. The bug may already be fixed, or it may be data.
- Most likely data causes:
  - Mabel is not in the project's `hodMemberIds`.
  - Mabel's department or `customRoleId` doesn't match the task department.
  - The task is still `assignmentState = 'pending_hod'` assigned to someone else.

### Plan
1. Repro on production with Mabel's account. Participant 1 provides it, or Y.L logs in. Also repro with a Staff account on a workflow task.
2. Read-only checks:
   ```sql
   select entity_id, data->>'role', data->>'customRoleId', data->'departments', data->>'hasLogin'
   from public.aitask_entities where entity_type='user' and data->>'name' ilike '%mabel%';
   select entity_id, data->>'projectName' from public.aitask_entities
   where entity_type='project' and data->'hodMemberIds' ? '<mabel-user-id>';
   select entity_id, data->>'title', data->>'status', data->>'assignmentState', data->>'assignedTo', data->>'department'
   from public.aitask_entities where entity_type='task' and data->>'responsibleHodId' = '<mabel-user-id>'
     and data->>'status' not in ('Completed','Cancelled');
   ```
3. If it is data, fix it through the UI (project HODs, member department). If it is code, write the fix and a regression test in the existing `e2e/hod-*.spec.ts` / pgTAP suites.
4. With D1, "Send for review" routes to the PM. Verify the button is enabled for Staff on both workflow and non-workflow tasks.

---

## F. Progress stuck at 0%

### Findings on production
- ✓ The link rule is gone, so tasks can complete without a link.
- ✗ `DeliveryProgress` and `getMonthlyCycleCloseout` still count only **Delivered** deliverables ("Progress counts confirmed deliveries, not completed tasks"). Completing all tasks moves a deliverable only to **Ready**. Production added a one-step PM confirm, but until the PM confirms, progress shows 0%.

### Target (F1: same % for everyone)
- A deliverable counts as done when it is **Ready or Delivered**. "Delivered" stays as the "sent to client" confirmation and is shown as a secondary number.
- One formula used on Plan & delivery, Delivery tracker, Reports, PM Portfolio strip and the Client portal.
- Copy changes to "Progress counts completed work."

### Data
- Derived only.
- Reconcile stale stored statuses (all tasks done, but deliverable still Planned/In Progress). Run this read-only check first, then fix via the `deliverable.manage` command, not raw SQL:
  ```sql
  select d.entity_id, d.data->>'title', d.data->>'status' from public.aitask_entities d
  where d.entity_type='deliverable' and d.data->>'status' in ('Planned','In Progress')
    and exists (select 1 from public.aitask_entities t where t.entity_type='task' and t.data->>'deliverableId'=d.entity_id)
    and not exists (select 1 from public.aitask_entities t where t.entity_type='task' and t.data->>'deliverableId'=d.entity_id
      and data->>'status' not in ('Completed','Cancelled') and coalesce(t.data->>'isCompleted','false')<>'true');
  ```

---

## G. Yellow save banner

### Findings on production
- ✓ Auto-resend after a dropped connection, and "resolve routine save and sync failures before showing an error".
- ✗ `Layout.tsx` `syncNeedsAttention` still includes `backend.hasRemoteUpdate` and `pendingResolution`. The user's own realtime echo can arrive before the commit acknowledgement, so the amber "Retry my changes / Restore saved data" banner flashes during a normal save.

### Plan
1. Ignore `hasRemoteUpdate` while a local save is in flight or when it echoes the user's own mutation; pull silently.
2. Show the banner only after the automatic retry has also failed, with one plain message and one action.
3. Replace inline "Use Retry my changes in the workspace banner" copy in the create/edit modals and focus panels with "Saving…" → "Saved".
4. Keep the real banners: "Workspace update required" and "Shared workspace unavailable".

### Data
None.

---

## H. Activate / Publish, and corrections after publish

### Target
- On the merged page, one primary button in the month header:
  - Draft plan whose start is this month: **Activate & publish this month**, with one confirmation listing the services and tasks it will create.
  - Future start (e.g. December): **Activate** only. December's header shows **Publish** when that month is due. This keeps Y.L's safety confirmation without tab-hopping.
- **Correct published record** (R3): Boss and owning PM only, with a required reason and an audit entry.
  - Allowed: names (deliverable title, service item name/platforms), numbers (quantity, not below completed), dates (task start/due).
  - Prices: never; finance rules apply.

### Data
- R2: none.
- R3: new server command (e.g. `service_cycle.correct`) plus audit → **migration, Y.L approval**. Until then, Y.L corrects on request.

---

## 3. Order of work

**R1** (branch from `origin/codex/hod-workflow-regression-20261106`, no migration)
1. Record `20261106041228_optimize_pm_service_access` from the live DB into the repo (needed before R3 anyway).
2. F progress formula and copy.
3. G banner.
4. A PM home on Portfolio (move MetricStrip + StuckWorkPanel).
5. C project-level "+ Task", remove global entries, trim form.
6. D remove approval selectors, default to `pm`, drop HOD review queue for `pm` tasks.
7. E Mabel/Staff repro and data fixes.
8. Gate: `pnpm check && pnpm lint && pnpm test && pnpm build`, plus the role e2e specs.

**R2**
- B merged Plan & delivery page (incl. B1 removal, B2 notes, payments kept).
- H single Activate/Publish.
- A shared `getRoleWorkSummary`.

**R3** (approval and backup gate per `NEXT_AGENT_START_HERE.md` §7–8)
- D approval backfill → `pm`.
- H correction command.
- C optional legacy `projectId` backfill.

---

## 4. R1 status (2026-11-09, branch `codex/team-feedback-r1-20261109`)

Built from `origin/codex/hod-workflow-regression-20261106`. Committed on the branch; not pushed, no migrations applied.

| Item | Status |
|---|---|
| Live-only migration recorded | `supabase/migrations/20261106041228_optimize_pm_service_access.sql`, copied verbatim from `supabase_migrations.schema_migrations` |
| F progress | Done: `isDeliverableWorkDone` (Ready or Delivered) used by cycle progress, closeout %, client portal, delivery tracker, companies list, PM dashboard bar and pace. "Delivered" is shown as a secondary "confirmed" count for internal roles. Closing a cycle still requires Delivered (server rule unchanged). |
| G banner | Done: a background (silent) refresh that lands while the user's own save is in flight no longer marks a "conflict"; it keeps the local change and re-pulls after the save. The banner ignores `hasRemoteUpdate` while a local save is pending. Real failures still show the banner. |
| A PM home | Done: PM nav/mobile drop Dashboard; "Portfolio" (`/tasks`) is the landing page and `/` redirects there. The full PM overview (summary, review queues, stuck work, plans at risk, renewals, project health) renders on top of Portfolio. The PM tutorial now starts on Portfolio and points task creation at Companies. |
| C task entry | Done: "+ Task" on each project in Companies (company and project locked in the form; HOD only on projects where they are HOD). Global "New task" (header buttons, sidebar, command palette, `N` shortcut, calendar day click, delivery tracker) kept for Boss Koo only. Milestone shows only when the project has milestones. |
| D approval | Done (UI): approval dropdowns removed from the project form, task form and Review responsibility. New tasks are saved with `approvalMode: 'pm'`; saving a project sets `defaultApprovalMode: 'pm'`. R3 backfill still pending. Live check: Mabel's 10 pending tasks are already `pm`. |
| E Mabel | Data checked (read-only): Mabel is HOD, has a login, departments Video Shooting + Video Editor, HOD on 27/43 projects, 3 Staff in her departments, 10 tasks `pending_hod` assigned to her (7 already In Progress, 3 Completed with a stale `pending_hod`). No data fault found, and In Progress is not assignment-locked in code. **Needs a live repro on her account.** |
| Gate | `pnpm check`, `pnpm lint`, `pnpm test` (1052 passing), `pnpm build`: green. Playwright (one worker): specs updated for Portfolio home, Done label, project-scoped task entry and Staff not creating tasks; calm-ui and staff-workspace-v2 screenshots regenerated. Also fixed specs that were already failing on the live line (recovery copy, Sunday calendar, department-filtered assignees, draft-plan copy). **Still failing, pre-existing:** `client-service-workspace.spec.ts:127`: an Operation Staff user with `createTasks` cannot create a task from a cycle (company is not prefilled). Fails the same way on the live line; under decision C1 the intended behaviour needs a call. |
