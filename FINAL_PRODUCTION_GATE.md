# Final Production Gate

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)

> Current evidence update: the full Playwright suite and disposable local Supabase rollout have now completed successfully. This document's earlier historical notes are retained for traceability; the current release decision and exact evidence are in [PRODUCTION_DEPLOYMENT_REPORT.md](PRODUCTION_DEPLOYMENT_REPORT.md) and [P1_REMEDIATION_REPORT.md](P1_REMEDIATION_REPORT.md).

## Decision

**NO-GO for full production promotion.** The two confirmed technical schema fixes were applied to production under explicit owner authorization and verified read-only. Local verification is now complete for the full browser suite and disposable database rollout, but production promotion remains blocked because the retention/deletion policy is not explicitly approved, the repository is two migrations ahead of production, fresh backup/recovery evidence is unavailable, and Vercel environment metadata could not be read. No production mutation or deployment was performed in this release-preparation turn.

Detailed blocker evidence is recorded in [BLOCKER_RESOLUTION_REPORT.md](BLOCKER_RESOLUTION_REPORT.md); lifecycle choices are recorded in [LIFECYCLE_DECISIONS.md](LIFECYCLE_DECISIONS.md). The current append-only release state is [aitask_release_manifest_20261017_followup.json](supabase/preflight/aitask_release_manifest_20261017_followup.json); the earlier manifest remains immutable historical evidence.

## Gate results

| Gate | Result | Evidence |
| --- | --- | --- |
| Lifecycle policies approved | BLOCKED | Project/archive, member deactivation/reactivation/deletion, client archive/deletion, and historical-reporting choices remain owner decisions. See [LIFECYCLE_DECISIONS.md](LIFECYCLE_DECISIONS.md). |
| Staging environment verified | BLOCKED | Project `dyaxtloducpgjoxuaszk` is absent from the connected account's project list; direct `get_project` returns permission denial. No staging URL, service credential, QA secrets, or database connection is available locally. The isolated fixture harness exists in `scripts/reset-staging-qa.mjs` and refuses production URLs, but could not be run. |
| Supabase migration state | BLOCKED — repository parity | The production project is `ohjhwyiffgzyatcmmdql` and has 112 recorded migrations through connector aliases `20261017095621` and `20261017095628`. The repository has 114 non-empty migrations; `20261017091031_workspace_revision_realtime` and the unapproved `20261017140000_audit_history_retention_guards_followup.sql` remain pending. Local rollout passed, but local success is not proof of production compatibility. |
| RLS security | NOT VERIFIED | Production catalog review confirms RLS/grants and no anonymous execution for reviewed RPCs, but authenticated Super Admin, Project Manager, HOD, and Staff row-boundary tests were not executed. |
| Concurrency | NOT VERIFIED | Local optimistic-version, lock, idempotency, and conflict tests exist; no live simultaneous authenticated sessions were available. |
| Realtime | NOT VERIFIED | Source and migration coverage exists, but live subscription delivery and reconnect behavior were not exercised. |
| Storage | NOT VERIFIED | Storage policies and source checks exist, but authenticated upload/download/cross-scope/delete/signed-URL tests were not executed against an isolated environment. |
| Dashboard accuracy | NOT VERIFIED | Local canonical selector tests exist; no live database-to-dashboard comparison or large-data profile was run. |
| Notifications | NOT VERIFIED | Local recipient/idempotency logic is covered; live persistence, recipient routing, and cross-role visibility were not verified. |
| Leaked-password protection | BLOCKED — plan limitation | Production organization is on the Free plan. Supabase documentation states leaked-password protection is available on Pro and above. The application enforces 12-character passwords, current-password reauthentication for changes, and reset-onboarding controls, but these do not replace breached-password screening. |
| Security-definer review | PASS — reviewed, no removal applied | All 19 advisor-flagged authenticated RPCs are owned by `postgres`, use `search_path = ''`, deny anonymous execution, and either authenticate directly or delegate to guarded internal/service functions. No function was changed merely to silence the advisor. Detailed evidence is in [SUPABASE_SECURITY_REVIEW.md](SUPABASE_SECURITY_REVIEW.md). |
| Production build | PASS | Safe hosted build passed with `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false`; the unsafe `true` value is rejected as intended. PWA and bundle-budget checks also passed; only non-fatal Browserslist/chunk-size warnings remained. |
| Regression tests | PASS — local scope only | Full Playwright E2E: 324 passed, 0 failed, 0 skipped, 0 interrupted. Unit suite: 107 test files / 830 tests passed. `pnpm check`, `pnpm lint`, and 114-file migration validation passed. This does not substitute for unavailable live gates. |

