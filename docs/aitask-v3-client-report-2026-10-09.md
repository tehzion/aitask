# AiTask v3.0 — Client Feature and Improvement Report

**Report date:** 9 October 2026

AiTask v3 brings clearer delivery visibility, more dependable daily workflows,
and improved reporting for clients and the team serving them. The update
consolidates task management, company records, service plans, delivery reviews,
and role-based workspaces into a more consistent experience.

## Features available in v3

| Feature | What it provides | Benefit |
| --- | --- | --- |
| Client workspace | Home, Services, Deliveries, delivery tracking, and Reports in one workspace. | Review service progress and outstanding actions more easily. |
| Delivery review and approval | Feedback, approval notes, review history, and a full count of pending reviews. | Understand what needs attention and keep a record of decisions. |
| Service plan and cycle visibility | Current delivery progress follows the selected plan and current delivery period; past and upcoming cycles remain available. | Separate today's commitments from future planning. |
| Delivery tracking and search | Search and period filters narrow the displayed work and recalculate totals. | Find relevant work and assess its progress without misleading totals. |
| Client reports and CSV exports | Completion dates, client approval dates, review stages, and an explained on-time completion metric. | Distinguish agency delivery performance from the timing of client approval. |
| Company and project management | Linked company profiles, project identity, ownership, contacts, service plans, and editable lifecycle dates. | Keep operational records connected and easier to maintain. |
| Role-based workspaces | Project Managers work across their portfolios, HODs coordinate department work, and Staff focus on assigned responsibilities. | Give each team member a clearer view of the work they manage. |
| English and Simplified Chinese interface | Broader translation coverage across navigation, forms, statuses, notifications, and reporting. | Support everyday work in the preferred interface language. |

## What we improved

### More reliable saves and recovery

Task edits, company changes, approvals, and feedback retain drafts more
consistently when a save is interrupted. Retry and reload recovery also protect
newer edits made while a previous request is still completing. Mixed saves keep
their ordered changes together, and uncertain responses are reconciled with
saved results to reduce duplicate actions and unnecessary re-entry.

Company deletion and ownership updates have improved recovery and clearer
handling of uncertain outcomes. Success messages follow confirmed results.

### Clearer client reviews

Delivery details opened from the tracker use the same review experience as the
Deliveries page. Feedback and approval notes are validated before submission,
and recoverable drafts are scoped to the relevant account and delivery.
Outstanding reviews remain visible across reporting periods.

Client-facing stage labels now reflect the review process. Reports and CSV
exports separate agency completion from client approval, and client exports
exclude internal assignee and department details.

### More accurate dashboards, dates, and reporting

Overdue totals and their linked work lists follow a consistent rule: completed
and cancelled tasks are excluded, and invalid deadlines do not count as overdue.
Staff metrics follow assigned work and stable company identities.

Daily views, calendars, workload figures, renewal summaries, and delivery
tracking refresh at local midnight and when an inactive tab resumes. Calendar
validation rejects impossible deadlines, while plan, project, and add-on date
defaults use local dates. Current delivery summaries keep the current period
visible when future cycles are published.

### Better team coordination and administration

Project Manager portfolio management, task reassignment, HOD delegation, and
Staff task updates have more consistent permissions and save behavior. Dependency
warnings help identify blocked work while respecting access boundaries.

Administrators can manage default role permission templates, with protected
account-management controls reserved for the Super Admin. Permission refreshes
are handled more carefully during active edits. Notifications are directed to
the relevant recipients rather than unrelated team members.

Member onboarding now records a stable request and saves membership, registration
approval, and worker type together. Recovery preserves prepared accounts when a
successful response is lost, reducing the risk of onboarding leaving an account
without a working login.

### A smoother everyday interface

Search behavior, responsive reporting, keyboard navigation, touch controls, and
Simplified Chinese coverage are more consistent. The installable web app has
improved recovery from stale files after an update. Startup code loads selected
features on demand, and the current build passes the existing bundle-size limits.

## Validation performed

- The current source build passed TypeScript compilation, bundle-size checks,
  and static installable-web-app checks.
- Supabase rollout validation passed 578 database assertions, plus real local
  Storage, authenticated Staff/HOD saves, and onboarding recovery checks.
- The hosted database passed 15 onboarding assertions. Anonymous access
  restrictions and invitation endpoint JWT rejection checks passed.
- Existing production member and workspace data matched the rollout baseline.

## Recommended first use

1. Open the Client workspace and review the pending delivery count.
2. Check the current service plan and delivery period.
3. Submit feedback or approval from the delivery review panel.
4. Use Reports to compare recorded completion and approval dates, or export CSV.
5. For internal teams, review portfolio or department queues and role permissions.

V3's practical focus is dependable daily work: clearer responsibilities,
less re-entry after interrupted saves, and delivery information that is easier
to review and act on.
