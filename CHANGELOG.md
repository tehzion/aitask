# Changelog

AiTask uses semantic versioning for user-facing releases. Every build also includes
its Git commit, for example `v1.5.1+d9494d6`, so deployments with the same release
number remain uniquely identifiable.

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
