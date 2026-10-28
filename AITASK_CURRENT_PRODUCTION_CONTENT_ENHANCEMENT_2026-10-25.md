# AiTask — Current Production Feature & Content Audit

**Audit date:** 25 October 2026  
**Production version checked:** v3.0.0, Vercel Ready deployment `8eeba61ebe3e02825447201b18c6d1b0acfec595`  
**Production branch:** `codex/role-project-permissions-release-2026-10-20`  
**Prior production deployment:** `a09d797`  
**Working-tree HEAD:** `f368220` (includes later local refactor/documentation work and uncommitted changes)

## Scope and production boundary

The inventory below is pinned to the deployed commit, not inferred from the newer local checkout. The `8eeba61` deployment is a module/notification migration and does not introduce a new user-facing workflow over its preceding production deployment. The October announcement therefore summarizes the verifiable product improvements made since the previous August notice baseline; it does not present the migration itself as a feature release.

Some current working-tree changes are not part of production `8eeba61`, including the new `/projects/:projectId` workspace route and its linked dashboard actions. They are excluded from the production inventory and release claims. The announcement, onboarding, Help, dashboard copy, and microcopy changes in this audit are local proposals; they have not been deployed or verified in a hosted production browser session.

## 1. Current-version feature inventory

| Feature | Current production behavior | Relevant roles | New / improved / existing since August notice | Verification |
|---|---|---|---|---|
| Companies and client profiles | Companies hold client details, contacts, client accounts, services, and linked work. Company records and projects remain distinct. | Super Admin, Project Manager, scoped HOD/Staff; clients see their own company details | Existing foundation; company editing, ownership, and scoped project administration improved | Production source at `8eeba61`: `src/pages/Clients.tsx`, `src/lib/access.ts`; release history and role tests |
| Project planning and lifecycle | Projects have their own name and company, assigned owners/team, service scope, dates, project status, milestones, health signals, and closure warnings. Project management is available from Companies; authorized owners can edit lifecycle details. | Super Admin, assigned Project Manager; other roles see only permitted projects and work | Significantly improved: portfolio scoping, ownership, milestones, health, and closure flow | Production source: `src/components/ProjectManagementPanel.tsx`, `src/lib/projectManagement.ts`, `src/lib/pmDashboard.ts`; project-management regression coverage |
| Task creation and department handoff | Tasks can link to a company/project, carry a brief and deadline, route through the configured department and eligible people, and retain the project’s assignment rules. HOD reassignment is status- and eligibility-dependent. | Super Admin, Project Manager, HOD, Staff | Improved: project-scoped routing, HOD delegation, assignment locks, and clearer handoff notifications | Production source: `src/pages/Tasks.tsx`, `src/components/TaskDetailsModal.tsx`, task rules and release commits through `8eeba61`; task-stage and HOD browser suites |
| Staff task execution | Staff find assigned work, update progress, add comments/files, submit for review, and respond to revisions. | Staff; HOD/reviewer sees work within department and permissions | Improved: role-specific queues, submission and recovery feedback, revision follow-up | Production source: Staff task focus/workspace and task detail components; Staff workflow/recovery tests |
| Internal review and client acceptance | Internal approval follows project/task review settings. Client feedback or acceptance is a separate decision on work shared for client review; it is not project closure. | Project Manager/HOD/reviewer; Client for published work | Improved: optional internal review behavior, distinct review stages, clearer handoffs | Production source: workflow review rules, task details, Client workspace; review and client-privacy regression suites |
| Service plans and monthly cycles | Teams can use packages or tailor service scope, schedule cycles, create deliverables, review progress, plan renewals, and carry eligible unfinished work forward. Existing plans/cycles preserve the task steps and prices they were created with. | Super Admin, Project Manager, authorized account roles; HOD/Staff execute work; Client sees shared delivery | Existing foundation; renewals, carry-forward, cycle closeout, and saved-plan explanations improved | Production source: service plan, cycle, and delivery components/actions; monthly cycle, renewal, and carry-forward tests |
| Client portal and delivery review | Clients see company-shared services, published delivery periods, files, progress, updates, and review actions. Internal notes, staff assignments, and team-only review details remain private. | Client; internal roles publish/manage | Existing foundation; privacy, timing, review state, and client-facing wording improved | Production source: `src/pages/ClientWorkspace.tsx`, `src/pages/DeliveryTracker.tsx`; client workspace/review/privacy browser and data tests |
| Dashboards and reports | Boss Koo sees organization operations; Project Managers see their portfolio; HOD/Staff see permitted department or assigned work; clients see shared deliveries. Reports include task/delivery measures and monthly summaries. | All roles, with role- and permission-scoped data | Improved: management intelligence, monthly reporting, role-specific attention signals | Production source: `src/pages/Dashboard.tsx`, `src/components/ManagementOverview.tsx`, `src/pages/Reports.tsx`; dashboard/report tests |
| Notifications | Inbox and alerts surface assigned work, deadlines, comments, submissions, review handoffs, requested changes, and other scoped activity; users can manage read state. | All roles, with recipient rules | Improved: HOD handoff and recipient correctness, notification stability | Production source: notification center/popup modules and role rules; notification and HOD handoff tests |
| Membership and role access | Registration/access requests and member permissions are managed through protected administration. Project Managers have bounded project/member authority; clients do not receive internal operations access. | Super Admin; limited project administration for Project Managers | Improved: project-scoped access and role boundaries | Production source: `src/pages/Approvals.tsx`, access rules, production migration history, permission-parity tests |
| Help, onboarding, and localization | First-run onboarding, role-aware Help, tutorials, contextual links, English, and Simplified Chinese are available. | All roles, filtered to role/access scope | Existing surfaces; copy and permission filtering improved in this working tree | Production baseline source includes Help/tutorial modules; local updates validated by translation and browser checks below |

