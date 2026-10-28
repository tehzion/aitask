# AiTask Stage 1 & Stage 2 Implementation Report

**Report date:** 26 October 2026  
**Audit baseline:** 25 October 2026  
**Release decision:** Local release candidate only; production remains **NO-GO**. No production data or schema was changed, and nothing was deployed.

## Executive summary

Stage 1 corrects the Client Reports landmark issue, makes the remaining horizontal scrollers discoverable and keyboard usable, clarifies Company / Client / Project language in English and Simplified Chinese, and adds scenario coverage for task creation. The task form keeps its business requirements; optional details remain collapsed until requested. The form’s service, priority, client-visibility, and Project Manager HOD assignment controls now have explicit label associations or required-state indicators.

Stage 2 adds `/projects/:projectId` while preserving `/projects`. The workspace composes existing project, task, milestone, service, reporting, authorization, and activity data. It adds no database structures and does not replace task or service-management workflows.

Local targeted checks passed. The final four-worker full browser regression did **not** pass: 349 tests passed, 18 failed, and 5 serial responsive checks did not run after the first responsive test timed out in Axe. Failures included timeouts, a stale Company navigation label, and Staff mobile screenshot baselines affected by the deliberate responsive header change. The stale label expectation was updated and passed in isolation; the two changed mobile baselines were refreshed after visual inspection and both tests passed. The focused responsive case also passed again in isolation. The broad regression still needs a clean rerun before release.

## Stage 1 — essential UX improvements

### Client Reports accessibility

The Client timing table used a region role inside a report section that already had a named region, creating duplicate landmark names when due tasks existed. The table wrapper is now a focusable `group` with a distinct accessible name, and its visible instruction explains horizontal scrolling. Left and Right Arrow move the table horizontally. Reporting data and client access rules are unchanged.

**Evidence:** the Client fixture with due work passes Axe with zero violations; the regression also checks the named group and keyboard scrolling. See [Client report before](audit-evidence/2026-10-25/client-desktop-reports.png) and [Client report after](audit-evidence/2026-10-25/client-report-after.png).

### Responsive scrolling

The retained audit summary reports five main-content scroll-width observations among 130 role/route/viewport checks, but it does not retain the five case identifiers. Reproduction found these current cases:

| Surface | Reproduced issue | Result |
| --- | --- | --- |
| Project Manager `/projects`, 768px | Header title and actions made main content 661px wide in a 496px viewport. | Header actions stack through tablet widths; main content now fits. |
| HOD dashboard, 320px | Header made main content 337px wide in a 320px viewport. | Header stacks below 640px; main content now fits. |
| Boss dashboard monitor, 320px and 768px | Wide data table expanded the main scroll width. | Table remains intentionally horizontally scrollable in a named, focusable region with a caption, visible instructions, and Left/Right Arrow scrolling. |

The route/role matrix and focused responsive regression cover 320, 390, 768, 1024, and 1440px. The Project Workspace was also checked at all five widths. The document has no unintended page-level horizontal overflow. The Boss monitor is the remaining intentional nested scroller; users can discover and operate it with keyboard or touch.

The mobile offline status message is informational and no longer intercepts taps on the content beneath it. The Project Manager lifecycle flow passes at 390px after following the new Project Workspace route.

Before/after evidence: [Project list at tablet width](audit-evidence/2026-10-25/responsive-before-projects-tablet.png) / [after](audit-evidence/2026-10-25/responsive-after-projects-tablet.png); [HOD dashboard at phone width](audit-evidence/2026-10-25/responsive-before-hod-phone.png) / [after](audit-evidence/2026-10-25/responsive-after-hod-phone.png); [Boss table at 320px before](audit-evidence/2026-10-25/responsive-before-boss-320.png) / [after](audit-evidence/2026-10-25/responsive-after-boss-320.png); [Boss table at 768px before](audit-evidence/2026-10-25/responsive-before-boss-768.png) / [after](audit-evidence/2026-10-25/responsive-after-boss-768.png).

### Canonical terminology

