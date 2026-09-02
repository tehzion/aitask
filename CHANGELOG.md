# Changelog

AiTask uses semantic versioning for user-facing releases. Every build also includes
its Git commit, for example `v1.5.1+d9494d6`, so deployments with the same release
number remain uniquely identifiable.

## [2.1.2] - 2026-09-02

### Fixed

- Saving now follows one recovery path across client setup, companies, tasks,
  schedule changes, and the shared sync controls.
- Interrupted saves can rebuild the same typed operation when no retained
  command is available, avoiding duplicate client, plan, company, or task work.
- Retry keeps the original backend error visible instead of replacing it with a
  misleading "no retained change" message.

### Changed

- Later releases now use only the staging-first tagged production gate; the
  historical v2.1.1 direct-production exception has been removed.
- No database migration or public API change is included in this release.

## [2.1.1] - 2026-08-27

### Added

- Client Workspace 2.0: approval-first Home, Deliveries, Delivery Focus, and
  simplified service views for client users.
- Action-first role workspaces: focused queues and task actions for staff,
  account, operations, production, and administrative teams.
- Build provenance at `/build-info.json`, exposing only the release version,
  Git commit, build channel, and build time for deployment verification.

### Security

- Client-read privacy hardened so client views remain scoped to their company
  and exclude internal task-chain details, revision counters, and private
  comments or approvals.
- Service commands now enforce permission checks consistently, and pending edits
  are retained during safe refresh and retry recovery.

### Changed

- Client delivery, approvals, and staff workspaces were refined for clearer use
  on mobile screens and expanded Simplified Chinese coverage.
- This release ships the audited v2.1.0 feature candidate through a one-time,
  user-authorised production-branch exception. No database migration is included.

## [2.1.0] - 2026-08-27 (superseded release candidate)

### Added

- Client Workspace 2.0: approval-first Home, Deliveries, Delivery Focus, and
  simplified service views for client users.
- Action-first Staff workspace: My work and All work queues, focused task
  actions, and mobile-friendly navigation.
- Build provenance at `/build-info.json`, exposing only the release version,
  Git commit, build channel, and build time for deployment verification.

### Security

- Client-read privacy hardened so client projections exclude internal task-chain
  details, revision counters, and private comments or approvals.
- Service commands now enforce permission checks consistently, and pending edits
  are retained during safe refresh and retry recovery.

### Changed

- Boss and account workbenches, approvals, client delivery pages, and Simplified
  Chinese coverage were refined for clearer day-to-day operation.
- Production releases are governed by the tagged-release workflow and verified
  against their published build provenance.

## [2.0.0] - 2026-08-21

### Added

- Service operations workspace: client service plans, monthly cycles,
  deliverables with frozen task-chain workflows, add-ons, and pricing snapshots
  (announced in-app through the versioned "2026-08-service-operations" notice).
- Backend capability handshake (`aitask_get_backend_capabilities`): the app
  fails closed into a read-only "system update" state until the deployed schema
  exposes the required RPCs; pending edits survive tab reloads.
- Workspace-level optimistic lock: commands carry an expected workspace version;
  conflicts self-heal by reapplying the retained change on the latest workspace.
- Sign-out now confirms before discarding a pending change, and per-account
  pending commands are preserved across account switches.

### Security

- Supabase rollout hardened: five-argument command overloads without defaults,
  fail-closed data backfill, preflight/postflight SQL gates, and a migration
  repair manifest reviewed against production fingerprints
  (`docs/production-rpc-mismatch-recovery.md`).

### Changed

- Client portal dashboard: briefing chips (review/overdue/due soon), calm-token
  styling, overdue-first deliveries, and full Simplified Chinese coverage with
  strict user-content protection.
- Sync surfaces (badges, banner actions, state messages) translated to Chinese;
  command size capped at 500 operations with storage-quota warnings.

## [1.6.x] - 2026-07-15 → 2026-08-16

### Security

- Hardened staff data visibility: client contact details, workbench metrics, and
  assignable-company lists are scoped to a staff member's own work.
- Registration dedup, phone validation, approval email/phone retention, local
  password verification, and fail-closed demo-login defaults.
- Sanitized persisted-workspace rehydration; quota-safe storage; collision-proof ids.
- Conflict rebase preserves other users' edits; pull refresh no longer clobbers
  concurrent local changes; retained commands survive re-login.
- Supabase: guard trigger exemptions for `mustResetPassword`, credential-like string
  scanning, anon write probes, and cutover guidance in schema docs.

### Added

- Keyboard day selection and Monday-first weeks on the calendar.
- Client-visibility selector when creating tasks.
- Theme-aware charts, synced sound preference, searchable URL filters.

### Changed

- Task details modal: accessible form, submit guards, comment polish.
- Toasts capped at three, notification queue capped, sync banner polish.
- Login/registration accessibility (h1/main landmark), demo password column hidden.

## [1.5.1] - 2026-07-15

### Added

- Live Supabase freshness, conflict handling, and per-user notification reads.
- Client directory, contact profiles, scoped client portal, feedback, and approvals.
- Calendar task creation, drag-to-reschedule, custom clients, projects, and services.
- Profile photo uploads, account settings, PWA installation, and offline messaging.
- Permission-aware task, project, and assigned-client management.

### Security

- Supabase Auth sessions, identity-based RLS, hardened browser headers, URL validation,
  and stored-XSS protections.
- Staff task visibility is limited to directly assigned work unless an administrator
  grants `viewAllTasks` or `editTasks`.

### Changed

- Staff clients and projects are derived from tasks they are allowed to see.
- The responsive interface, dashboard, task lists, creation flows, and sync status
  were polished for desktop and mobile use.