The current production feature list is based on deployed source and release history. The test results in this report validate the local working tree, not the hosted production data or database state.

## 2. Release enhancement comparison

The prior notice (`2026-08-service-operations`) described client service plans and monthly delivery, but used technical customer-facing phrases such as “snapshots stay frozen” and “role workbenches.” It also used broad role buckets that did not consistently match the current Super Admin, Project Manager, HOD, Staff, and Client experience.

Since that baseline, release history records meaningful user-facing improvements: project portfolio scoping and lifecycle controls; clearer Project Manager → HOD → Staff assignment; configurable internal review with separate client acceptance; HOD reassignment and review handoffs; renewal planning and carry-forward; management dashboards and monthly reports; and more reliable save/retry and notification feedback. Existing service plans, monthly delivery, the client portal, reports, and notifications are not presented as newly invented features.

The newest Ready deployment (`8eeba61`) primarily reorganizes application modules and notification code. No new feature is attributed to that code-organization change.

## 3. Updated What’s New content

**Main Project Manager notice**

> **Projects have clearer owners and next steps**  
> Recent updates make it easier to coordinate project teams, hand off tasks, and follow delivery progress.

The short view has three highlights and one primary action. “More from this update” opens the detailed view, with additional role-relevant highlights and a return-to-summary action. Each item is filtered by the user’s effective permissions; when a custom role has no matching items, it receives a safe localized fallback.