| Term | Meaning in AiTask |
| --- | --- |
| **Company** | The customer business entity and its account record. The store represents this through a client profile (`clients`); the UI may call it a Company profile. |
| **Client profile** | The account/contact relationship record for a Company, including contact details and service-account context. External client users are associated with the Company; the words “client profile” and “client user” are not interchangeable. |
| **Project** | A defined delivery scope linked to a Company/client profile through `clientId` and `clientName`. Tasks link to a project through `projectId`. |
| **Client Workspace** | The Company’s service/account workspace, including permitted service-plan and monthly-cycle information. It is not the internal project-operations view. |

The `/projects` heading and navigation label now read **Companies & projects**, with contextual guidance explaining the relationship. Task creation says **Project** and **Company for this task**; a project fills its Company automatically, while a company-only task still needs a Company. English and Simplified Chinese messages were updated. Existing routes and stored names remain stable.

No representative human participants were available. The terminology review is therefore heuristic and provisional; no usability results or completion times are attributed to users.

### Task-creation validation

The form retains required task title, Company, department, and start date. Project Managers must also choose an eligible responsible HOD. The service and start date default to existing values. Due date, client visibility, project, and additional details remain available without removing authorization checks. Additional details stay collapsed by default. The PM HOD requirement is now marked visibly, and previously unassociated labels for service, priority, and visibility are connected to their selects.

Automated local scenarios cover:

| Scenario | Evidence |
| --- | --- |
| A — Quick task | PM creates a company-only task using the required title, Company, department, and responsible HOD; default start date and client-visible default are verified. |
| B — Department task | HOD creates a project task assigned to an eligible Staff member in the selected department; the fixture uses a Boss-curated project per existing project-link authorization. |
| C — Client-related task | Existing client-wizard regression creates a client profile, a named project, then a task linked to that client/project and service. |
| D — Scheduled task | PM creates work with future start and due dates; persisted values are checked. |
| E — Restricted task | PM selects Internal only; persisted task visibility is checked. |

The scenarios run with local seeded fixtures and automated browser interactions. This is structured technical walkthrough coverage, not human usability testing. Existing company/project/task permissions and mandatory fields remain in force.

## Stage 2 — Project Workspace

### Architecture and reused data

- Projects carry client ID/name, manager/HOD/Staff member ID arrays, lifecycle status, dates, and milestones. Tasks carry project IDs and existing work, comments, and review history.
- Project-level visibility reuses `getVisibleProjects`, `getVisibleTasks`, route permissions, and the existing task details routes. Lifecycle and project edit actions retain the existing Project Manager / Super Admin checks.
- Service plans, monthly cycles, and deliverables are Company/client scoped in the current model. The workspace shows the associated Company’s records only when the existing service-client access rule permits it; it does not imply those plans belong to one project or expose plan prices.
- Due-work reporting reuses `getDueWorkPerformance`. A project report link applies `?projectId=...`; the report filters its task cohort and suppresses the global monthly report while scoped.
- Recent activity is assembled from existing task `workHistory`, `approvalHistory`, and comments, with `updatedAt` as a fallback. The current model has no project lifecycle event stream, so this page does not claim to show project status-change history.
- No schema, migration, realtime subscription, or dependency was added.

### Workspace capabilities

The header shows project, Company, status, manager, timeline, and authorized actions. Overview figures show total/completed work, progress, pending reviews, upcoming deadlines, and overdue work using existing definitions. Empty projects do not receive an invented progress percentage.

The attention queue prioritizes overdue work, review, revision, upcoming deadlines, and assignment needs. Project tasks can be searched and filtered by status, priority, assignee, and due-date bucket, then opened through the existing task route. Milestones use saved project data and existing effective-status rules. Team members come from explicit project membership and visible task assignments. Service plans, cycles, delivery progress, reports, and recent task activity use the scoped records described above.

### Roles, routing, and prototype validation

- PM sees projects and tasks in their existing portfolio and authorized lifecycle actions.
- HOD sees only projects and work in their existing department/project scope; unrelated project IDs render as unavailable.
- Staff sees the restricted project context and tasks allowed by assignment visibility; management controls are absent.
- Client users are not granted the internal project route; the existing Client Workspace route and its checks are unchanged. The workspace component redirects Client role users to their profile when reached.
- Super Admin follows existing system-wide permissions.

