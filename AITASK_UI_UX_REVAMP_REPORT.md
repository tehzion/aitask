# AiTask UI/UX Revamp Report

**Date:** 2026-10-27
**Base:** `f39c335` (`fix: require task ownership before work starts`), the latest commit. It contains the live production commit `8eeba61` recorded in `docs/final-go-live-audit-2026-10-25.md`.
**Branch:** `claude/magical-fermat-ew80tq`
**Scope:** UI, copy, display filtering, and test fixtures only. No database migration, schema, RLS, RPC, task status, approval rule, or production data was changed. Nothing was deployed.

---

## 1. Executive summary

**Current UI quality (before).** The visual system (calm tokens, Geist, restrained red accent) was sound. The problems were information architecture and repetition:

- Three role pages shared a title with another page: PM `/` and `/tasks` were both "Portfolio work"; HOD `/` and `/tasks` were both "Department work". Staff `/tasks` was titled "Action Centre" while its navigation item said "All work". Client `/clients` said "Delivery tracker" while its navigation said "Deliveries".
- The Super Admin overview repeated the same numbers up to three times:
  - Overdue tasks appeared in a briefing tile, in the Management overview and as "Overdue production".
  - Pending approvals and renewals appeared twice each.
  - The two "Renewals in 30 days" figures used *different definitions* (contract end vs next monthly cycle) under the same label.
  - The "Promo Video Campaign" risk was listed in both "Projects needing attention" and "Needs my attention".
  - "Shared employee capacity" repeated the Team workload tab.
- The PM dashboard listed **every** submitted task as "Awaiting internal review", including work waiting for the department HOD. The same review items appeared again in "Needs my attention". Six queues were always shown, three of them usually empty.
- Completed and cancelled tasks stayed in the default task lists: the Super Admin Tasks table, the Staff/HOD/PM "All" queue, and the Project Workspace task tab. My work fell back to the "Done" tab when nothing was active.
- Every metric card carried its own decorative icon. The Help centre used AI "sparkles" for an ordinary guided walkthrough.

**Improvements completed.**

1. Every page now answers one question, and every heading matches its navigation label (section 2).
2. Completed tasks leave active views by default and stay one click away as history. Display filtering only; no record is changed (section 5).
3. Review queues show only decisions the signed-in user can actually take, using the existing permission functions (section 6).
4. Dashboards were restructured per role and duplicate sections removed or moved to the page that owns them (sections 3–4).
5. Decorative icons were removed from metrics. One shared, accessible metric strip is used everywhere. A pre-existing page-title collapse at tablet widths was fixed (section 7).
6. All new copy has Simplified Chinese translations, guarded by a unit test (section 8).

**Remaining limitations.** See section 11. In short: production readiness is still governed by the **NO-GO** in the final go-live audit (database migration alignment, hosted verification). This UI work does not change that.

---

## 2. Page responsibility matrix

Routes and labels are taken from `src/App.tsx`, `src/lib/navigation.ts` and `src/lib/access.ts`. There is no separate `/portfolio` route. "Portfolio" is the PM's `/tasks` list ("Portfolio work"), the Super Admin's new **Portfolio** dashboard tab, and the Companies page (`/projects`). The "Project Workspace" is the company workspace `/clients/:clientId` plus the project management panel opened from Companies.