| Role | Headline | Short-view highlights |
|---|---|---|
| Super Admin | Project and team work are easier to follow | **Review project owners and milestones:** Open a project from Companies to check its status, team, tasks, milestones, and closure checklist. **See work that needs attention:** Use the management dashboard and reports to follow deadlines, reviews, and monthly delivery. **Manage member access:** Review access requests and role permissions in Approvals. |
| Project Manager | Projects have clearer owners and next steps | **Review project health and milestones:** Open a project from Companies to check its status, team, tasks, milestones, and closure checklist. **Hand work to the right department:** Choose a department and follow the project’s assignment rules when creating a task. **Spot reviews and delivery risks:** Use your dashboard and reports to find deadlines, reviews, and work that needs follow-up. |
| HOD | Department handoffs are easier to follow | **Start with department work:** See tasks assigned to you and work visible to your department. **Assign eligible staff:** Reassign work only when the task status, project, department, and staff member allow it. **Review submitted work:** Check files and comments, then approve or request changes when the review step allows it. |
| Staff | Your assigned work is easier to follow | **See tasks assigned to you:** My Work brings your tasks, deadlines, and revision requests into one view. **Keep updates with the task:** Add comments or files, update progress, and submit work when it is ready for review. **Respond to requested changes:** Read the reviewer’s note, update the work, and submit it again when revisions are requested. |
| Client | Shared deliveries are easier to follow | **Follow published deliveries:** See delivery periods, files, and progress after your team shares them with you. **Review and respond:** Give feedback or record acceptance when a delivery is ready for client review. **See service information shared with you:** Review the service and delivery details available to your company. |

All five personas have equivalent Simplified Chinese copy. The detail view makes the internal approval/client acceptance distinction explicit and describes HOD reassignment restrictions and client visibility without exposing administrative or financial information.

The new notice ID is `2026-10-project-workflows`. Acknowledgement remains per user and notice ID. Help can reopen the latest notice, including after it has already been dismissed. The implementation does not retain a browsable archive of prior notices.

## 4. Updated tutorials and first-run onboarding

The first-run journey and Help copy now use five actual personas and short action-oriented steps:

- **Super Admin:** organization activity → companies/projects → task setup → access requests → reporting.
- **Project Manager:** portfolio → company/project scope → department handoff → progress/reviews → service plans and reporting.
- **HOD:** department queue → read the handoff → assign eligible staff → review submissions → follow up.
- **Staff:** assigned work → task brief → progress/comments/files → submit → respond to revisions.
- **Client:** shared home → published deliveries → feedback/acceptance → what remains private.

The Help library is organized into eight categories: getting started, company/client management, project management, task management, department management, client review, service delivery, and reports/monitoring. Learning tracks remain optional and completed tutorials stay available to revisit. Tutorial targets and action steps are filtered using effective permissions; unavailable destinations fall back to Help rather than blocking the application.

The current local edits also add a direct contextual link to the latest What’s New notice and role-permission-aware Help checklists. Tutorials distinguish task completion from project closure and internal approval from client acceptance.

## 5. Contextual Help updates

Contextual tutorial links and workflow guidance now point users to relevant instructions for project creation/lifecycle, task creation and assignment, reviews and revisions, monthly service renewal, carry-forward work, and reports. Help filters internal workflows away from Client guidance and hides action instructions that the effective role cannot perform.

The workflow guides describe the actual handoffs without performing them: Project Manager sets scope; HOD checks eligibility and delegates; Staff produces/submits; an authorized reviewer decides; Client reviews only the shared result.

## 6. Dashboard and page copy

Dashboard introductions now explain the user’s work by role: organization activity for Super Admin, portfolio deadlines and reviews for Project Managers, department progress for HOD, assigned work and deadlines for Staff, and shared deliveries/feedback for Clients. Company copy defines the difference between a company, its client profile, a project, and a Client portal account.

The current local text also explains project health, delivery scope, monthly schedule and renewal actions, and report measures in plain language. These strings are localized in English and Simplified Chinese.

## 7. Microcopy changes

Examples from the local content update:

| Before | Updated copy |
|---|---|
| “Company-wide operational snapshot.” | “Organization-wide operations at a glance.” |
| “Saved client plans keep their own snapshots.” | “Plans already created keep their saved services and prices.” |
| “Workflow copies are frozen with each client plan.” | “Existing plans keep the task steps they were created with.” |
| “Snapshot target / Remote snapshot / Snapshot ID” | “Workspace data source / Remote workspace data / Workspace data ID” |
| “Full workbench” wording in role empty states | “All work” or a direct description of assigned/department work |