## Issues discovered and fixes

### Applied production technical fixes

The following migrations were applied to production project `ohjhwyiffgzyatcmmdql` through the authorized Supabase migration path:

- `20261017095621 audit_value_history` — adds append-only entity/member history with actor snapshots, before/after values, changed fields, command correlation, RLS, and authenticated read-only access.
- `20261017095628 align_service_cycle_cancel_rpc` — aligns the intent-specific service-cycle RPC with the existing canonical transition matrix so `Cancelled` is accepted where the application and trigger already permit it.

Read-only post-apply evidence:

- `aitask_entity_history` exists with RLS enabled.
- History and member/entity triggers exist, including the append-only guard.
- Authenticated role has `SELECT` on history but not `INSERT`, `UPDATE`, or `DELETE`.
- The narrow service-cycle RPC contains `Cancelled` and remains executable by `authenticated`.
- Core production row counts remained unchanged: workspaces 1, members 11, entities 1,863, audit events 2,340, command receipts 1,498, reminders 11; new history rows are 0 because the migration is prospective.

The local `20261017140000_audit_history_retention_guards_followup.sql` migration remains pending. It removes the member foreign key that would mutate immutable history on member deletion and changes workspace history linkage to `ON DELETE RESTRICT`. It is technically sound as a retention safeguard, but its deletion semantics require explicit owner approval before production application.

### Fixed: service-cycle cancellation RPC mismatch

The frontend transition matrix and database trigger allowed `Draft → Cancelled` and `Published → Cancelled`, but the intent-specific `aitask_set_service_cycle_status` RPC rejected `Cancelled`. A forward migration now accepts the canonical status set, and `service_transition_guard.test.sql` covers the narrow RPC path.

Evidence:

- [20261017130000_align_service_cycle_cancel_rpc.sql](supabase/migrations/20261017130000_align_service_cycle_cancel_rpc.sql)
- [service_transition_guard.test.sql](supabase/tests/database/service_transition_guard.test.sql)

### Fixed: production build compilation blocker

The current worktree had removed the `useI18n()` import and hook from `ToastItem` while retaining its use for the close-button label. `pnpm build` failed with `TS2304: Cannot find name 't'`. The hook was restored; the production build now passes.

### Reviewed: Supabase security-definer notices

The 19 WARN findings are authenticated application RPCs, not anonymous endpoints. The live catalog review confirmed `postgres` ownership, `search_path = ''`, `anon_execute = false`, and authorization checks either in the function or in the guarded function it delegates to. Removing `SECURITY DEFINER` would break the intended RLS-bypassing command boundary and was not justified by the advisor alone. The remaining review item is operational monitoring of these RPCs, not an unverified blanket privilege change.

### Still open: member deactivation policy

Current behaviour hard-deletes the member directory row and unassigns active tasks. Historical snapshots retain evidence, but ordinary directory/report views lose the former member’s current name and there is no reactivation flow.

### Still open: project/client archive policy

Projects do not have an archive state. Project deletion removes the project from the operational projection and detaches tasks. Client deletion is a destructive cascade. The immutable history layer is forensic evidence, not an operational archive.

### Verification blocker: staging access

The Supabase connector can list only the production project available to this account. All read-only calls against the documented staging project returned `You do not have permission to perform this action`. The repository CLI is installed but `supabase projects list --output-format json` returned `LegacyPlatformAuthRequiredError` because no access token is configured. The local Supabase link points to production, and no direct staging database credentials are configured. The local environment also contains production Supabase settings, so it was intentionally not used for destructive or role-authenticated testing.

The earlier Docker access block was resolved for this turn. The disposable Supabase rollout completed with 67 database test files and 1,032 pgTAP assertions, schema lint/advisor checks, storage, onboarding, service-command, staff-save, workflow, and HOD checks passing. This remains local evidence only.

## Decisions requiring business-owner approval