| Page (route) | Question it answers | Target user | Main information | Main action |
| --- | --- | --- | --- | --- |
| Dashboard `/` (Super Admin, "Agency operations") – **Overview** tab | What needs a decision today? | Super Admin | 6 headline numbers, Needs my attention, delivery records needing review, recent activity | Open the flagged item |
| Dashboard `/` – **Portfolio** tab (new) | How are projects, owners and companies doing? | Super Admin | Projects needing attention, PM overview, company operations and monthly deliverables, client & project monitor, contract renewals | Open a project or company |
| Dashboard `/` – Agency pulse / Team workload | How is the agency performing / who is loaded? | Super Admin | Pulse metrics and analytics charts / shared capacity and team workload | Rebalance work |
| Dashboard `/` (PM, "Dashboard") | What needs my attention today? | Project Manager | 4 numbers, Requires your action, delivery/renewal risks, Waiting on others, Your projects | Review, finalize, chase |
| Portfolio work `/tasks` (PM) | What work is in my projects? | Project Manager | Active task queue ordered by risk; Done for history | Open and manage a task |
| Department work `/` (HOD) | What does my department need from me? | HOD | Overview row, focus task, department queue, department context, workload | Delegate, review |
| Department tasks `/tasks` (HOD) | Which department tasks exist and where are they? | HOD | Active / Needs action / Up next / Waiting / Done | Filter and open tasks |
| My work `/` (Staff) | What should I do next? | Staff | Overview row, focus task, assigned queue | Start, submit, complete |
| All work `/tasks` (Staff) | What are all my tasks? | Staff | Active queue; Done for history | Open a task |
| Tasks `/tasks` (Super Admin) | Which tasks are active across the agency? | Super Admin | Table/board with Active / Completed / All tasks scope | Edit, assign, review |
| Delivery tracker `/clients` (internal) / Deliveries (Client) | How is delivery progressing per client? / What has been delivered to me? | Internal roles / Client | Period-based client work and deliverables | Open client work / review a delivery |
| Companies `/projects` | Which companies and projects exist? | Management | Company directory, projects, contacts | Open a company workspace |
| Company workspace `/clients/:id` and project panel | What is happening in this company/project? | Authorized members | Plan, cycles, add-ons, files; project overview, tasks, team, milestones | Manage the plan or project |
| Reports `/reports` | What happened over time? | Authorized roles | Trends and historical results (all tasks, including completed) | Review outcomes |

---

## 3. Dashboard vs Portfolio — duplication register

| Component | Locations before | Problem | Now | Action |
| --- | --- | --- | --- | --- |
| Overdue tasks count | SA briefing tile; Management overview metric; "Overdue production" stat | Same number 3× on one screen | One metric in "Company at a glance" | Removed tile and "Overdue production" |
| Pending approvals / Waiting approval | SA briefing tile; Management overview | Same number 2× | One metric | Removed tile |
| Renewals in 30 days | SA briefing tile (contract end); Management overview (next monthly cycle) | Same label, **different definitions** and values | "Monthly renewals in 30 days" metric (Overview); "Contract renewals" list (Portfolio tab) | Relabelled; definitions unchanged |
| Project risk | "Projects needing attention"; "Needs my attention" | Same project listed twice on one tab | Attention list on Overview; project list on Portfolio tab | Split across tabs |
| Shared employee capacity | SA Overview; Team workload tab | Same purpose twice | Team workload tab only | Moved |
| Monthly deliverables per company | SA Overview; PM dashboard; Delivery tracker | Full portfolio list on the daily dashboard | SA Portfolio tab; PM dashboard links to Delivery tracker | Moved / linked |
| Client & project monitor, Contract renewals list | SA Overview | Portfolio content on the attention page | SA Portfolio tab | Moved |
| Workspace analytics charts | Below every SA tab | Analytics on the attention page | SA Agency pulse tab | Moved |
| Delivery records need review | SA Overview *and* inside Company operations | Rendered from two places | SA Overview (actionable) only | De-duplicated |
| PM review items | "Needs my attention" and "Awaiting internal review" queue | Same tasks twice; includes HOD-lane work | "Requires your action" queues only; attention list keeps delivery/renewal risks | Split by purpose |
| PM empty queues (HOD assignment, Staff assignment, Client review) | Always shown | Three empty cards on most days | "Waiting on others", shown only when non-empty | Conditional |
| Staff/HOD "Help requested", "Active tasks" | Summary row; Action Centre panel; Department context | Same counts 2× | One linked overview row; HOD context shows Overdue instead | Consolidated |
| Action Centre panel on My work | Panel linking to `/tasks?queue=needs_action` | Repeated the queue counts | Overview row links straight to the queues | Removed |
| Unread updates / Check inbox link | My work panel and footer | Inbox already has a nav item and header badge | Navigation only | Removed |
| Recent workspace activity | Below every SA tab | Not attention content on other tabs | SA Overview only | Moved |

