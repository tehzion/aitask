# AiTask Production Deployment Report

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Release state:** **DATABASE APPLIED — APPLICATION DEPLOYMENT IN PROGRESS**
**Recommendation:** Release the verified application commit; mandatory recovery, configuration, approval, and authenticated smoke prerequisites are satisfied.

## Executive result

The local code/database/browser gates are complete. Supabase CLI reauthentication succeeded, a consistent PostgreSQL 17 archive was restored and verified, Vercel configuration was verified through the local owner session, and four isolated production QA identities passed ordinary authentication and page checks. Both approved production migrations are now applied and verified. Application deployment follows this database-compatible state.

Applied-database evidence is recorded in [`supabase/preflight/aitask_release_manifest_20261017_production.json`](supabase/preflight/aitask_release_manifest_20261017_production.json). Historical manifests are retained for traceability.

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
| Migration alignment | **PASS** — all 114 migrations applied; connector timestamp aliases explicitly verified |

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

Production migration history now contains 114 entries. Previously applied technical migrations are represented by connector aliases:

- `20261017095621` — `audit_value_history`.
- `20261017095628` — `align_service_cycle_cancel_rpc`.

The repository contains 114 non-empty migrations. This execution applied the two approved items:

1. `20261017091031_workspace_revision_realtime` → production `20261017152814`.
2. `20261017140000_audit_history_retention_guards_followup` → production `20261017152826`.

Postflight verified Realtime publication, one validated workspace FK using `ON DELETE RESTRICT`, no actor FK, all eight direct `service_role` history privileges revoked, RLS enabled, and the immutability trigger enabled. Four QA history rows were preserved. All 1,863 business entities retained checksum `5c3dbf9232130abcb4b4b65d9a401d51`; all 11 original members retained checksum `0c33b230fb39ce6f109746bb4c170333`.

## Vercel production state

- Project: `aitask` / `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`.
- Team: `team_g508b9bq8m0arklfrfDId3wH`.
- Latest listed production deployment: `dpl_1t34cYdnYV5LJxHU9AziXiUzrVq4`, **READY**, from audit-branch commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd`.
- Previous master production deployment: `dpl_2xYFtMbz8M6Rxei9R95PuNVJEZ8n`, **READY**, commit `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`.
- Current release-preparation HEAD was not deployed.
- Production environment-variable metadata: **VERIFIED through the local Vercel CLI**; the connector still returns HTTP 403. Production has `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SUPABASE_URL`. Secret-type values are concealed and cannot be read back. The served public assets contain the intended production reference `ohjhwyiffgzyatcmmdql`.

No Vercel deployment or alias change was performed in this turn.

## Live smoke-test results

Read-only checks against `https://aitask-virid.vercel.app` confirmed the production login page, password-recovery flow, Chinese-language toggle, invalid-credential feedback, mobile layout without horizontal overflow, accessibility labels, and absence of captured console errors during those checks. The deployed live build reports `v3.0.0+463eb7c3a3a88215505e8387d4f80ace73bbc0cd`.

Four isolated production QA identities passed ordinary password login, role binding, backend capabilities, role-scoped task/project queries, dashboard/tasks/projects/reports/calendar pages, and uncaught browser/server-error checks. Super Admin approvals and Staff mobile overflow also passed. Admin credentials were used only for provisioning; role assertions used ordinary user sessions. No real client business records were modified. Notification delivery, Realtime event propagation, and positive role-scoped Storage access require the separate operational probes; page rendering alone does not prove them.

## Backup, recovery, and safe sequence

Recovery is **VERIFIED** for this migration scope. The authenticated CLI used the IPv4 session pooler and a matching PostgreSQL 17.6 client. The consistent archive was created at `2026-10-17T15:20:51.005Z`, SHA-256 `d3d1f2be17e15df14ec2b811a0dc5f258fcae1221b6be778fa2576029d87a525`. A network-disabled disposable PostgreSQL 17.6 restore passed at `2026-10-17T15:22:33.134Z`: all 50 tables and 7,545 rows matched counts and SHA-256 hashes. The owner-only bundle is outside Git at `/Users/user/Downloads/aitask-production-backups/20261017T151800Z`; schema/data, roles, managed schemas, migration history, and the one private Storage object are included. Operator: authenticated owner `tehzion`, assisted by Codex. Platform-owned schema replacement requires platform-owner permissions, as used in the isolated drill. This logical backup excludes platform encryption root keys, provider settings/secrets, running sessions outside the captured snapshot, Edge Function deployment state, and point-in-time recovery after the backup timestamp.

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

- Retention/deletion policy approval, current backup/restore, and migration alignment are verified.
- Vercel connector environment access remains restricted, but the authorized local CLI now verifies production metadata and project configuration. Secret-type values remain hidden; the serving app's intended Supabase target is confirmed from its public assets.
- Staging is intentionally skipped. Live four-role authentication and read/page smoke checks passed; these are not exhaustive concurrency or authorization proofs.
- Supabase security advisors still report disabled leaked-password protection and reviewed authenticated security-definer notices.
- The pending retention migration also requires explicit acceptance that entity/member snapshots can contain personal and authorization data until a separate expiry, export, or redaction policy is approved.

## Vercel configuration and role verification

Vercel CLI 59.20.0 verifies authenticated user `tehzion`, team `tehzions-projects`, project `aitask`, project ID `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`, production branch `master`, Vite/Node 22.x, output `dist`, and SSO protection for non-custom domains. `vercel.json` selects `pnpm build`. Production variable names/targets are verified through the CLI. No backend/demo/password-bypass overrides exist remotely; the tracked production file supplies Supabase mode with demo and bypass disabled. Three public JavaScript assets were inspected and contain the intended Supabase project reference. Public build metadata still serves commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd`; the local release has not been deployed.

The complete local Playwright suite passes 324/324 using isolated fixtures. Four isolated ordinary production identities also passed live browser and API checks; operational notification/Realtime/Storage checks are reported separately from page rendering.
