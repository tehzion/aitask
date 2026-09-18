# Boss Koo + base Staff UI/UX audit — 18 September 2026

## Scope and outcome

Audit target: current working tree, covering Boss Koo’s super-admin experience and the default Staff role. HOD/custom Staff roles, backend-only authorization, and production integrations are out of scope.

Overall assessment: the role split is directionally strong. Staff receives a focused, action-first workbench and Boss Koo receives operational oversight with dashboard tabs. The main usability blocker is the Staff work-discovery route: `/tasks` redirects to the client delivery tracker, so the dedicated Staff “All work” screen is not reachable through the application router.

## Strengths

- Staff gets a clear “My work” starting point with a next-action hero, assigned queue, progress, due dates, revisions, blockers, and delivery context.
- Boss Koo has distinct Overview, Agency pulse, and Team workload views instead of one undifferentiated dashboard.
- Shared controls generally meet the 44px touch-target pattern, use visible labels, and expose status text in addition to color.
- Mobile navigation includes focus management, an inert background, Escape handling, and a bounded tab loop. The targeted axe/overflow check passed.
- The Staff task sheet includes a labeled status control, progress semantics, dependency messaging, read-only gating, comments, and history.

## Prioritized findings

### P0 — Staff “All work” is unreachable and key links land in the wrong workspace

Evidence:

- [`TasksRedirect`](/Users/user/Downloads/aitask-master/src/App.tsx:57) redirects every `/tasks` request to `/clients` and only preserves `search`, `client`, and `taskId`.
- [`StaffAllWork`](/Users/user/Downloads/aitask-master/src/components/StaffAllWork.tsx:87) contains the intended “All work” queue, but no mounted route renders it because the router uses `TasksRedirect`.
- The Staff dashboard’s “All work” link points to `/clients?period=all` in [`StaffMyWork`](/Users/user/Downloads/aitask-master/src/components/StaffMyWork.tsx:101), which opens the client delivery tracker rather than the Staff queue.

Impact: base Staff cannot reliably access the visible-work queue, and deep links such as `/tasks?period=today` lose their period filter. The UI, router, and E2E expectations describe three different mental models: “All work”, “Clients”, and “Delivery tracker”.

Recommended behavior:

- Make `/tasks` the canonical Staff work route and render `StaffAllWork` for base Staff.
- Keep `/clients` reserved for the delivery tracker.
- Preserve supported task query parameters when handling legacy links.
- Use one Staff navigation label, “All work”, for the queue entry and reserve “Clients” for client/delivery tracking.

Acceptance checks:

- Staff opening `/tasks` sees the `All work` heading, queue tabs, search, and filters.
- `/tasks?taskId=…` opens the Staff task sheet; `/tasks?period=today` retains its filter.
- The Staff dashboard’s `All work` link lands on the same queue.
- Desktop, 390px mobile, light/dark, and Chinese Staff flows pass without horizontal overflow.

### P1 — Boss Koo’s task triage cards do not preserve their stated context

Evidence: the Boss dashboard’s `Overdue tasks` and `Waiting approval` cards both link to the unfiltered `/clients?period=all` route in [`Dashboard.tsx`](/Users/user/Downloads/aitask-master/src/pages/Dashboard.tsx:530).

Impact: clicking a high-priority operational signal does not show the corresponding subset. Boss Koo must manually rediscover the overdue or approval state, weakening the dashboard’s triage value.

Recommended behavior: encode the intended filter in the destination or route to a task queue with the filter already applied. Preserve the active filter in the page heading and provide a clear reset action.

Acceptance checks:

- `Overdue tasks` opens a list containing only overdue open work.
- `Waiting approval` opens only tasks awaiting approval.
- Empty filtered states explain that no matching work exists and offer a path back to all work.

### P1 — Role and permission management lacks an effective-access review step

Evidence: [`Roles & Permissions`](/Users/user/Downloads/aitask-master/src/pages/Approvals.tsx:919) combines role creation, default-role definitions, member assignment, and permission editing. The member editor offers “Use role defaults” or “Custom access” but does not show an effective-access summary or before/after change set ([`Approvals.tsx`](/Users/user/Downloads/aitask-master/src/pages/Approvals.tsx:1368)).

