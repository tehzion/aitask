# Supabase Handover — AiTask

> Historical pre-release snapshot. The three pending migrations and two edge functions were deployed on 2026-10-17; see [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) and the migration alias manifest for verified live versions and limitations.

**Prepared:** 2026-10-17 · **Project ref (production):** `ohjhwyiffgzyatcmmdql` (from `migration_repair_manifest.review.json`)

## 0. Current follow-up status — 2026-10-17

This document contains historical rollout notes, but the following status supersedes its older pending-migration and access assumptions for the current release gate:

| Check | Result | Evidence |
| --- | --- | --- |
| Supabase management access | **Staging blocked** | The connected account lists only the production organization `vercel_icfg_ntT6WWmEZtbeszivo9KBzcf3` and projects `ohjhwyiffgzyatcmmdql` / inactive `aweyluvuvydbwdanodqe`; documented staging project `dyaxtloducpgjoxuaszk` is not listed and direct project queries return permission denial. |
| CLI authentication | **Blocked** | Repository CLI `2.117.0` is installed, but `supabase projects list --output-format json` returns `LegacyPlatformAuthRequiredError: Access token not provided`. No token was supplied or created during this follow-up. |
| CLI linkage | **Production only** | `supabase/.temp/project-ref` and `linked-project.json` point to `ohjhwyiffgzyatcmmdql`; no staging link exists. |
| Direct staging PostgreSQL access | **Unavailable** | No `STAGING_SUPABASE_DB_URL`, database password, service credential, or `STAGING_*` process configuration is available in this workspace. A direct database permission test was therefore not attempted. |
| Production technical remediation | **Applied and verified** | `20261017095621 audit_value_history` and `20261017095628 align_service_cycle_cancel_rpc` were applied to `ohjhwyiffgzyatcmmdql`. Read-only checks confirmed the table/RLS/triggers/grants and `Cancelled` RPC support; no production business rows changed. |
| Audit-history retention guard | **Pending approval** | Local `20261017140000_audit_history_retention_guards_followup.sql` prevents member deletion from mutating immutable history and restricts workspace deletion. It is not applied because it changes deletion/retention semantics and requires owner approval. |
| Production safety | **Preserved** | The production URL in local environment files was not used for destructive, role-authenticated, or migration tests. |

The root cause is an authorization/configuration gap, not evidence that the staging database is unavailable: the current Supabase account lacks visible project membership for staging, the CLI has no management access token, and the workspace has no direct staging connection configuration. Restore staging project membership and provision scoped staging credentials before rerunning the release gates.

---

## 1. Database architecture

- **Schema:** `public` (app tables) + `private` (helpers/triggers).
- **Core tables:** `aitask_workspaces`, `aitask_members`, `aitask_entities` (polymorphic), `aitask_feedback_submissions`, `aitask_command_receipts`, `aitask_audit_events`, `aitask_task_deadline_reminders`, `aitask_feedback_rate_limits`, plus `private.aitask_internal_review_decisions` / `private.aitask_member_onboarding`.
- **Polymorphic model:** `aitask_entities` discriminates by `entity_type` (`task, project, client, service_package, client_plan, service_cycle, deliverable, cycle_comment, addon, service_workflow_template, service_pricing_snapshot, custom_role, notification`) with `data jsonb` + denormalized `parent_id/client_key/assigned_to/created_by/target_*`.
- **Constraints:** `members.auth_user_id UNIQUE → auth.users SET NULL`; `members.role CHECK`; `entities.entity_type CHECK`; partial unique indexes (one-active-plan, one-cycle-per-period); feedback unique `(campaign, lower(email))`.
- **Soft FKs:** `parent_id/assigned_to/created_by/client_id/plan_id/cycle_id` have **no FK** — enforced by triggers + app cleanup (accepted design).
- **Functions/triggers (all SECURITY DEFINER, `SET search_path = ''`):** `aitask_has_permission`, `aitask_can_view_task/edit_task/view_client/edit_client/view_project`, `aitask_guard_member_update` (blocks self-escalation), `aitask_guard_entity` (secret-key block + admin-only client rename + denormalization), `aitask_guard_service_status`, `aitask_guard_task_stage_progress`.

## 2. RLS

- RLS enabled on every app table; **no `USING (true)` / `WITH CHECK (true)`**.
- No `anon` policies on secure tables (legacy `aitask_app_state` revoked by cutover migrations).
- `aitask_entities` SELECT/INSERT/UPDATE/DELETE gated per entity type by `aitask_can_*`/`aitask_is_admin`.
- Writes primarily via `aitask_execute_command` (re-checks authorization internally); no RPC relies on RLS alone.
- Super Admin = `is_super_admin` flag; not an automatic bypass of every constraint (member/entity policies still evaluated, but `aitask_can_*`/`aitask_has_permission` short-circuit true for super admin).

## 3. Migrations

- **Current repository:** 114 non-empty migration files (`pnpm verify:migrations` green in the follow-up workspace).
- **Production verified through** `20261016150000_service_transition_guard` (prod alias `20261016153759`) per `manifest.auditP0P1ProductionRollout`.
- **Pending (NOT applied to production):**
  1. `20261016160000_pm_client_scope_and_ownership` — **P1 security** (closes PM cross-company rename/edit/delete/re-own in the SECURITY DEFINER service RPC; adds `BEFORE UPDATE/DELETE` ownership-freezing trigger). pgTAP: `supabase/tests/database/pm_client_scope_and_ownership.test.sql`.
  2. `20261016170000_department_scoped_visibility_cleanup` — strips `viewAllTasks`/`viewAllClients` from dept-scoped roles/members.
- **Apply order:** filename order (`supabase db push`). Both are data-only/trigger changes — **no destructive operations, no backfill required** beyond the trigger freezing `client.createdBy`.
- **Do not assume migration files are applied** — verify against the linked project's `supabase_migrations.schema_migrations` before treating a migration as deployed. Use the documented preflight/backup gate (`docs/production-rpc-mismatch-recovery.md`).

## 4. Realtime & sync

- Publication tables: `aitask_entities`, `aitask_members`.
- Client subscribes **only** to member-access changes (`aitask-member-access:{authUserId}` channel, `postgres_changes` filtered by `auth_user_id`).
- Entity-data consistency relies on **15 s polling + focus/visibility/online** reconciliation (documented, acceptable).

## 5. Edge functions

| Function | JWT | Deploy state |
| --- | --- | --- |
| `invite-aitask-member` | `verify_jwt=true` | needs redeploy (request-parse guard + CORS allowlist replaces wildcard; set `AITASK_ALLOWED_ORIGINS`) |
| `aitask-feedback` | `verify_jwt=false` (service-role key) | needs redeploy (results-branch rate limit) |

## 6. Environment variables (names only — never store values here)

- **Frontend (Vercel):** `VITE_AITASK_BACKEND`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AITASK_SHOW_DEMO_LOGIN`, `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS`.
- **Edge functions:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AITASK_PUBLIC_URL`, `AITASK_ALLOWED_ORIGINS`, `AITASK_FEEDBACK_REVIEWER_EMAILS`.
- **Staging (separate):** `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_PROJECT_REF`.

## 7. Known risks

- Base `secure-auth-schema.sql` alone is unscoped for PM — **must deploy with full migration chain**.
- `service_role` retains `SELECT, UPDATE` on `aitask_members`.
- 4-arg RPC overloads bypass workspace-level version lock.
- No scheduled backups (Free plan); last logical backup verified 2026-09-04 (`manifest.backupRestoreEvidence`).
