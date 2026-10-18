# AiTask UX and Productivity Audit

Audit date: 2026-10-18 (MYT)  
Repository: `tehzion/aitask`  
Branch: `codex/audit-p0p1-2026-10-16`  
Commit inspected: `90279d6`  
Audit mode: read-only UX, workflow, responsive, accessibility, and productivity review. No product code, database migration, authentication, or deployment change was made.

This audit complements [AITASK_PLATFORM_FEATURE_AUDIT.md](./AITASK_PLATFORM_FEATURE_AUDIT.md) and preserves the ongoing P0/P1 stabilization work. It does not reclassify platform features as missing without inspecting their routes, components, state selectors, tests, and user flows.

## Executive summary

AiTask already has a considered operational UX: role-aware navigation, role-specific dashboards, a staff My Work queue, page-scoped search, task table/board views, quick task filters, a command palette, keyboard shortcuts, contextual tutorials, draft recovery, save retry/rollback feedback, permission-aware task details, and client-safe delivery review.

The largest user-effort opportunities are consolidation and progressive disclosure rather than new business rules:

1. **Resolve the onboarding/mobile interaction conflict (P0).** The responsive route audit passes, but the focused app smoke flow cannot activate mobile “More destinations” while the auto-open onboarding welcome card is pointer-interactive over the application. This is already part of the stabilization backlog and must be fixed there, not duplicated here.
2. **Make search truly global (P1).** `Navbar.tsx` currently routes one query to the current page’s filter (`/tasks`, `/projects`, `/clients`, or `/notifications`). Users cannot search authorised tasks, projects, companies, clients, and service plans from one result surface.
3. **Reduce task-creation effort with progressive disclosure (P1).** `CreateTaskModal.tsx` presents several sections and more than a dozen controls before the user reaches the submit action. Contextual prefilling exists, but a quick path for title, project/company, assignee, and deadline is not first-class.
4. **Persist personal work views (P1).** `/tasks` has URL-backed search and several useful quick filters, but local filter state and the table/board choice reset on navigation. There is no saved “My overdue”, “Waiting approval”, or preferred sort/view state.
5. **Clarify My Work versus decisions requiring attention (P1).** `StaffMyWork.tsx` already provides a strong personally assigned queue (`Needs action`, `Up next`, `Waiting`, `Done`). It should remain the personal-responsibility surface while the separate Action Centre work from the platform backlog owns cross-role decisions such as approvals, renewals, and unassigned work.

## Audit method and evidence standard

Inspected:

- Route and access guards in `src/App.tsx`, `src/lib/access.ts`, and `src/lib/navigation.ts`.
- Shell, navigation, header search, command palette, notifications, onboarding, and save-state feedback in `src/components/Layout.tsx`, `Sidebar.tsx`, `Navbar.tsx`, `CommandPalette.tsx`, `OnboardingExperience.tsx`, and related components.
- Role workbenches and pages: `Dashboard.tsx`, `StaffMyWork.tsx`, `Tasks.tsx`, `Clients.tsx`, `ClientWorkspace.tsx`, `DeliveryTracker.tsx`, `Calendar.tsx`, `Reports.tsx`, `Notifications.tsx`, `Help.tsx`, `Settings.tsx`, and `Approvals.tsx`.
- Task creation/details, collaboration, review, files, recovery, and localization code.
- Existing Playwright workflows, responsive/a11y coverage, unit tests, and existing platform audit findings.

Evidence labels used below:

- **Code-confirmed:** directly visible in the named route/component.
- **E2E-confirmed:** covered by an existing or executed Playwright flow.
- **Browser-observed:** reproduced during the focused browser run.
- **Not measured:** no reliable timing or real-user measurement was available; no timing is invented.

The interaction counts in the companion workflow report count each click, field fill, or select operation once. Authentication, data seeding, direct `page.goto()` calls, and operating-system file pickers are excluded unless stated. They are minimum happy-path counts, not a timed usability study.

## Verified route and navigation model

Private application routes are mounted under `Layout` and guarded by `PrivateRoute` plus `RoleRoute`:

