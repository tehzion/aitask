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
| Gate | `pnpm check`, `pnpm lint`, `pnpm test` (1052 passing), `pnpm build`: green. Playwright (one worker): specs updated for Portfolio home, Done label, project-scoped task entry and Staff not creating tasks; calm-ui and staff-workspace-v2 screenshots regenerated. Also fixed specs that were already failing on the live line (recovery copy, Sunday calendar, department-filtered assignees, draft-plan copy). Staff never write tasks by hand (`canCreateManualTasks`): the cycle "+ Task" button is hidden for them and the store refuses; service workflows still generate tasks. The server already refuses this: `aitask_has_permission` returns false for Staff `createTasks` (live since `hod_department_delegation_disable_staff_creation`), so no R3 work is needed. |

## 5. R2 status (2026-11-09, same branch)

Front end only; no migration.

| Item | Status |
|---|---|
| B merged page | Done: the client workspace has two tabs, **Plan & delivery** and **Activity / Files**. Old links (`?tab=overview|plan|cycles|addons`, `#cycle-…`) open Plan & delivery with the month selected. Order on the tab: delivery summary (one %, review panel) + special notes → monthly schedule (rendered once) → selected month (deliverables, tasks, closeout, Publish) → plan & amounts → service add-ons → next month's plan editor. The % appears once; the month block keeps open/overdue/waiting/delivered counts. |
| B1 | Done: "Extra requests this month" block, "Log extra request" button, and the extras count / "Suggest a larger plan" chip in renewal signals are removed. One-off add-ons are unchanged and still bill. |
| B2 | Done: **Special notes** card (`ClientProfile.notes`) for internal roles; editable by anyone who can edit the client profile. Verified on the live DB (read-only): Client users cannot read `client` rows (RLS), and `private.aitask_client_profile_projection` is an allow-list without `notes`. |
| H UI | Done: one header action. A draft plan starting this month or earlier shows **Activate & publish this month** (confirmation lists the services and workflow-task count; activates, then publishes that month). A later start shows **Activate plan** only; that month's block shows **Publish** when due. Corrections after publish remain R3. |
| A shared work summary | Not started (kept for a later pass). |
| Gate | `pnpm check`, `pnpm lint`, `pnpm test`, `verify:i18n`, `pnpm build` green. New `e2e/plan-and-delivery.spec.ts` (activate & publish, activate only, special notes, no extras). Client-workspace specs updated for the two tabs. |

---

## 6. Deep plan: features and Supabase (2026-11-09)

This section uses read-only checks run on the live DB (`ohjhwyiffgzyatcmmdql`) on 9 Nov 2026. Nothing has been written to the DB.

### 6.1 What the live data says

| # | Finding (live, read-only) | Effect the team sees | Fix type |
|---|---|---|---|
| L1 | 30 of 43 projects have `defaultApprovalMode = 'none'`; 13 have `pm`. The server refuses `Waiting Approval` when the effective mode is `none`. 1 open task resolves to `none` today. | "Staff can't Send for review" on those projects | R3 backfill (S1) |
| L2 | 49 of 57 deliverables in Published cycles are `Planned` with **no linked task**. Only 34 of 53 tasks carry a `deliverableId`. 0 tasks came from workflow generation. | Progress stays at 0% even with the R1 formula, because no task moves the deliverable | Front end (F2) + R3 link backfill (S3) |
| L3 | 18 Draft cycles have ended without being published. 9 Published cycles have ended without being completed. 2 deliverables are `Ready` inside Draft cycles. | Old months clutter the schedule; closeout and renewal numbers are wrong | Front end (F3) + R3 reconcile (S4) |
| L4 | All 10 `pending_hod` tasks are assigned to Mabel herself (6 In Progress, 1 Waiting Approval, 3 Completed). Her projects have `staffMemberIds: []`. There are no Staff in Video Shooting. | "HOD can't assign": there is no one to assign shooting work to. 3 tasks have a stale state | Data/people (S5) + R3 reconcile (S2) |
| L5 | 16 projects have no HOD. | HOD "+ Task" and HOD assignment are unavailable there; the PM fallback applies | People/UI (S5) |
| L6 | Staff `createTasks` is refused by the server already. | none | Doc corrected in §4 |
| L7 | `ClientProfile.notes` cannot reach Client users (RLS plus the allow-list projection). | none: B2 is safe | none |
| L8 | Migration drift: every live migration has a matching file in `supabase/migrations` by name. 58 of them have a different version stamp in the repo, because they were applied through the MCP tool, which stamps its own time. Content matches by name. Repo: 142 files. | `supabase db push` from the repo would try to re-run those 58 | S0 |