**Retained deliberately.** "Your projects" on the PM dashboard is a risk-sorted summary (top 6, linking to the full list). The detailed project view stays in the project panel and `/tasks?project=…`. The commercial summary is one line, kept for PMs with price visibility.

---

## 4. Role-specific dashboard changes

### Super Admin

- **Before:** One long Overview: demo banner, 3 tiles, an 8-card Management overview (each card with an icon), projects needing attention, PM overview, shared capacity, Needs my attention, Company operations with a spotlight card and 3 icon stats, monthly deliverables, delivery records, client & project monitor, contract renewals, then analytics and recent activity under every tab.
- **After:** Four tabs, each with one job:
  - **Overview:** "Company at a glance" (6 numbers, colour only when a number needs action), Needs my attention, Delivery records need review, Recent activity.
  - **Portfolio:** projects and owners, company operations and monthly deliverables, client & project monitor, contract renewals.
  - **Agency pulse:** pulse plus analytics charts.
  - **Team workload:** shared capacity plus team workload.
- **Benefit:** The first screen is a decision list, not a report. Each number appears once.

### Project Manager

- **Before:** Titled "Portfolio work", the same as `/tasks`. Needs my attention (risks plus *every* submission), then a spotlight card, 3 icon stats, 6 queues, Project health, Monthly deliverables, commercial summary and delivery records.
- **After:** Titled **Dashboard** ("What needs your attention today across your projects.").
  - 4 numbers: Open tasks · Overdue · Awaiting your review · Ready to finalize.
  - **Requires your action:** Awaiting your review · Ready to finalize · Due today/overdue.
  - **Needs my attention:** delivery and renewal risks only, hidden when empty.
  - **Waiting on others:** With department review / Awaiting HOD or Staff assignment / Client review (optional), only when non-empty.
  - **Your projects:** riskiest first, top 6, links to `/projects` and to the Delivery tracker for monthly deliverables.
  - Commercial summary and delivery records.
- **Fix in passing:** project rows previously linked to `/tasks?projectId=…`, which the PM's task view ignores, so they showed every task. They now use the `project` filter that view supports.

### HOD

- **Before:** "Department work" on both `/` and `/tasks`. Summary row, Action Centre panel and Department context repeated "Active tasks" and "Help requested". The copy said "use the Action Centre for department decisions".
- **After:** `/` stays **Department work** ("Assignments to delegate, team progress, and reviews waiting on you."). `/tasks` is **Department tasks**.
  - One linked overview row: Active tasks, Needs action, Help requested, Awaiting acceptance.
  - Department context shows Overdue, Waiting review, Blocked steps.
  - The upstream "Tasks Awaiting Staff Assignment" section and the department workload are retained.
- **Review scope:** a submitted task reaches the HOD's *Needs action* queue only when the existing guided action (`isStaffGuidedActionEnabled` → `getTaskStatusControls`) allows the HOD to approve it. PM-approval tasks sit under *Waiting* (verified in e2e).

### Staff

- **Before:** `/tasks` titled "Action Centre". My work showed duplicate counts. The queue opened on *Done* when nothing else was active.
- **After:** `/tasks` is **All work**, matching navigation. My work has one overview row and never opens on *Done*. Finished work stays under the *Done* tab. Staff see no approval controls; verified in e2e.

### Client

- The Client dashboard and portal were already distinct (`ClientPortalDashboard`, `ClientDeliveries`). The tracker heading now reads **Deliveries**, matching navigation, with a client-specific description. No internal review or management section is reachable; verified in e2e.

---

## 5. Completed task behaviour

A shared helper, `src/lib/taskListScope.ts`, defines a **display-only** scope:

| Scope | Shows | Rule |
| --- | --- | --- |
| Active work (default) | Pending, In Progress, Revision, Waiting Approval, **Approved** | `isTaskOpen` (not completed, not cancelled) |
| Completed | Completed (status *or* legacy `isCompleted`) | `isTaskCompleted` |
| All tasks | Everything, including Cancelled | — |