| Surface | Route | Current UX evidence |
| --- | --- | --- |
| Dashboard / My Work | `/` | Boss, PM, HOD, staff, and client personas receive different dashboard/workbench content. Staff/HOD use `StaffMyWork`. |
| Tasks | `/tasks` | Search, URL-backed filters, table/board toggle, quick filters, pagination, quick edit, task details, and role-specific client delivery views. |
| Calendar | `/calendar` | Month/week view, date navigation, task range editing, metric filters, holidays, keyboard date navigation, and assign-task entry point. |
| Delivery tracker | `/clients` | Client/internal delivery views, search, status/service filters, progress, review entry points, and client-safe data. |
| Client workspace | `/clients/:clientId` | Overview, deliveries, services, files/updates, comments, delivery links, approvals, and cycle/service management. |
| Companies / projects | `/projects` | Company search, client/project creation, company details, linked projects/tasks/plans/cycles/deliverables, and portfolio scope. |
| Reports | `/reports` | Four-week due-work metrics, weekly/department tables/charts, timing data, and CSV export. |
| Approvals / administration | `/approvals` | Boss-only registration review, members, roles, permissions, invitations, and history. |
| Notifications | `/notifications` | All/unread tabs, category filter, open-work filter, grouped feed, read state, and deep links. |
| Settings | `/settings` | Profile, password, avatar, backend/sync state, service catalog, workflow templates, statuses, notifications, and role explanation. |
| Help / onboarding | `/help` plus shell overlay | Role-aware tutorial centre, search/category filters, progress, workflow guides, contextual links, and auto-open onboarding. |

## Feature audit

