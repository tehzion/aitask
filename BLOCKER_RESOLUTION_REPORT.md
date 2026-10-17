# Blocker Resolution Report

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)

## Executive result

The blockers were investigated systematically. The staging access problem is now explained, but not resolved: the current Supabase account has no visible membership for the documented staging project, the local CLI is unauthenticated, and no direct staging PostgreSQL credentials are configured. Docker is separately unavailable. The owner then authorized the confirmed technical remediation in production; two schema migrations were applied without changing production business rows or deploying application code.

## Blocker matrix

| Blocker | Root cause | Result | Safe next action |
| --- | --- | --- | --- |
| Staging management API | Current connector account lists only the production organization/projects; staging project is absent and direct project queries return permission denial | BLOCKED | Add the account or service identity to the staging Supabase project/organization with least-privilege project access, then re-run project/migration/schema/advisor queries |
| CLI authentication | `supabase` 2.117.0 is installed, but `projects list` returns `LegacyPlatformAuthRequiredError` because no access token/profile is configured | BLOCKED | Owner provisions a scoped CLI token through the approved Supabase login flow; never paste it into tracked files or logs |
| CLI project linkage | `supabase/.temp/project-ref` and `linked-project.json` point to production `ohjhwyiffgzyatcmmdql` | PRODUCTION-LINKED ONLY | Link a separate staging checkout to `dyaxtloducpgjoxuaszk`; do not relink the current production-linked directory for destructive tests |
| Direct PostgreSQL access | No staging database URL/password/service credential or `STAGING_*` process configuration exists | NOT TESTABLE | Provision an approved staging connection or use the authenticated Supabase connector; verify host/project identity before queries |
| Local pgTAP | Docker socket `/Users/user/.docker/run/docker.sock` is inaccessible and no local PostgreSQL server is running on port 5432 | BLOCKED | Restore Docker access or provide an authorized hosted/test PostgreSQL environment |
| Four-role sessions | Staging QA account secrets are not available in this workspace | BLOCKED | Provision/reset named staging QA accounts through the existing fixture workflow |
| Lifecycle policy | Existing code has task workflow rules but no approved project archive or member deactivation policy | OWNER DECISION REQUIRED | Approve the choices in [LIFECYCLE_DECISIONS.md](LIFECYCLE_DECISIONS.md) before schema/UI changes |
| Confirmed production technical defects | Audit history was absent and the intent-specific service-cycle RPC rejected a status already allowed by the canonical transition rules | PARTIALLY RESOLVED — PRODUCTION | Production migration aliases `20261017095621` and `20261017095628`; read-only schema, grants, trigger, and row-count checks passed. The local retention-guard migration remains unapplied pending owner approval because it changes deletion semantics. |

## Management plane versus database plane

These are distinct controls:

- Management-plane access controls project listing, project metadata, migration APIs, advisors, and CLI linkage. This session has production visibility only.
- Database-plane access controls PostgreSQL connections, SQL execution, RLS, functions, constraints, and authenticated application sessions. No staging database connection was available, so database-plane access is unverified rather than presumed unavailable.
- A publishable frontend key would not be sufficient for migration or service-role fixture work. The existing fixture script correctly requires a separate staging service credential and refuses a production URL.

## Evidence executed

- Supabase connector `list_organizations`: one visible organization, the production organization.
- Supabase connector `list_projects`: production `AiTask` is visible; documented staging project is absent.
- Supabase connector staging `get_project`, `list_migrations`, `list_tables`, and security/performance advisors: all returned permission denial.
- `SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase --help`: CLI installed and operational.
- `SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase projects list --output-format json`: unauthenticated `LegacyPlatformAuthRequiredError`.
- `supabase/.temp/project-ref`: production project ref.
- Environment inspection: no staging process variables or direct staging database credentials; production frontend variables are present locally.
- `docker info`: Docker socket permission denied.
- `pg_isready`: no local PostgreSQL server on port 5432.

## Tests completed without staging

- `pnpm check` — PASS.
- `pnpm lint` — PASS.
- Targeted workflow/concurrency regression suite — 70/70 PASS.
- Migration non-empty validation — 114 migrations PASS.
- Service-cycle compatibility fix added: the intent-specific RPC now accepts `Cancelled`, matching the canonical application/database transition matrix.
- Production migrations applied under explicit authorization: `audit_value_history` and `align_service_cycle_cancel_rpc`.
- Production read-only verification passed: history RLS/triggers/grants present, `Cancelled` accepted by the narrow RPC, and core business row counts unchanged.
- The local `20261017140000_audit_history_retention_guards_followup.sql` migration is intentionally not applied. It removes the actor FK that would mutate append-only history and restricts workspace deletion; this requires explicit retention-policy approval.

## Tests still unavailable

- Staging migration history and schema fingerprint.
- Staging RLS/grant/advisor verification.
- pgTAP against staging or a hosted test database.
- Authenticated Super Admin, Project Manager, HOD, and Staff sessions.
- Live CRUD, Storage, Realtime, notification, dashboard, historical reporting, and simultaneous-session tests.

## Required owner/operator actions

1. Grant the authorized staging operator access to project `dyaxtloducpgjoxuaszk` and its organization, or provide an approved connector identity with that project visible.
2. Provision a scoped CLI access token through the approved secret channel and stage-only database/QA credentials through CI or the fixture workflow.
3. Restore Docker access or provide an authorized hosted test database.
4. Approve lifecycle choices in [LIFECYCLE_DECISIONS.md](LIFECYCLE_DECISIONS.md).
5. Re-run the staging and concurrency gates; do not use production as a substitute.

## Final status

**TECHNICAL REMEDIATION PARTIALLY RESOLVED; RELEASE CONDITIONS NOT RESOLVED.** Production schema fixes are applied and verified, but the audit-history retention guard, lifecycle approval, and live four-role/concurrency evidence remain outstanding. Production recommendation remains **NO-GO for full release**.