Impact: Boss Koo is asked to reason across base role, custom role, department scope, and direct overrides without a single explanation of what the member can actually see or do. This increases accidental over-granting and makes permission changes hard to review.

Recommended behavior: add an effective-access preview showing source role, direct overrides, visible pages, task scope, and high-impact actions. Before saving, show a compact diff of added and removed capabilities.

Acceptance checks:

- Selecting a member shows effective access in plain language, not only raw checkbox state.
- Resetting to role defaults clearly lists which overrides will be removed.
- Saving a change confirms the affected member, changed capabilities, and resulting role state.

### P2 — Boss Koo’s active-user management is not mobile-first

Evidence: pending registrations have a mobile-card presentation, but Active System Users remains a wide five-column table inside `overflow-x-auto` in [`Approvals.tsx`](/Users/user/Downloads/aitask-master/src/pages/Approvals.tsx:1145).

Impact: on a 390px viewport, identity, role, contact, and actions are separated by horizontal scrolling. The most important action controls are icon-only and visually distant from the member identity.

Recommended behavior: use responsive member cards or a row disclosure pattern on small screens. Keep the member name, effective role, and primary action visible in the first viewport; place secondary actions in a labeled menu.

Acceptance checks:

- No horizontal scrolling is required to identify a member or change their role.
- Department, permission, and delete actions retain accessible names and visible focus.
- Search and role filters remain available above the mobile list.

### P2 — Boss portfolio monitoring silently caps discoverability at 50 rows

Evidence: the Client & project monitor renders `portfolioRows.slice(0, 50)` and only displays a “Showing the first 50 entries” note in [`Dashboard.tsx`](/Users/user/Downloads/aitask-master/src/pages/Dashboard.tsx:596).

Impact: larger workspaces cannot find or inspect later companies/projects from the dashboard, with no search, pagination, or direct count-to-result relationship.

Recommended behavior: add search plus pagination/load-more, or make the monitor a summary that links to a full searchable workspace. Keep the total result count visible.

Acceptance checks:

- Boss Koo can locate an entry beyond the first 50 without leaving the dashboard blind.
- The UI states total results and current range.
- Loading more does not shift the table header or lose the owner filter.

### P2 — High-impact confirmations use inconsistent native browser dialogs

Evidence: registration approval/rejection, role deletion, and task dependency overrides call `window.confirm` in [`Approvals.tsx`](/Users/user/Downloads/aitask-master/src/pages/Approvals.tsx:149) and [`StaffTaskFocus.tsx`](/Users/user/Downloads/aitask-master/src/components/StaffTaskFocus.tsx:77).

Impact: the browser prompt is visually disconnected from the product, provides limited context, and makes the interaction harder to validate on mobile or in localized flows.

Recommended behavior: use the existing modal primitives for destructive and dependency-override confirmations. State the affected user/task, consequence, and exact primary action; preserve keyboard focus and return focus after dismissal.

Acceptance checks:

- Confirmation dialogs have an accessible name, consequence summary, Cancel, and explicit primary action.
- Escape and outside-click behavior match the action risk.
- The dialogs work in light/dark and English/Chinese without clipped text.

## Verification record

- Passed: `role-ux-stabilization.spec.ts` Boss and Staff queue keyboard-tab flow.
- Passed: `role-ux-stabilization.spec.ts` Staff collapsed-navigation mobile check, including axe scan and no horizontal overflow.
- Failed/blocked: the isolated Staff workbench flow was not green. One run stopped at the release notice during setup; an earlier run that dismissed the notice reached the expected `All work` assertion and failed because `/tasks` did not render the Staff queue.
- Existing Staff visual snapshots were not replaced. They represent a different navigation state than the current router and should be updated only after the route/IA decision is implemented.
- No application source, backend, or existing user changes were modified by this audit; this report is the only audit artifact added.
