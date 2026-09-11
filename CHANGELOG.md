# Changelog

AiTask uses semantic versioning for user-facing releases. Every build also includes
its Git commit, for example `v1.5.1+d9494d6`, so deployments with the same release
number remain uniquely identifiable.

## [2.5.0] - 2026-09-11

### Improved

- Completed the Chinese interface across system navigation, task and project
  flows, company and client workspaces, service delivery views, notifications,
  feedback, empty states, accessibility labels, relative dates, and dashboard
  summaries.
- Kept Chinese date, count, status, and activity messages readable in the
  context in which they appear, including responsive client-facing screens.

## [2.3.1] - 2026-09-11

### Security and reliability

- Task-to-project links are now enforced by the guarded Supabase command API.
  A Staff or HOD member cannot attach a crafted task to another member’s hidden
  project, and the task project ID must agree with the command relationship.
- Staff and HOD members can now select their own empty project for its first
  task, while another member’s empty project remains hidden. Admin-curated and
  existing assigned-project workflows are preserved.
- Staging and tagged-release workflows now explicitly link the isolated Vercel
  project before pulling, building, and deploying it, so the authenticated role
  verification gate can run instead of being skipped by an unlinked project.

### Quality

- Added database authorization probes for crafted hidden-project links,
  project-ID/parent mismatch, and first-task creation on an owned empty project.

## [2.3.0] - 2026-09-10

### Added

- Companies is now the central client database for company profiles, contacts,
  client accounts, assigned staff, service plans, active cycles, projects, and
  related work.
- Clients is now a weekly and monthly task-and-deliverable tracker with period
  navigation, completion totals, overdue status, deadlines, team assignments,
  active service cycles, and expandable work details.
- New clients can be saved as profile-only records. After saving, administrators
  can create a project, add a service plan, or return to Companies without
  creating a login account or plan automatically.

### Changed

- “Work group” has been replaced by “Project” in creation flows. Projects now
  require an existing company, an independent project name, at least one service,
  a start date, and an optional valid deadline.
- Boss Koo and Admins can create a company from inside project creation and then
  continue the same project form with the new company selected.
- Internal task creators can select the project explicitly; the resulting task
  inherits the canonical client ID, company name, project ID, and project name.
- Company renames preserve custom project names. Only legacy project names that
  matched the old company name are kept coupled to the renamed company.
- Client workspaces now return to Companies and offer an Add service plan action
  when the company has no plan. Dashboard onboarding and navigation copy now
  distinguish the Companies database from the Clients task tracker.

### Permissions and security

- Companies access and Task Tracker access are separate permissions. Boss Koo can
  manage safe HOD role defaults and Staff/HOD overrides while account management,
  global task editing, and protected HOD identity controls remain reserved.
- New project inserts must reference a real client visible to the actor, with a
  matching canonical client ID and company name. Client-changing project updates
  receive the same database-side validation.
- Staff and HOD project creation continues to require `createProjects` and is
  limited to companies already visible to that member.

### Quality

- Added unit coverage for profile-only client creation, existing-client service
  plans, project duplicates, required client links, and rename compatibility.
- Added browser coverage for Companies → New client → Create project → Create
  task, including correct client/project inheritance, plus inline client creation.
- Added pgTAP authorization coverage for visible, hidden, and nonexistent project
  client links.

## [2.2.0] - 2026-09-07

### Changed

- Added a protected HOD role for Staff-based task ownership. HOD users can manage
  tasks they create after assignment, while ordinary Staff retain their assigned-task
  controls and Boss Koo retains unrestricted task control.
- Standard Admin users continue to see the full task list, but can edit only tasks
  they created or that are assigned to them; unrelated tasks are read-only.
- Legacy global task-editing data remains compatible but is no longer an editable
  permission for non-Boss users.

### Security

- Task ownership, creator immutability, department membership, assignment scope,
  protected-role rules, and the HOD capability version are enforced in Supabase as
  well as in the client interface.
- Existing workspaces receive the protected HOD role without automatically changing
  any member role or task ownership.

### Release