### 6.2 Front end (no migration)

**F2. Link tasks to the month they deliver (fixes L2 for new work)**
- When "+ Task" is opened from a project whose client has a current Published cycle, pre-fill `serviceCycleId` and offer a "Counts toward" picker of that month's deliverables (default: the first unlinked deliverable whose service name matches the task title; else none).
- Cycle block: for each `Planned` deliverable with no tasks, show **Generate tasks** (workflow services) or **Link a task** (opens a picker of the project's open tasks with no `deliverableId`). Both go through `deliverable.manage` / the existing task save, which the server already validates.
- Task drawer: show "Counts toward: <deliverable>" with a change link for PM/Boss.
- Tests: unit test for the match rule; e2e "task added from project lands in this month's progress".

**F3. Month housekeeping (fixes L3 going forward)**
- In the monthly schedule, mark ended Draft months as "Never published" with two PM actions: **Publish late** or **Cancel month** (both existing `service_cycle.manage` transitions).
- Mark ended Published months as "Ready to close" when every deliverable is done, and show **Close month**; otherwise "Overdue: n not done".
- PM Portfolio "Plans at risk" counts these, so they are visible without opening each client.

**F4. HOD assignment clarity (L4/L5)**
- When an HOD opens Assign and no Staff in the task's department are members of the project, show "No Staff in Video Shooting on this project. Ask the PM to add one, or do it yourself" with a **Keep it myself** action (sets `assigned_staff` to the HOD, which the server allows for an HOD actor).
- Only send fields that changed in an HOD assignment patch; never resend `approvalMode` or other restricted fields (the HOD patch validator rejects any change to them).
- On projects without an HOD, hide HOD wording and show "PM assigns directly".

**F5. Shared `getRoleWorkSummary` (R2 leftover)**
- One selector for open / overdue / waiting review / done counts per role, used by Portfolio, HOD and Staff homes, and reports. Unit-tested against fixture tasks.

**F6. Corrections after publish (UI half of H)**
- "Correct" link on published deliverables and service items for Boss and owning PM; a sheet with reason (required), allowed fields only. Disabled until S6 is live; until then it says "Ask Y.L".

### 6.3 Supabase (R3: Y.L approval, backup gate, one migration per item)

Every item below follows the same gate:
1. A backup/PITR point is confirmed and noted (`NEXT_AGENT_START_HERE.md` §7–8).
2. Run the sizing query and save the result.
3. Apply on a Supabase branch first, run the pgTAP suite and the role e2e specs against it.
4. Y.L approves, then apply to production through a migration file committed first (same version stamp in repo and live).
5. Run the verification query. Keep the rollback snapshot table for 30 days.

Backfills write a snapshot first so they can be undone:
```sql
create table if not exists private.r3_backfill_snapshot (
  batch text, entity_type text, entity_id text, data jsonb, taken_at timestamptz default now(),
  primary key (batch, entity_type, entity_id));
```
Writes run inside the migration as the owner, with `set local aitask.audit_reason = '<batch>'` so the existing audit triggers record them; they do not bypass the guard triggers.

**S0. Fix the migration ledger (no schema change)**
- Rename the 58 repo files to the live version stamps (git mv only), so repo and live agree. Script: match by name from `supabase_migrations.schema_migrations`.
- Verify: `comm` of repo versions vs live versions is empty both ways.
- From now on, write the file first, then apply with that version.

**S1. Approval → PM (L1, decision D1)**
- Size:
  ```sql
  select data->>'defaultApprovalMode', count(*) from public.aitask_entities where entity_type='project' group by 1;
  select coalesce(data->>'approvalMode','(unset)'), data->>'status', count(*) from public.aitask_entities
  where entity_type='task' and data->>'status' not in ('Completed','Cancelled') group by 1,2;
  ```
- Change: snapshot, then
  - projects: `defaultApprovalMode` → `'pm'` where not `pm`;
  - open tasks with mode `none`, `hod`, missing, or `inherit`: set `approvalMode` → `'pm'`, **except** tasks in `Waiting Approval` (left as they are).
- Verify: no open task resolves to `none` (`private` effective-mode function over all open tasks returns 0 rows for `none`).
- Rollback: restore `data` from the snapshot for batch `s1`.

**S2. Stale assignment state (L4)**
- Completed/Cancelled tasks with `assignmentState = 'pending_hod'` → `assigned_staff` (state only; assignee unchanged). Today: 3 rows.
- Verify: `count(*) = 0` for closed tasks still `pending_hod`.

**S3. Task ↔ deliverable links (L2)**
- Size: per Published/Completed cycle, deliverables with no tasks, and tasks in that client's projects with no `deliverableId` whose due date falls in the cycle period.
- Change only exact matches: one unlinked task and one unlinked deliverable in the same cycle with the same service name. Everything else goes on a list for the PM to link in F2's picker.
- After linking, run the existing deliverable status derivation so a deliverable whose tasks are all done becomes `Ready`.
- Verify: re-run the §F reconcile query; expect 0 rows.

**S4. Cycle reconcile (L3)**
- Not automatic. Produce the list (client, month, status, done/total) and let each PM choose Publish late / Cancel / Close in F3. Only cycles the PM marks are changed, through `service_cycle.manage`.
- The 2 `Ready` deliverables in Draft cycles are flagged on the same list.
- Optional later: a nightly job that only **flags** ended months (no status change).

**S5. People and coverage (L4, L5): data, not migration**
- Y.L/PMs add a Staff member to Video Shooting, or confirm Mabel shoots herself.
- Add the right Staff to `staffMemberIds` on Mabel's projects.
- Assign an HOD on the 16 projects without one, or confirm "PM assigns directly" for them.
- Then repro on Mabel's account: assign one task to a Staff, and Staff sends it for review. Record the result here.

**S6. Correction command (H)**
- New `service_cycle.correct` command: Boss or owning PM; required reason; allowed fields only (deliverable title, service item name/platforms, quantity not below done count, task start/due); never prices.
- Writes an audit row with old and new values (uses `audit_value_history`).
- pgTAP: PM of another portfolio refused; price change refused; quantity below done refused; reason required.

**S7. Legacy `projectId` (C, optional)**
- Tasks without `projectId` where the client has exactly one active project → set it. Others are listed for manual fixing.

### 6.4 Order

| Step | What | Needs |
|---|---|---|
| 1 | Commit R2 (this branch) | suite green |
| 2 | F2 link-on-create + Link/Generate, F4 HOD assign clarity | front end only |
| 3 | S0 ledger rename | repo only |
| 4 | S5 people fixes + Mabel repro | Y.L / PMs |
| 5 | S1 approval backfill, S2 stale state | Y.L approval, backup |
| 6 | S3 link backfill, then F3 + S4 PM reconcile | Y.L approval, PM time |
| 7 | F5 shared summary | front end only |
| 8 | S6 + F6 corrections, S7 legacy projectId | Y.L approval |

S1 is the only item that changes what Staff can do today, so it goes first among the migrations.

---

## 7. Overall user experience plan (2026-11-09)

This builds on R1, R2 and §6. The live data shows the same root problem across most complaints: **the app asks people to do steps they cannot see the reason for** (approval mode, linking tasks to deliverables, publishing months, assigning without anyone to assign to). The plan below makes each role's next step obvious and removes the steps the system can do itself.

### 7.1 Principles
1. **One home, one next step.** Every role lands on a page that answers "what do I do now?" at the top, with one primary button per item.
2. **The system does the bookkeeping.** Links, approval routing, month status and progress are set automatically. People only confirm.
3. **Explain a blocked button.** A disabled action always says why, and names who can unblock it.
4. **Saving is invisible when it works.** No yellow banner on normal saves; "Saved" is the only feedback.
5. **Same numbers everywhere.** One % and one set of counts per role (F1, F5).
6. **English and 中文 together.** Every new string ships with zh, checked by `verify:i18n`.

### 7.2 By role

**Boss (Koo)**
| Pain today | Enhancement | How we know it worked |
|---|---|---|
| Has to open each client to see what's wrong | Weekly "Company health" card on the dashboard: months overdue, months never published, clients with no HOD, approvals waiting > 2 days. Each line opens the filtered list | Boss opens fewer client pages per week |
| Corrections after publish go through Y.L | F6/S6 Correct sheet with reason and audit | Correction requests to Y.L drop to zero |
| Hard to spot people bottlenecks | Workload by person (open, overdue, waiting review), from F5's shared summary | Overloaded people visible in one view |

**PM**
| Pain today | Enhancement | How we know it worked |
|---|---|---|
| Progress shows 0% because tasks aren't linked (L2) | F2: task created from a project auto-links to this month; "Link a task" / "Generate tasks" on empty deliverables | Share of linked tasks goes from 34/53 to > 90% |
| Old months pile up as Draft/Published (L3) | F3: "Never published" and "Ready to close" chips with one action each; Portfolio "Plans at risk" counts them | Ended unpublished months: 18 → 0 |
| Review queue mixes HOD and PM work | With D1 everything routes to the PM: one "Waiting for you" list on Portfolio, sorted by wait time, approve/return inline | Median wait in Waiting Approval falls |
| Activate and Publish in different places | Done in R2 (one confirmed action) | — |
| Client context scattered | Done in R2 (Special notes); next: pin the notes in the task drawer for tasks of that client | Fewer "what does the client prefer?" questions |
| Creating a task needs too many fields | Keep the R1 trimmed form; add "Duplicate last month's task" from a month block | Time to add a month's tasks drops |

**HOD (e.g. Mabel)**
| Pain today | Enhancement | How we know it worked |
|---|---|---|
| "Can't assign": no Staff on the project/department (L4) | F4 message naming the gap plus **Keep it myself**; PM is notified of the gap once | No more `pending_hod` tasks older than 2 days |
| 16 projects without an HOD (L5) | "PM assigns directly" wording there; Boss health card lists them | HOD gaps listed and closed |
| Mixed personal and team work | Home split: "My tasks" and "To assign" tabs with counts (uses F5) | — |

**Staff**
| Pain today | Enhancement | How we know it worked |
|---|---|---|
| "Send for review" refused on `none` projects (L1) | S1 backfill; until then, the button shows "This project has no reviewer. Ask your PM" instead of failing on save | Zero refused submissions in logs |
| Not sure what's expected | Task drawer top block: due date, "Counts toward <deliverable>", client special notes (internal), and the one next action | Fewer returned-for-changes tasks |
| Output upload felt required | Output is optional (E1); keep a gentle "Add a link or file (optional)" | — |
| Can't create tasks (by decision) | Make it explicit: empty states say "Your PM or HOD adds tasks here" rather than hiding things silently | No confusion reports |

**Client (portal)**
| Pain today | Enhancement | How we know it worked |
|---|---|---|
| Sees 0% while work is in progress | F1 formula (done) plus S3 link backfill so the % moves | Client progress matches internal |
| Doesn't know what's coming | "This month" list of deliverables with status words (Planned / In progress / Ready / Delivered) and dates; nothing internal | Fewer status-check messages |
| Reviews arrive without context | Review email/portal item shows deliverable name, month, and what to check | Faster client approvals |

### 7.3 Across the app
- **Save trust (G, continued).** Track how often the banner shows (client log event). Target: shows only after the automatic retry fails. Replace remaining "Use Retry my changes" copy.
- **Notifications.** One digest per day per person (overdue, waiting for you, assigned to you) instead of one per event; real-time only for "assigned to you" and "returned to you". Settings toggle per person.
- **Blocked-action explanations.** Shared `<WhyDisabled>` helper: every disabled primary action gets a reason line and the name of who can unblock. Audit all `disabled=` on primary buttons.
- **Empty states.** Every list says what fills it and who does it ("Tasks appear here when your PM publishes the month").
- **Mobile.** HOD and Staff homes, task drawer and review actions at 375px: no horizontal scroll, 44px targets, sticky primary action. Add to the existing mobile e2e projects.
- **Search.** Command palette searches clients, projects and tasks for every role (create stays Boss-only).
- **Onboarding refresh.** Update the role tutorials (`src/lib/onboarding.ts`) for R2: Plan & delivery tab, Activate & publish, Special notes, Link a task. Show a one-time "What changed" release notice per role (existing `aitask:release-notice` mechanism).
- **Help.** Short per-role "How work flows" page in `/help`: PM → HOD → Staff → PM review → Client, with the D1 rule in one sentence.
- **Accessibility.** Keep the axe checks green on new screens; heading order and region labels on every new card.

### 7.4 Measuring
Read-only queries, run weekly and saved in this doc:
```sql
-- linked tasks share
select count(*) filter (where data->>'deliverableId' is not null)::float / nullif(count(*),0)
from public.aitask_entities where entity_type='task' and data->>'status' <> 'Cancelled';
-- ended months not published / not closed
select data->>'status', count(*) from public.aitask_entities
where entity_type='service_cycle' and (data->>'periodEnd')::date < current_date
  and data->>'status' in ('Draft','Published') group by 1;
-- old pending_hod
select count(*) from public.aitask_entities where entity_type='task'
  and data->>'assignmentState'='pending_hod' and data->>'status' not in ('Completed','Cancelled')
  and (data->>'updatedAt')::timestamptz < now() - interval '2 days';
```
Plus the in-app Feedback page: one question after each release ("Was today's work easier? 1–5 + comment"), read in Feedback Results.

### 7.5 Phasing
| Phase | Contents | Migration? |
|---|---|---|
| U1 (with R2 commit) | Onboarding refresh, release notice, empty states, Staff "no reviewer" message | No |
| U2 | F2 linking, F4 HOD clarity, `<WhyDisabled>`, task drawer top block, PM "Waiting for you" list | No |
| U3 | S1/S2 backfills, S3 links, F3 + S4 month housekeeping, Boss health card | Yes (R3 gate) |
| U4 | F5 shared summary, workload view, notification digest, client "This month" list, mobile pass | Digest needs a server job (approval) |
| U5 | S6/F6 corrections, search for all roles, Help flow page | S6 yes |

Before each phase ships: a 15-minute walkthrough with one person per role on the preview build, then the weekly queries above as the before/after record.

## 8. F2 and F4 status (2026-11-09, same branch)

Front end only; no migration.

| Item | Status |
|---|---|
| F2 link on create | Done: when a PM or Boss adds a task from a project and the client has a Published month covering today, the form shows **Counts toward** (optional). It suggests the first deliverable with no tasks whose name shares a word with the title; "Not part of this month's plan" leaves it unlinked. Delivered and workflow-generated deliverables are not offered. Store and server link rules are unchanged (`deliverableLinkError`). |
| F2 link existing | Done: each open, non-workflow deliverable in the month block has a **Link a task** picker listing the client's open, unlinked, hand-made tasks the user may link (earliest due first). Uses `linkTaskToDeliverable` and saves as `task.update`. "Generate tasks" for workflow services was already there. |
| F2 task drawer "Counts toward" | Done: task details show **Counts toward** with the deliverable and its month for internal viewers of client tasks, or "Not part of a month's plan" when unlinked (`getTaskDeliverable`). Clients do not see it. Read-only; linking stays on the month block. |
| F4 HOD wording | Done: a `pending_hod` task that the HOD has started (or finished) is labelled **Handled by HOD** instead of "Pending HOD Assignment", and no longer counts in the HOD "to assign" queue or as an overdue assignment. Shared helpers in `taskWorkflowAccess.ts`: `isHandledByHod`, `isAwaitingHodAssignment`, `getAssignmentStateLabel`. |
| F4 no Staff | Done: the delegation box now says "No Staff in {department} yet. You can do this task yourself, or ask your project manager to add Staff to this department." A separate "Keep it myself" action is not needed: a `pending_hod` task assigned to the HOD already lets the HOD work it, and the new label shows that. |
| F4 HOD patch fields | Checked, no change: the HOD validator compares old and new restricted fields, and the assignment path does not change them. |
| F4 projects without HOD | Done: on a project with no HOD members, a task with no responsible HOD shows **PM assigns directly** instead of "Awaiting HOD" (`projectHasNoHod`, `getAssignmentStateLabel(task, project)`). The project form says "No HOD on this project: the PM assigns tasks directly." Projects with a missing `hodMemberIds` count as having no HOD. |
| Tests | `src/lib/teamFeedbackLinking.test.ts` (10 unit tests). `e2e/plan-and-delivery.spec.ts` adds: task from project counts toward the matching deliverable (and task details show it); an unlinked task is linked from the month block. |

## 9. R3 and remaining front end (2026-11-09, same branch)

Approved by Y.L in chat on 9 Nov 2026 ("proceed with all after this, I approve").

### Backup gate as run
- Platform backup/PITR could not be confirmed from the tools available; instead, before any live write, full copies were taken inside the live DB: `private.r3_backup_20261109_entities` (1256 rows, data checksum matches live at copy time), `private.r3_backup_20261109_members` (12) and `private.r3_backup_20261109_workspaces` (1). Not readable by `anon`/`authenticated`. Drop after 30 days.
- Each migration was first run on a local Supabase stack (all 142 live migrations replayed in live order), then the full pgTAP suite: 88 files, 1240 tests, PASS.

| Item | Result |
|---|---|
| S0 ledger | Done (`99b86ae`). 58 repo files renamed to the live version stamps; repo and live lists are identical (142/142). Historical docs and release manifests still quote the old names as written records. |
| S1 approval → PM | Done on live as `20261109141920_r3_s1_project_approval_pm`. 30 projects `none` → `pm`; all 43 are `pm`. No open task resolves to `none` (was 1, an `inherit` task). No task needed its own mode changed (all open tasks were already `pm` or `inherit`). Waiting Approval and closed tasks untouched. 30 rows in `private.r3_backfill_snapshot` (batch `s1_project_approval_pm`); rollback SQL is in the migration header. |
| S2 stale state | Skipped on purpose. The 3 closed `pending_hod` tasks are assigned to the HOD herself; F4 already labels them "Handled by HOD" and keeps them out of queues. Setting `assigned_staff` on an HOD assignee would be a false state. |
| S3 link backfill | No automatic change. 0 exact matches: deliverable service names ("RM2250 package", "SHORT VIDEO PLANS", …) never equal a task's service type ("Video", "Design"), and most months have more candidate tasks than deliverables. 78 unlinked deliverables / 19 unlinked tasks; PMs link them with F2's **Link a task** picker. |
| S4 month reconcile | No automatic change (as planned). Live list on 9 Nov: 18 ended months never published (Agree sports, AL Industrial ×2, CICI ×2, Dr Cermin, Hunter Asia Pacific, JL Assets ×2, Lumea ×2, MeTalk ×2, Our Stay ×2, Seven Beauty, The Nail Studio, UMMA) and 9 ended published months with nothing delivered (35 Hair Lab, Agree sports, Coat Master, Dr Ang Clinic, Hunter Asia Pacific, ICAUR Li Koon, Le Motor, Perfect 71, Xin Fo Yuan 76). PMs act on them with F3. |
| S5 people | Not code. Still needed: Staff for Video Shooting / Mabel's projects, HOD on 16 projects (or accept "PM assigns directly"), then Mabel repro. |
| S6 correction command | No migration needed. The server already lets the Boss or the client's PM rename a deliverable in a published month through `deliverable.manage`, keeps entity history, and refuses other PMs and Staff. Pinned by `supabase/tests/database/published_deliverable_correction.test.sql` (6 tests). Quantity and price changes stay with Y.L (they change billing). |
| S7 legacy projectId | Nothing to do: 0 live tasks without `projectId`. |
| F3 month housekeeping | Done. Plan History shows **Never published** (Publish late / Cancel month), **Ready to close** (Close month), **Overdue: n not done**, Closed, Cancelled (`src/lib/monthHousekeeping.ts`). PM/Boss company strip shows **Months to tidy up**. |
| F5 shared summary | Done. `getRoleWorkSummary` (open, overdue, due today, waiting review, done) drives the role dashboard counts; the unused Boss-briefing overdue/waiting counts (a different definition) were removed. |
| F6 corrections UI | Done. **Correct name** on deliverables of Published/Completed months for the Boss and the client's PM; new name and a required reason; the reason is saved as an internal note on the month ("Name corrected from … to …. Reason: …"). |
| Tests | Unit: `monthHousekeeping.test.ts` (5), `roleWorkSummary.test.ts` (3). e2e `plan-and-delivery.spec.ts`: cancel a never-published month; correct a name with a reason. pgTAP: published deliverable correction (6). |
| Known flaky | `app-smoke` calendar drag-and-drop step ("Dates saved." after drag) fails about 1 run in 3; calendar code is untouched on this branch. |

### Save speed and retry check against a real Supabase (9 Nov)
Run on a local Supabase stack with all live migrations, realtime on, and real signed-in PM and Staff users (not the in-browser test backend).

| Action | Time to saved | Result |
|---|---|---|
| Link a task to a deliverable | 0.4 s | saved |
| Create a task that counts toward a month | 1.8 s | saved |
| Correct a deliverable name (+ internal reason note) | 1.4 s | saved |
| Cancel a never-published month | 0.14 s | saved |
| Publish a month late | 0.16 s | saved |
| Staff Start work | 0.2 s | saved |
| Staff Send for review (PM review project) | 0.2–1.1 s | saved, goes to PM review |

- A save whose server response is lost is retried with the same command id: "Changes saved.", no duplicate.
- If the reason note cannot be sent (connection dropped), the rename is kept, the form shows "Saving…" and the note saves on its own about 2 s after the connection returns.
- Fixed on the way: success toasts sat over dialog footers and blocked the next click for ~4.5 s (Send for review took 4.8 s). Toasts now let clicks pass through except on their close button.
- Fixed on the way: **Correct name** crashed the month view for deliverables saved without a title; a missing title now reads as empty.

## 10. Click reduction (2026-11-10, branch `codex/click-savers-20261110`, stacked on PR #16)

| # | Item | Result |
|---|---|---|
| 1 | Act from the list | Done. Task rows show the next action as a button (Start work, Send for review, Approve, Confirm completion) when the drawer's own checks all pass: guided action and status control, workflow gate, no unfinished predecessors, edit access, no pending save (`useQuickTaskAction`). Anything needing a choice or a note (Return, predecessor confirmation, output upload, HOD assignment) still opens the drawer. Real Supabase: Start work 0.4 s, Send for review 0.13 s, no drawer opened. |
| 2 | Bulk month decisions | Done. Dashboard "Months to tidy up" panel (Boss Portfolio tab, PM Portfolio home) lists every ended month across companies; select several and Publish late / Cancel (confirmed: cancelled months cannot be reopened) / Close. Each month is its own command, so one refusal does not undo the others. Overdue months link to their company. Bulk task assignment is not built yet. |
| 3 | One-click linking | Done. The month block suggests the task that clearly fits (due in the month, shared words with the deliverable or service) as a single **Link: …** button; the dropdown lists best matches first. |
| 4 | Generate the month's tasks | Already existed ("Generate all task chains" / per-deliverable Generate). Copying last month's ad-hoc tasks is not built. |
| 5 | Create task defaults | Done. Remembers each person's last department, and the last assignee on the same project while they can still be assigned; work counted toward a month defaults its due date to the month's last day (never a past date). |
| 6 | Notifications open on the action | Already worked: task notifications open `/tasks?taskId=…`, the task drawer with its action in view. |
| 7 | Daily digest | Not started: needs a scheduled server job and Y.L's approval. |

Tests: `src/lib/clickReduction.test.ts` (7), `e2e/click-reduction.spec.ts` (4).