| Area | Current experience | Problem or friction | Proposed improvement | Priority |
| --- | --- | --- | --- | --- |
| Navigation | `Sidebar.tsx` and `getNavigationSections()` provide role-aware desktop/mobile destinations. Staff/HOD/client secondary destinations collapse into `More`; the mobile bar is capped at a small set of primary destinations. | Users must know whether a destination is in the primary bar, sidebar, `More`, header preview, or a page-specific panel. The mobile drawer is reliable in the responsive route audit but the onboarding overlay can intercept its controls. | Keep the current information architecture; make the current location and “More” contents more explicit, fix overlay coordination, and expose global search from the shell. | P0/P1 |
| Header search | `Navbar.tsx` uses one input but sends searches to the current route or a route-specific destination. `/tasks`, `/projects`, `/clients`, and `/notifications` each own different search semantics. | It looks global but is not global. Service plans and cross-record identifiers are not first-class results; users repeat searches after changing pages. | Add a permission-scoped global result surface using existing visible selectors first. Preserve route filters as a secondary “filter this page” mode. | P1 |
| Dashboards | `Dashboard.tsx` provides Boss overview/agency pulse/team workload, PM portfolio delivery, and role-aware operational surfaces. Staff/HOD use `StaffMyWork.tsx`. | Attention is distributed between dashboard cards, work queues, notifications, reports, and delivery tracker. The user must decide which surface owns the next action. | Keep dashboards as summaries, make My Work personal, and align the separate Action Centre with decision queues and deep links. Do not add another notification transport. | P1 |
| Company management | `/projects` and `Clients.tsx` show searchable company summaries, linked task/project/service counts, details, owners, workspace, and destructive confirmation. | Creating a client, then a project, then a task crosses nested dialogs and repeats context. A company can be reached through Companies, task filters, delivery tracker, or client workspace. | Preserve the current nested creation capability but offer contextual “create next” actions and carry company/project context into the next form. | P1 |
| Project management | Project records are visible within company details and task links. Existing tests cover project creation, edits, portfolio scope, and task drilldown. | Project health, milestones, and timeline are not first-class UX concepts; the user infers progress from task lists, calendar, and reports. | Coordinate with the platform backlog’s project-health/milestone work. In the UX layer, provide one project summary entry point and preserve deep links. | P1/P2 |
| Task management | `/tasks` has search, quick filters (`All`, `Due today`, `Overdue`, `Waiting approval`), department/assignee/client/status/priority/date filters, table/board, quick edit, status controls, pagination, and mobile cards. | Filter and view preferences are ephemeral. The desktop table is only shown at `2xl`; smaller widths use cards and pagination, which is safer but can increase scanning effort. No bulk workflow was found. | Add saved filters and personal view preferences; keep card layout on narrow screens; consider compact “load more” or preserved page state after evidence from usage. | P1/P2 |
| Task creation | `CreateTaskModal.tsx` includes task details, company/assets, assignment/timeline, links/notes, draft recovery, contextual prefills, project creation, validation, and retry-safe save. | The happy path still exposes optional Facebook, website, attachment, notes, service, visibility, and other controls before creation. Field errors are mostly consolidated at form level rather than focused inline links to each invalid field. | Add a small essential first step and an explicit advanced section. Preserve the full editor and all current validation/permission checks. Add focusable error summary plus field-linked errors. | P1 |
| Task delegation | HOD scope tabs distinguish `My assignments`, `Delegated by me`, and `Department work`. Task details exposes delegation/assignee editing with workload context and access checks. | Delegation can require opening a task, entering full edit, then finding the assignee field. It is not available as a clear contextual action from every queue item. | Add a permission-aware quick delegation action from queue/work item surfaces, reusing the existing server/store assignment guard. | P1 |
| Approval and revision | `TaskDetailsModal.tsx` and `ClientDeliveryFocus.tsx` expose internal approval, client approval, revision request, notes, approval history, comments, files, and recovery. Existing E2E coverage checks client feedback, decision notes, recovery, and privacy. | Review actions are split between task details, delivery tracker, client workspace, notifications, and dashboard queues. The task detail view is a long, dense scroll on mobile rather than a clear review-first hierarchy. | Use the platform backlog’s Action Centre/client approval work to consolidate entry points. In the detail view, make the current decision, evidence, and history visually scannable without adding a complex messaging system. | P1/P2 |
| Service plans and delivery cycles | Settings contains `ServicePackageManager` and `WorkflowTemplateManager`; client workspace contains service/cycle/deliverable views and secure file activity. | Reusable service configuration is deep in Settings and distinct package/workflow concepts are easy to conflate. Client users see service/delivery views but not a single monthly summary. | Coordinate with service-template/monthly-report backlog work. Add contextual links from client/service surfaces rather than another management page. | P2 |
| Reports and exports | `/reports` provides four-week due-work reporting, charts, tables, timing data, and `Export CSV`; client reports use a redacted CSV path. | Reports are task/due-work focused and have no shared company/date filter model across dashboard, service, project, and client views. PDF/service-history export is not a general user-facing workflow. | Add shared scope/filter language and export metadata. Prioritise useful CSVs; defer PDF and financial exports until data contracts are validated. | P1/P2 |
| Calendar | `/calendar` supports month/week, today, task date ranges, filters, holidays, drag/resize on supported desktop layouts, keyboard movement, and assignment. | Calendar shows task timing but not project milestones or health. Drag-based scheduling is desktop-oriented and the mobile alternative is primarily date/task list content. | Add milestone/project context only after the platform milestone model exists; keep mobile as an agenda/list, not a compressed Gantt. | P2 |
| Notifications | Header preview shows up to five unread notifications with deep links; `/notifications` has all/unread, category, open-work, grouping, read actions, and search. | Notifications are an event feed, while actionable work also appears in dashboards and workbenches. Users can miss the distinction between “read” and “resolved”. | Preserve Notifications as history/feed. Add Action Centre decision items with deduplication and explicit completion/deep-link state. | P1 |
| Help and onboarding | `Help.tsx` provides role-matched guides, search, categories, recent/recommended tutorials, progress, workflow guides, and contextual tutorial links. `OnboardingExperience.tsx` supports welcome, guided tours, skip, keyboard navigation, and persistence. | Browser-observed/previous focused E2E failure: auto-open welcome card remains `pointer-events-auto` over the app and intercepts the mobile “Open more destinations” click. A user can be taught the app while being prevented from using the underlying navigation. | Fix in the stabilization branch/component owner. Define whether welcome is intentionally blocking; if blocking, provide explicit dismissal and test every escape path. Do not add a second UX fix here. | P0 |
| Account settings | Settings supports profile, email/password, avatar processing, theme, locale, sound, backend freshness, recovery, task statuses, service/workflow administration, and role explanation. | Operational account controls, service management, status management, and backend diagnostics are all on one long page. The user must scan to find the relevant section. | Add stable section navigation/anchors or progressive disclosure while keeping account and service administration permission-scoped. | P2 |
| User administration | `/approvals` provides registrations, member search/role filters, invitations, member role/department/custom permission changes, role editor, and approval history. | No user-facing resend/expiry flow was found in the inspected UI. Invitations and registration approval are both available, but their differences and lifecycle states require reading the detail panel. Deactivation is represented by destructive member removal rather than an explicit lifecycle model. | Conduct a separate security-reviewed admin UX slice: invitation status/expiry/resend, active/deactivated state, and clearer permission explanations. Do not alter auth/RBAC architecture in this UX pass. | P2 |
| Reliability feedback | `Layout`, `CreateTaskModal`, `TaskDetailsModal`, `Clients`, `Calendar`, and settings expose alerts, retry, restore saved data, draft recovery, optimistic rollback, and sync banners. Existing failure E2E tests cover uncertain saves, permission errors, uploads, and recovery. | Recovery is technically strong but can be distributed between a local panel, workspace banner, toast, and draft notice. Generic fallback text remains in some paths; the user may need to infer whether an operation is staged, saved, rejected, or rolled back. | Standardise an operation-state vocabulary: saving, saved, waiting for confirmation, retry, restored, rejected. Keep errors adjacent to the action and retain retry/restore choices. | P1 |
| Mobile and accessibility | Responsive/a11y tests cover routes, roles, 320/375/390/414px, 768/844/1024/1440px, dark mode, Chinese, and reduced motion. Components generally use 44px+ controls, labels, focus rings, live regions, and inert modal/menu content. | Responsive rendering passes, but interaction-level overlay blocking is a P0 defect. Long detail/create forms and dense filter rows remain effort-heavy at narrow widths. | Keep the current responsive patterns, fix overlay interaction, then audit the highest-friction mobile task/review flows with real tap sequences. | P0/P1 |