- v2.2.0 used a one-time user-authorized direct-production cutover after an
  owner-only logical backup, an exact four-migration dry run, unchanged business
  counts/hash verification, and anonymous security probes. No member role was
  assigned and no authenticated production test was performed. Later releases
  remain staging-gated.

## [2.1.5] - 2026-09-05

### Quality

- Added database-level verification for secure first-login password completion,
  including authorization, one-time workspace revision, audit history, and safe
  repeated submission.
- Added browser coverage for Account-role report isolation and persistent client
  delivery approval, plus authenticated staging coverage of the real hosted
  password form.
- Added structured hosted-login failures for invalid credentials, unapproved or
  unlinked accounts, expired sessions, and temporary workspace-load failures.
- Added coverage for email-only hosted login/recovery, Boss-only custom-role
  administration, assigned Staff service-client access, department compatibility,
  and Staff-owned task deletion.

### Release

- Pull requests now run authenticated QA against the isolated staging projects
  before merge. The tagged workflow repeats the full gate and verifies the exact
  commit deployed automatically from `master`.
- Historical direct-production exceptions were removed. Production continues to
  deploy automatically from reviewed `master` updates, as requested.
- Added a forward privilege-only Supabase migration that retires anonymous
  helper access and removes unnecessary authenticated table privileges. No
  business-record rewrite is included.
- Member invitations retain `employee`, `supplier`, and `freelancer` worker
  types, with JWT verification required for invitations and intentionally
  disabled for public feedback.
- Production release remains gated on backup/checksum verification, leaked-
  password protection, exact tag provenance, and removal of only the verified
  orphan test account. Authenticated production tests remain prohibited.

## [2.1.4] - 2026-09-04

### Fixed

- Staff deliverable completion can now save its automatically derived service-
  cycle status together with `publishedAt`, preventing valid progress updates
  from failing at the database boundary.
- Manual cycle publication and unrelated service-cycle field changes remain
  rejected for Staff users.

### Security

- Completes the production rollout of the Staff command-authorization boundary
  introduced in v2.1.3, using the immutable v2.1.3 migration followed by a
  narrowly scoped forward correction. No business-data transformation is
  included.

### Release

- v2.1.4 uses an exact one-time direct-production gate after verified logical
  schema and data backups, an exact two-migration dry run, production migration
  verification, and unchanged business-data checks. Authenticated production
  testing remains disabled. All later tags remain staging-gated.

## [2.1.3] - 2026-09-03

### Security

- Hardened Staff command authorization at the database boundary: Staff may
  create work only for themselves (or with the edit-tasks capability), may
  update only execution fields on service records, and may emit only canonical
  task-linked notifications. Task-deletion notifications are generated
  server-side; standalone or off-target Staff notifications are rejected.
- The authorization migration was validated in the tagged release gate's
  disposable database suite; its production rollout is completed by v2.1.4.

### Added

- Service catalog end-to-end coverage: creating a task workflow template, using
  it in a package, and the delete guard for frozen workflows.
- Boss overview "Monthly deliverables" and the registration approval flow are
  now asserted by the smoke suite.

### Changed

- Service package and workflow template managers are fully translated to
  Simplified Chinese and route saves through the unified save-retry path.

## [2.1.2] - 2026-09-02

### Fixed

- Saving now follows one recovery path across client setup, companies, tasks,
  schedule changes, and the shared sync controls.
- Interrupted saves can rebuild the same typed operation when no retained
  command is available, avoiding duplicate client, plan, company, or task work.
- Retry keeps the original backend error visible instead of replacing it with a
  misleading "no retained change" message.

### Changed

- Later releases use the staging-first tagged production gate; the historical
  v2.1.1 direct-production exception has been removed.
- v2.1.2 was itself released through a one-time direct-production gate because
  the isolated staging environment was not yet provisioned. It performs no
  database migration and no authenticated production test; the exception does
  not apply to any later tag.
- v2.1.3 also uses the one-time direct-production gate because staging is still
  not provisioned. This release **does** include a database migration (the staff
  command authorization hardening); it is validated in the disposable-stack
  pgTAP gate before the release proceeds, and no authenticated production test
  is performed. The exception does not apply to any later tag.
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
