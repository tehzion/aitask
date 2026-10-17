# AiTask Production Deployment Report

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Release state:** **PREPARED LOCALLY — NOT DEPLOYED**
**Recommendation:** **NO-GO** until retention/deletion approval, backup/recovery readiness, and production configuration verification are complete.

## Executive result

The full local verification work is complete and the release changes are ready for a reviewed Git commit. No production database mutation, Git push, or Vercel deployment was performed in this preparation turn. The explicit retention/deletion approval required by the release instruction was not present, and the live database is not aligned with the repository tail.

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
| Disposable Supabase rollout | **PASS — 67 database files / 1,032 pgTAP assertions** |
| Migration alignment | **BLOCKED as intended** — repository has two pending migrations relative to production |

The disposable database verification specifically covered append-only audit history, actor-history retention after member deletion, workspace foreign-key restriction, and immutable history update/delete rejection. Local success is not treated as proof of production compatibility.

## Git and release commit

- Remote: `origin` → `git@github.com:tehzion/aitask.git`.
- Production branch: `master` at `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`.
- Working branch: `codex/audit-p0p1-2026-10-16` at preparation start `c46bbcbe05746e20792cc6e62eb478906b48cf0b`.
- The release commit hash is recorded in the final documentation commit after the intended changes are staged and reviewed.
- `.codex-manifest-test.txt` is a temporary untracked file and is excluded from the release commit.

## Supabase production state

Exact project: `ohjhwyiffgzyatcmmdql` / **AiTask**, region `ap-southeast-1`, status `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.121`.

Production migration history contains 112 entries. The two technical migrations already applied and verified read-only are represented by connector aliases:

- `20261017095621` — `audit_value_history`.
- `20261017095628` — `align_service_cycle_cancel_rpc`.

The repository contains 114 non-empty migrations. The alignment check identifies these pending items:

1. `20261017091031_workspace_revision_realtime`.
2. `20261017140000_audit_history_retention_guards_followup`.

The second migration changes retention/deletion behavior. It remains unapplied until the release owner explicitly approves that policy. No Supabase production migration was applied in this turn.

## Vercel production state

- Project: `aitask` / `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`.
- Team: `team_g508b9bq8m0arklfrfDId3wH`.
- Latest listed production deployment: `dpl_1t34cYdnYV5LJxHU9AziXiUzrVq4`, **READY**, from audit-branch commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd`.
- Previous master production deployment: `dpl_2xYFtMbz8M6Rxei9R95PuNVJEZ8n`, **READY**, commit `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`.
- Current release-preparation HEAD was not deployed.
- Production environment-variable metadata: **NOT VERIFIED**; the authorized read-only request returned HTTP 403. No secret values were requested or exposed.

No Vercel deployment or alias change was performed in this turn.

## Backup, recovery, and safe sequence

Fresh production backup/recovery readiness is **NOT VERIFIED**. Existing historical notes are not treated as a current backup confirmation. A production release must wait for a backup or an explicitly documented recovery point and restore path.

The safe sequence is:

1. Record explicit approval for retention/deletion semantics and the exact release commit.
2. Confirm a fresh recoverable backup and document restore ownership.
3. Re-check the live migration history immediately before applying anything.
4. Apply only the approved pending migrations in dependency order, then re-read production migration history.
5. Deploy the application commit that is compatible with the confirmed schema.
6. Verify the deployed commit and migration versions.
7. Run non-destructive smoke tests, authorized role checks, and production log inspection.

Vercel rollback does not roll back database migrations. A failed database change requires a corrective migration or restore, not an application-only rollback.

## Outstanding risks

- Retention/deletion policy approval is missing.
- Production and repository migration histories are not aligned.
- Fresh backup/recovery readiness is not evidenced.
- Vercel production environment configuration could not be verified due permissions.
- Staging is intentionally skipped; live authenticated four-role, RLS, Realtime, Storage, dashboard, notification, and concurrency evidence remains unavailable.
- Supabase security advisors still report disabled leaked-password protection and reviewed authenticated security-definer notices.