## Global search feasibility

Global search is feasible without adding a search service as the first implementation:

1. Reuse `getVisibleTasks`, `getVisibleProjects`, client visibility selectors, service-plan/cycle selectors, role permissions, and `notificationRouteToPath`-style deep-link mapping.
2. Search title/name/identifier across the records already loaded for the current workspace in local/demo mode.
3. In secure Supabase mode, add a permission-scoped read model or RPC only if client-side loaded data is incomplete or too large. Do not rely on frontend filtering for isolation.
4. Provide keyboard focus with `/`, `Cmd/Ctrl+K` for the existing command palette, and a mobile full-width search surface. Keep the command palette for commands/pages rather than turning it into a record search by accident.
5. Show result type, visible context, and a direct route; show a truthful empty state rather than silently routing to a page with no match.

## My Work versus Action Centre

The distinction is already partially present:

- **My Work:** personally assigned responsibilities and work the user can execute. `StaffMyWork.tsx` has ordered buckets and HOD scope tabs.
- **Action Centre:** decisions and exceptions requiring attention across the user’s authorised scope: approvals, overdue risk, unassigned work, renewals, feedback, and failed automation.
- **Notifications:** historical/event feed, with read state and deep links.

The UX recommendation is to strengthen these boundaries and share selectors/deep links. Do not duplicate the notification feed or create a second personal workbench.

## UX-specific security boundaries

- Search, saved filters, recent records, and deep links must re-run existing visibility checks; stored preferences must never become an access grant.
- Quick create must call the same task creation and assignment guards as the full form. Progressive disclosure changes presentation, not validation or authorization.
- Client approval, comments, files, and exports must continue to use client projections and secure Storage/download checks. Internal notes and files must remain excluded.
- Invitation status, member lifecycle, role changes, and permission explanations require the existing Boss-only/server/RLS controls. This audit does not authorize an authentication or role-model change.
- Error messages and telemetry must not expose cross-company titles, internal notes, signed URLs, or service-role details.

## Verification performed

| Check | Result | Boundary |
| --- | --- | --- |
| Phone responsive route matrix | Passed — 1 test in 1.2 minutes | `e2e/responsive-audit.spec.ts`; all five role fixtures across routes at 320, 375, 390, and 414px; main regions rendered, mobile navigation count stayed within the test limit, and no horizontal overflow was detected. |
| Tablet/landscape/localization matrix | Passed — 1 test in 48.9 seconds | `e2e/responsive-audit.spec.ts`; 1440 desktop, 1024 tablet landscape, 844 phone landscape, 768 tablet portrait; English/Chinese, light/dark, reduced motion; no overflow and accessibility assertions passed. |
| Accessibility route coverage | Passed in the related platform checkpoint | Existing `e2e/accessibility.spec.ts` and responsive a11y assertions; no new code was introduced in this audit. |
| Focused app smoke | Failed in the related platform checkpoint | `e2e/app-smoke.spec.ts:803`; onboarding overlay pointer interception blocked the mobile “Open more destinations” action. |
| TypeScript/lint/unit/migration/i18n/build | Passed in the related platform checkpoint | `pnpm check`, `pnpm lint`, 111 test files/845 tests, migration verification, i18n verification, and production build. No implementation code changed in this audit. |
| Real-user timing | Not measured | No reliable timing instrumentation or user study was available; interaction counts are documented separately without fabricated durations. |

## Audit conclusion

The current product is responsive and accessible across the tested route matrix, but it still asks users to choose between multiple overlapping ways to find work and complete decisions. The best next moves are a stabilization-aligned onboarding fix, global permission-scoped search, progressive task creation, persisted personal views, and a clear My Work/Action Centre boundary. These changes can reduce effort while preserving the current business rules and security model.