These choices materially change historical visibility and operational behaviour; they were not implemented because the repository does not establish a single approved policy.

### Member lifecycle

**Option A — deactivation/tombstone (recommended for historical accuracy):** retain the member row with `is_active`, `deactivated_at`, and `deactivated_by`; block new login, assignment, and approval authority; preserve historical display identity; allow Super Admin reactivation.

**Option B — irreversible removal:** keep hard deletion and unassignment, rely on immutable history-only lookup, and explicitly accept that ordinary reports cannot resolve the former member without an archive query.

### Project/archive lifecycle

**Option A — reversible archive:** add archive metadata, keep project/tasks/approvals read-only in an authorized archive view, exclude archived work from active dashboards, and require an explicit authorized reopen action.

**Option B — retain deletion semantics:** keep project deletion/detachment and client cascade, relying on history-only reconstruction with documented retention and privacy rules.

The owner must also specify whether archiving requires all tasks to be terminal, whether reopened projects restore editability for all linked tasks, and which roles can archive/reopen. Those are not safely inferable from the current requirements.

## Tests executed

- `pnpm check` — PASS.
- `pnpm lint` — PASS.
- `pnpm build` with the hosted bypass disabled — PASS; the bypass-enabled hosted build fails closed as intended.
- `pnpm test:e2e --reporter=line` — 324 passed, 0 failed, 0 skipped, 0 interrupted.
- `pnpm exec vitest run src --maxWorkers=1 --reporter=dot` — 107 test files and 830 tests PASS.
- `pnpm verify:supabase:rollout` — PASS: 67 database files and 1,032 pgTAP assertions, plus schema/advisor, storage, onboarding, service-command, staff-save, workflow, and HOD checks.
- `pnpm exec vitest run src/store/taskStageProgress.test.ts src/store/monthlyServiceCycles.test.ts src/store/serviceCatalog.test.ts src/store/mixedSaveRecovery.test.ts src/store/sessionIntegrity.test.ts src/store/hodCrossRoleSync.test.ts --reporter=dot` — 6 files, 70 tests PASS.
- `node scripts/verify-migrations-nonempty.mjs` — PASS, 114 migrations.
- Production read-only Supabase verification — PASS for the two applied technical migrations, history RLS/triggers/grants, `Cancelled` RPC support, and unchanged core row counts.
- Production security advisor review — 19 authenticated security-definer notices classified; 9 RLS-without-policy informational notices and the leaked-password warning remain.
- Staging project verification — BLOCKED by Supabase permission denial for `dyaxtloducpgjoxuaszk`; the project is not visible in the connected account.
- `docker info` — BLOCKED by local Docker socket permission.
- Supabase staging connector inspection — BLOCKED by project permission denial.
- Live authenticated role sessions, pgTAP against staging, Storage checks, Realtime checks, and simultaneous concurrency sessions — NOT RUN.

## Remaining risks

- No approved member deactivation/tombstone rule.
- No approved project/client archive and reopen rule.
- New audit-history and service-cycle migrations are production-verified but not live-verified in staging.
- The local audit-history retention guard migration is not production-applied; workspace/member deletion behavior therefore remains subject to the original policy gap.
- Existing production advisor findings remain: password-leak protection is disabled, 19 authenticated security-definer functions are flagged for review, and 9 internal/legacy RLS-without-policy notices remain. These were reviewed as existing findings; no new advisor error was introduced by the two applied migrations.
- No evidence for live RLS enforcement across Super Admin, Project Manager, HOD, and Staff.
- No evidence for live cross-role notifications, Realtime updates, dashboard totals, Storage permissions, or concurrent conflict UX.
- Leaked-password screening cannot be enabled on the current Free-plan organization; upgrading to a supported plan or adopting an approved external password-screening control is required for a full security PASS.
- The live production database remains two migrations behind the repository and has not been mutated in this turn.
- Fresh backup/recovery readiness and Vercel production environment configuration remain unverified.

## Recommendation

**NO-GO for full release.** The authorized production schema remediation is complete, but production readiness still requires approved lifecycle/archive rules and evidence from authenticated role, dashboard, notification, Storage, Realtime, and concurrency testing. Staging was intentionally skipped per the latest instruction and must not be represented as passed.