- **Approved is not treated as Completed.** Approved work stays active until the responsible PM confirms completion (unit-tested).
- An explicit status filter (for example *Completed*) or a direct task link (`?taskId=`) bypasses the default scope, so history and deep links keep working.
- **Where applied:**
  - Super Admin Tasks: quick chips Active work / Due today / Overdue / Waiting approval / Completed / All tasks; `?show=completed|all` persists across reload. Board columns for hidden statuses show a "Show" link.
  - PM/HOD/Staff `/tasks`: the first tab is now "Active work" (was "All", including Done), and *Done* holds finished work.
  - My work: never defaults to *Done*.
  - Project Workspace → Tasks tab: Active / Completed / All tasks with counts.
- **History preserved.** No record, status, comment, attachment, review decision, revision or activity entry is modified. The filter runs in memory on the visible task list (unit test asserts the records are unchanged).
- **Counts.** Dashboard counts already use `isTaskOpen` / `isTaskCompleted` / `isTaskOverdue`. Completing a task drops it from Overdue, Ready to finalize and active counts, and raises project progress. e2e checks Overdue 1 → 0 and project progress "1/6 → 2/6 tasks complete" after the PM confirms completion through the UI.
- **Reports** were not filtered. They continue to include completed work for historical analysis.

---

## 6. Approval workflow logic

No approval rule was added or changed. The UI now asks the *existing* rules who must act next.

- `getInternalReviewLane(task)` → `none | department | projectManager`, derived from `getEffectiveTaskApprovalMode`:
  - `none`: approval is off.
  - `pm`: the PM lane.
  - `hod`: the department lane when an active review cover or an independent HOD exists in the task's department, otherwise the PM fallback. This mirrors `getDepartmentReviewers`.
- `isAwaitingMyInternalReview(user, task)` requires all of:
  - status *Waiting Approval*;
  - `canApproveTaskInternally` is true (this includes the server-bound `reviewAccess` decision, independence from the submitter, and edit scope);
  - for a PM, the task is in the PM lane, or the PM is the active review cover.
  Role names alone never decide eligibility.
- `isReadyForMyCompletion(user, task)` covers *Approved* work, or a submitted task whose approval is off (`canCompleteWithoutInternalApproval`). It is shown only to the responsible PM (`canManageTaskReview`) or Super Admin, mirroring `taskTransitionError`'s completion rule.
- **PM override preserved.** A responsible PM may still approve department-lane work from the task (`canReviewTaskInternally` is unchanged). That work is listed under *Waiting on others → With department review* instead of being presented as the PM's own queue.
- **Optional approval.** Tasks with approval off never enter a review queue. A PM sees them under *Ready to finalize* when submitted, and Staff can complete them directly (upstream rule).
- **Revision.** Unchanged. Revision requests use `canRequestTaskRevision`, and resubmitted work re-enters the same lane logic.
- **Backend consistency.** The store and database enforce the same rules through `taskTransitionError` and the existing RPCs. The new helpers only read them, so the UI cannot offer a decision the backend would reject.
- **Organisation-wide counts.** `getPortfolioReviewQueues` (used by Reports, Management overview and the monthly report) is unchanged. "Pending approvals" on the Super Admin page therefore still counts every submission across the agency, as an oversight metric.

---

## 7. Visual design improvements

- **One metric pattern.** `MetricStrip` in `src/components/ui.tsx`: a single quiet row, label above value, colour only when a value needs action. It uses valid `dl > div > dt + dd` markup and a stretched link. It replaced the spotlight cards, 8 icon cards, briefing tiles and per-stat icons on the SA and PM dashboards. An earlier link-wrapped version failed Axe (`definition-list`, `dlitem`) and was corrected before commit.
- **Icons.** Removed decorative icons from metrics, the registrations banner, the PM overview header and the "Team workload" caption. The Help centre's `Sparkles` was replaced with the existing `Route` icon for guided walkthroughs and removed from the eyebrow. Status and alert icons in "Needs my attention" were kept, smaller, with screen-reader severity text.
- **Layout.** The attention page is short; portfolio content moved to its own tab. Empty informational queues are hidden.
- **Responsive fix (pre-existing defect).** `PageHeader` let the action area squeeze the page title to **0 px wide** at 768px (Super Admin "Agency operations" and PM title, reproduced on `f39c335`). The title now keeps a 14rem minimum and the actions wrap inside a 65% cap. An e2e assertion guards it at 320/390/768/1024/1440.