Direct workspace navigation, refresh, browser back/forward, project report navigation, unavailable IDs, HOD isolation, Staff scope, Client URL isolation, empty/completed projects, and desktop/mobile layouts are covered by local Playwright fixtures. These fixtures served as the functional frontend prototype and validation dataset; no production data was connected. Workspace Axe checks report zero violations. Local seeded route-to-render timings ranged from 320ms to 1.9s across runs; the longer full-suite timing occurred under parallel load. These are local test timings, not production performance measurements.

Screenshots: [Project Workspace desktop](audit-evidence/2026-10-25/project-workspace-desktop.png) and [mobile](audit-evidence/2026-10-25/project-workspace-mobile.png).

No representative PM or HOD participants were available. Human task completion, time-on-task, navigation errors, and qualitative comprehension remain **NOT VERIFIED**.

## Quality gates and release status

| Requirement | Status | Evidence / limitation |
| --- | --- | --- |
| Client Reports landmark and keyboard access | **PASS** | Client due-task fixture, Axe zero violations, named focusable table group, arrow-key scroll regression. |
| Responsive viewport work | **PASS — targeted** | Five requested widths; focused responsive and workspace tests passed. Full four-worker browser run separately timed out in Axe and did not complete the serial responsive block. |
| English and Chinese terminology / workspace labels | **PASS — automated** | Strict i18n audit reported zero findings; workspace browser test checks Chinese overview/team labels. Human comprehension is not verified. |
| Task scenarios A–E | **PASS — local fixtures** | Scenario E2E checks A, B, D, E; client-wizard test checks C. No human participants. |
| Project Workspace role and scope checks | **PASS — local fixtures** | PM, HOD, Staff scope, Client direct-URL isolation, unrelated project/task isolation, and lifecycle actions. No live authenticated database role sessions. |
| Project metrics, filters, milestone, services, reporting | **PASS — local fixtures** | Four domain unit tests plus workspace/report browser assertions; calculations reuse existing domain selectors. Service data is company-level. |
| TypeScript check | **PASS** | `pnpm check` and the build’s TypeScript step passed after final source and test changes. |
| ESLint | **PASS** | `pnpm lint` passed after final form label and required-state changes. |
| Unit tests | **PASS** | 122 files / 937 tests passed after final source changes. |
| Architecture | **PASS — prior final source pass** | 9 architecture tests passed; 228 source files and 1,288 runtime edges, zero cycles. |
| Strict i18n audit | **PASS — prior final source pass** | 0 findings across 228 source files. |
| Production build and bundle check | **PASS — prior final source pass** | `pnpm verify:bundle` passed. Vite reported a non-fatal ~587KB raw workspace runtime chunk (168KB gzip); configured budgets passed. |
| Focused workspace / accessibility / responsive E2E | **PASS** | Stage 1/2 browser spec: 8/8 passed, including PM quick/scheduled/restricted task creation, HOD assignment, Client report Axe/keyboard, PM/HOD/Staff scope, project report navigation, empty state, five widths, and Chinese labels. |
| Lifecycle and save-recovery E2E | **PASS** | Focused rerun: 7/7 passed at desktop/mobile after updating old tests to navigate the new workspace route. |
| Full browser regression | **FAIL** | 372 tests collected with four workers; 349 passed, 18 failed, and 5 did not run. Failures included Axe/load timeouts and assertions in action recovery, date boundaries, service catalog, Staff/HOD workflows, and tutorial focus. The stale Companies link was corrected and passed in isolation; the two intentionally changed Staff mobile screenshot baselines were refreshed and passed; the responsive case passed in isolation. These focused follow-ups do not clear the full-suite failure. |
| Production database, hosted security, backups, environment, deployment | **BLOCKED / NOT VERIFIED** | Existing [Final Production Gate](FINAL_PRODUCTION_GATE.md) remains NO-GO. This work did not change its blockers. |

The full Playwright run is a release gate failure. Relevant targeted suites pass, but the 18 full-run failures still need triage and the complete browser suite needs a clean rerun.

### Stage 2 requested test coverage

