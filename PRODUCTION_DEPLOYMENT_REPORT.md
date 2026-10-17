# AiTask Production Deployment Report

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Release state:** **DEPLOYMENT BLOCKED — PREPARED LOCALLY, NOT DEPLOYED**
**Recommendation:** **NO-GO** until backup/recovery readiness and production configuration verification are complete.

## Executive result

The applicable local code, database, and full Playwright gates are complete. Retention/deletion approval was received and recorded, but no production database mutation, Git push, or Vercel deployment was performed. The live database is not aligned with the repository tail and recovery/configuration gates remain open.

The superseding gate evidence is recorded in [`supabase/preflight/aitask_release_manifest_20261017_golive.json`](supabase/preflight/aitask_release_manifest_20261017_golive.json). The original immutable manifest is retained unchanged for traceability.

## Verification results

| Gate | Result |
| --- | --- |
| Full Playwright E2E | **PASS — 324 passed, 0 failed, 0 skipped, 0 interrupted** |
| Unit suite | **PASS — 107 test files / 830 tests** |
| Type-check (`pnpm check`) | **PASS** |
| Lint | **PASS** |
| Safe production build | **PASS** with password-reset bypass disabled |
| Unsafe hosted bypass guard | **PASS** — build rejected the enabled bypass |
| PWA verification | **PASS** |
| Bundle budgets | **PASS** |
| Disposable Supabase rollout | **PASS — 67 database files / 1,033 pgTAP assertions on all 114 current migrations, including the service-role privilege guard; DB lint had no errors and supporting probes passed** |
| Migration alignment | **BLOCKED as intended** — repository has two pending migrations relative to production |

The disposable database verification specifically covered append-only audit history, actor-history retention after member deletion, workspace foreign-key restriction, and immutable history update/delete rejection. Local success is not treated as proof of production compatibility.

## Git and release commit

- Remote: `origin` → `git@github.com:tehzion/aitask.git`.
- Production branch: `master` at `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`.
- Working branch: `codex/audit-p0p1-2026-10-16` at preparation start `c46bbcbe05746e20792cc6e62eb478906b48cf0b`.
- Release implementation commit: `ee54922c1bb3bc510886ea15ec8aa701011d58ab` (`fix(release): close P1 verification blockers`).
- Gate-evidence commit: `ebdcf39` (`chore(release): finalize production gate evidence`), containing the current retention privilege patch, regression assertion, superseding manifest, and updated reports.
- The documentation follow-up commit records the implementation and gate-evidence hashes in the report.
- `.codex-manifest-test.txt` is a temporary untracked file and is excluded from the release commit.

## Supabase production state

Exact project: `ohjhwyiffgzyatcmmdql` / **AiTask**, region `ap-southeast-1`, status `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.121`.

Production migration history contains 112 entries. The two technical migrations already applied and verified read-only are represented by connector aliases:

- `20261017095621` — `audit_value_history`.
- `20261017095628` — `align_service_cycle_cancel_rpc`.

The repository contains 114 non-empty migrations. The alignment check identifies these pending items:

1. `20261017091031_workspace_revision_realtime`.
2. `20261017140000_audit_history_retention_guards_followup`.

The second migration changes retention/deletion behavior. Its semantics are now explicitly approved and recorded, but it remains unapplied until recovery readiness and the remaining release gates are verified. No Supabase production migration was applied in this turn.

## Vercel production state

- Project: `aitask` / `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`.
- Team: `team_g508b9bq8m0arklfrfDId3wH`.
- Latest listed production deployment: `dpl_1t34cYdnYV5LJxHU9AziXiUzrVq4`, **READY**, from audit-branch commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd`.
- Previous master production deployment: `dpl_2xYFtMbz8M6Rxei9R95PuNVJEZ8n`, **READY**, commit `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`.
- Current release-preparation HEAD was not deployed.
- Production environment-variable metadata: **NOT VERIFIED**; the authorized read-only request returned HTTP 403. No secret values were requested or exposed.

No Vercel deployment or alias change was performed in this turn.

## Live smoke-test results

Read-only checks against `https://aitask-virid.vercel.app` confirmed the production login page, password-recovery flow, Chinese-language toggle, invalid-credential feedback, mobile layout without horizontal overflow, accessibility labels, and absence of captured console errors during those checks. The deployed live build reports `v3.0.0+463eb7c3a3a88215505e8387d4f80ace73bbc0cd`.

No real credentials were available for this execution. Super Admin, Project Manager, HOD, and Staff authenticated dashboards, role-scoped workflows, notifications, Realtime, Storage, and business-record actions are therefore **not verified live**.

## Backup, recovery, and safe sequence

Fresh production backup/recovery readiness is **NOT VERIFIED**. PostgreSQL client tooling is present (`pg_dump`/`pg_restore` 16.14), but the credential-safe `pg_dump --no-password` attempt against `db.ohjhwyiffgzyatcmmdql.supabase.co` failed because the hostname could not be resolved from this environment. No credentials were exposed, no dump was retained, and production was not modified. A successful backup still requires working DNS/network access to the database endpoint plus an authorized database password or connection string, followed by a disposable restore and integrity check. Existing historical notes are not treated as a current backup confirmation.

The safe sequence is:

1. Confirm the recorded retention/deletion approval against the exact release commit.
2. Confirm a fresh recoverable backup and document restore ownership.
3. Re-check the live migration history immediately before applying anything.
4. Apply only the approved pending migrations in dependency order, then re-read production migration history.
5. Deploy the application commit that is compatible with the confirmed schema.
6. Verify the deployed commit and migration versions.
7. Run non-destructive smoke tests, authorized role checks, and production log inspection.

Vercel rollback does not roll back database migrations. A failed database change requires a corrective migration or restore, not an application-only rollback.

## Outstanding risks

- Retention/deletion policy approval is recorded; production application is still blocked by recovery/configuration gates.
- Production and repository migration histories are not aligned.
- Fresh backup/recovery readiness is not evidenced.
- Vercel production environment configuration could not be verified due permissions.
- Staging is intentionally skipped; live authenticated four-role, RLS, Realtime, Storage, dashboard, notification, and concurrency evidence remains unavailable.
- Supabase security advisors still report disabled leaked-password protection and reviewed authenticated security-definer notices.
- The pending retention migration also requires explicit acceptance that entity/member snapshots can contain personal and authorization data until a separate expiry, export, or redaction policy is approved.

## Vercel configuration and role verification

Vercel team and project identity are verified read-only: team `tehzions-projects`, project `aitask`, project ID `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`, Vite/Node 22.x, and SSO protection enabled for non-custom domains. The production environment-variable listing still returns HTTP 403, so live variable names/targets cannot be independently confirmed. Public build metadata currently serves production commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd`; the local release is not deployed.

The complete local Playwright suite passes 324/324 using isolated fixtures. No authorized production accounts were available, so live Super Admin, Project Manager, HOD, and Staff authentication, role scope, notifications, Realtime, Storage, and dashboard workflows remain unverified.