---

## 8. Language improvements

| Before | After |
| --- | --- |
| "Welcome back, Boss Koo! Here's your task overview." | "Exceptions, approvals, and renewals that need a decision today." |
| "Deadlines, review risk, active companies, and commercial records in your portfolio." (PM) | "What needs your attention today across your projects." |
| "Personally assigned responsibilities stay in My Work; use the Action Centre for department decisions and next actions." | "Assignments to delegate, team progress, and reviews waiting on you." |
| "Personally assigned responsibilities, ordered by what you need to do next." | "What to work on next, ordered by revisions and deadlines." |
| "Manage assignments, approvals, revisions, files, and deadlines." (Tasks Management) | "Active assignments, reviews, and deadlines across the agency." (Tasks) |
| "Decisions and next actions from your existing work queues." (Action Centre) | "Your assigned and created tasks, ordered by next action." (All work) |
| "waiting for internal review" (English-only, built in lib code) | "Awaiting your review" / "Ready to finalize" / "Renewal due", composed in the UI and translated |
| "Renewals in 30 days" (two meanings) | "Monthly renewals in 30 days" and the "Contract renewals" list |

- **Chinese.** 49 new Simplified Chinese entries were added (`zhCopyUiRevamp`), consulted *after* existing dictionaries so no established translation is overridden. Example: the task-scope chip "Active work" → 进行中的工作, deliberately distinct from plan status "Active" → 启用中.
- **Guards.** The existing duplicate-key guard rejected 4 conflicting duplicates, which were removed. A new unit test pins key translations, and an e2e test checks the Chinese chips and headings.
- **Error messages (Phase 11).** All system feedback already passes through `userFacingMessage`/`SystemMessage`, which maps RPC, Postgres, PostgREST, auth, network, storage and HTTP errors to safe, actionable copy. No raw-error render path was found (the one direct `t(message)` uses fixed strings). No change was needed.

---

## 9. Before/after evidence

Screenshots are in `docs/ui-ux-revamp/`:

- `before/` was captured from `f39c335`, served unmodified from a separate worktree.
- `after/` was captured from this branch.

| View | Before | After |
| --- | --- | --- |
| Super Admin overview (tall) | `before/superadmin-home-tall.png` | `after/superadmin-home-tall.png` |
| PM dashboard with seeded project (desktop) | `before/seeded-pm-home-1440.png` | `after/seeded-pm-home-1440.png` |
| PM dashboard (390px) | `before/seeded-pm-home-390.png` | `after/seeded-pm-home-390.png` |
| HOD department work | `before/seeded-hod-home-1440.png` | `after/seeded-hod-home-1440.png` |
| HOD department tasks | `before/seeded-hod-tasks_scope_department-1440.png` | `after/seeded-hod-tasks_scope_department-1440.png` |
| Staff my work / all work (390px) | `before/seeded-staff-home-1440.png`, `before/seeded-staff-tasks-390.png` | `after/…` (same names) |
| Super Admin tasks (active default) | `before/seeded-superadmin-tasks-1440.png` | `after/seeded-superadmin-tasks-1440.png` |
| All roles × desktop/mobile, demo data | `before/*-desktop.png`, `before/*-mobile.png` | `after/*-desktop.png`, `after/*-mobile.png` |

`index*.json` beside the images records each page's `h1` and horizontal overflow (0 px everywhere).

---

## 10. Automated test results

RESULTS_PLACEHOLDER

---

## 11. Remaining issues

RISKS_PLACEHOLDER

---

## 12. Production readiness

READINESS_PLACEHOLDER