| # | Test area | Status | Evidence / limitation |
| ---: | --- | --- | --- |
| 1 | Authorized project access | **PASS** | PM, HOD, and Staff local fixtures. |
| 2 | Unauthorized project access | **PASS — local fixture** | HOD out-of-scope project and Client direct URL are checked for hidden internal content; no live role session. |
| 3 | Cross-project isolation | **PASS** | HOD cannot see unrelated project task; project report excludes unrelated overdue task. |
| 4 | Summary accuracy | **PASS** | Unit fixtures reconcile completed/open/overdue and exclude cancelled/other-project tasks; workspace asserts progress. |
| 5 | Task filtering | **PASS** | Domain tests cover search, status, priority, assignee, and due-date buckets; browser checks search. |
| 6 | Pending review calculations | **PASS** | Domain test verifies a waiting review is counted once and prioritized correctly. |
| 7 | Milestone rendering | **PASS** | Saved milestone renders; effective status and next milestone have unit coverage. |
| 8 | Team visibility | **PASS — local fixture** | Explicit PM/HOD/Staff membership and visible team content checked; foreign project is hidden. |
| 9 | Service-plan visibility | **PASS — local fixture** | PM sees Company-level plan/cycle fixture through existing access guard; no prices appear. Live role boundaries are not verified. |
| 10 | Project reporting | **PASS** | Project scope, KPIs, report route, and navigation history verified. |
| 11 | Navigation | **PASS** | Project links, task links, report link, and return-to-project navigation use current routes. |
| 12 | Direct-link refresh | **PASS** | Workspace reload and project report reload tested. |
| 13 | Empty states | **PASS** | Empty/completed project, no task/milestone/activity, and unavailable ID fixtures tested. |
| 14 | Loading states | **NOT VERIFIED** | Current page reads the already hydrated workspace store and has no separate project fetch/loading state. |
| 15 | Error states | **NOT VERIFIED** | Unavailable IDs are tested; backend/query failure behavior is not applicable to the local store fixture and was not exercised. |
| 16 | Mobile responsiveness | **PASS — local fixtures** | Workspace and task/report scrollers checked at 320, 390, 768, 1024, 1440px; mobile screenshot retained. |
| 17 | English translations | **PASS** | English workspace headings and actions asserted. |
| 18 | Chinese translations | **PASS — focused labels** | Chinese overview/team headings asserted; strict i18n audit passes. |

## Primary files for this enhancement

- Routing and navigation: `src/app/AppContent.tsx`, `src/app/routing/navigation.ts`, `src/app/routing/globalSearch.ts`.
- Company/project index and workspace: `src/modules/projects/pages/Clients.tsx`, `src/modules/projects/pages/ProjectWorkspace.tsx`, `src/modules/projects/domain/projectWorkspace.ts`, `src/modules/projects/domain/projectWorkspace.test.ts`.
- Reports, task creation, and responsive headers/scrollers: `src/modules/reports/pages/Reports.tsx`, `src/modules/tasks/components/CreateTaskModal.tsx`, `src/modules/tasks/components/StaffMyWork.tsx`, `src/shared/components/ui.tsx`, and the dashboard page/components.
- Access and copy: `src/shared/authorization/access.ts`, `src/shared/i18n/messages.ts`, `src/shared/i18n/i18n.ts`.
- Regressions: `e2e/stage1-project-workspace.spec.ts`, `e2e/responsive-audit.spec.ts`, `e2e/audit-regressions.spec.ts`, task creation / permission specs, and the project lifecycle / save-recovery route helpers. The Staff mobile light and Chinese dark screenshot baselines in `e2e/staff-workspace-v2.spec.ts-snapshots/` were refreshed to match the intentional stacked mobile header and passed their focused visual tests.

The working tree contained other pre-existing or concurrent dirty files; this list identifies the feature files, not every modified path in the checkout.

## Outstanding production blockers and recommendation

Production remains **NO-GO**. The existing gate records unresolved lifecycle/retention policy approval, unavailable staging access, repository migration parity (114 local migrations versus 112 recorded in production, including an unapproved pending migration), no fresh backup/recovery evidence, and unavailable Vercel environment metadata. Live RLS role-boundary, concurrency, Realtime, Storage, dashboard accuracy, and notification verification are also incomplete. Leaked-password protection remains unavailable on the current Supabase plan.

**Recommendation:** keep this as a local release candidate. Triage the 27 full-suite failures, rerun the complete browser regression, finish the blocked hosted checks and policy decisions, then request release authorization separately. Do not deploy this enhancement as a substitute for those gates.