Task and service-plan instructions now explain what information to enter, what is allowed, and what happens next. These edits change user-facing text only; they do not change task lifecycle rules, permission policy, database migrations, or production data.

## 8. Localization report

The What’s New notice, onboarding, Help guidance, dashboard introductions, and edited microcopy have English and Simplified Chinese content. Dynamic attention labels use explicit message IDs, and project workspace empty states now have catalog translations. User-authored company names, task titles, comments, member names, and file names remain untranslated.

**Validation:** strict i18n AST audit found 0 issues across 228 source files. All source message identifiers resolve; interpolation remains covered by the existing message-catalog tests.

## 9. UI validation and screenshots

The new announcement is exercised in desktop and mobile layouts, including role-specific copy, detail/back navigation, dismissal persistence, reopening from Help, keyboard focus, modal accessibility, Simplified Chinese, dark mode, and horizontal overflow. First-run onboarding browser coverage uses 320, 375, 390, 414, 768, and 1024 px widths.

Screenshots are saved under `audit-evidence/2026-10-25/content-audit/`:

- `release-notice-en-desktop.png`
- `release-notice-zh-mobile.png`

These are local Playwright screenshots, not screenshots of the hosted production site. The focused browser results and the interrupted broad regression run are recorded below.

## 10. Test results

| Check | Result |
|---|---|
| TypeScript (`pnpm check`) | Pass |
| Full ESLint (`pnpm lint`) | Pass |
| Unit tests (`pnpm test`) | Pass — 122 files, 937 tests |
| Architecture (`pnpm verify:architecture`) | Pass — 228 files, 0 cycles, 0 violations |
| Strict i18n (`pnpm verify:i18n:strict`) | Pass — 0 findings across 228 files |
| Production build (`pnpm build`) | Pass; Vite reports the existing >500 kB chunk advisory |
| Focused Playwright: release notice + onboarding | Pass — 12 tests |
| Focused Playwright: exhaustive role tutorials | Pass — 1 test |
| Focused Playwright: accessibility | Pass — 1 test |
| Focused Playwright: calm UI screenshots | Pass — 1 test; refreshed four baselines for the intentional Companies & projects navigation label |
| Broad Playwright regression suite | Interrupted after 138 tests started: 64 passed, 74 failed, 232 not run. Failures included seeded-session sign-in redirects and task/client/company save-recovery assertions outside the content changes. |
| Migration/database/production rollout checks | Not run; no migration or production changes were requested |

## Remaining gaps

- Help reopens only the latest announcement; users cannot browse an archive of previous notices.
- The broad browser suite was stopped after repeated failures in seeded-session login redirects and workflow save/recovery assertions. It remains incomplete; this content audit does not modify authentication, authorization, or task lifecycle behavior.
- Production was verified by deployment provenance, but this audit did not use a production-authenticated browser session. Local demo UI results do not establish hosted production behavior.
- A new project detail route exists only in the working tree and is not part of `8eeba61`; keep it out of production feature claims until it is released and verified.
- The strict i18n audit verifies translation coverage, not the naturalness or clarity of every legacy notification, error, form hint, placeholder, and empty state. This pass improves the highest-impact workflow surfaces; a line-by-line semantic review of all remaining strings is still needed.
- Advanced Settings/backend diagnostics still show technical implementation details (for example table/configuration identifiers) to administrators. This copy was simplified where the UI is intended for general workspace users, but developer-level diagnostics remain technical by design.

## Release safety

All changes remain local. Nothing was deployed; production data was not modified; no database migration, authorization policy, or task lifecycle rule was changed for this content work. The content updates do not resolve any separate release/database alignment or hosted verification blocker.
