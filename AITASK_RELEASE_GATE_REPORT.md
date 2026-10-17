# AiTask Release Gate Report

Date: 2026-10-17 18:22 MYT
Decision: **NO-GO — do not deploy**

This report closes the requested improvement-plan execution pass. It records only evidence collected against the current repository and the verified production Supabase project; it does not treat prior audit documents as proof of current state.

## Gate status

| Gate | Status | Evidence / remaining condition |
| --- | --- | --- |
| P0.1 immutable release manifest | PASS | [supabase/preflight/aitask_release_manifest_20261017.json](<./supabase/preflight/aitask_release_manifest_20261017.json>) records the verified project ref, Git commit, migration hashes, live migration tail, Edge Function versions/hashes, policy/grant/storage/Auth-schema fingerprints, and no secrets. |
| P0.2 negative cross-company authorization matrix | BLOCKED | Production was not mutated for testing. Staging project `dyaxtloducpgjoxuaszk` is not visible to the connected Supabase account and no disposable hosted credentials were supplied. |
| P0.3 browser regressions | PASS | Mobile drawer focus, route-focus ordering, mobile toast/PWA overlay, and shortcut guards pass. Focused accessibility passed twice cold after the final fix and once with a warm server; app-smoke first-login passed. |
| P0.4 password-reset bypass | PASS | Runtime bypass is local-dev/local-host only; hosted production builds reject the bypass flag. The intentionally unsafe test build was rejected. |
| P0.5 lifecycle policy | PASS / BLOCKED | Proposed archive/reopen, member deactivation, and client archive-first behavior is documented in `LIFECYCLE_DECISIONS.md` and `LIFECYCLE_POLICY_APPROVAL.md`; owner approval and production policy verification remain outstanding. |
| Local disposable database rollout | NOT VERIFIED | Migrations, pgTAP/schema/advisor, storage, service-command, staff-save, and HOD database/API checks passed (67 files / 1,027 pgTAP tests). The real-browser onboarding recovery harness stalled after HOD database assertions and was stopped; no production state was affected. |
| Production migration alignment | BLOCKED | Production has 112 migrations through `20261017095628`; the repository has 114. The two pending local migrations are listed below and were not applied. |
| Static/unit/build checks | PASS | `pnpm check`, `pnpm lint`, `pnpm test -- --reporter=dot` (107 files / 830 tests), `pnpm build`, and `pnpm verify:migrations` passed. |
| Full Playwright suite | NOT VERIFIED | The broad 324-test run was stopped after multiple fixture/UI failures while release-critical focused checks remained green. This is not a clean full-suite gate. |

## Verified production target

- Project: `ohjhwyiffgzyatcmmdql` (AiTask), `ap-southeast-1`, `ACTIVE_HEALTHY`, Postgres `17.6.1.121`.
- Production migration count: 112; latest live version: `20261017095628` (`align_service_cycle_cancel_rpc`).
- Local migration count: 114; latest: `20261017140000_audit_history_retention_guards_followup`.
- Pending local migrations: `20261017091031_workspace_revision_realtime` and `20261017140000_audit_history_retention_guards_followup`.
- The local `audit_value_history` and `align_service_cycle_cancel_rpc` migrations match live by name despite connector timestamp aliases.
- No production migration, Edge Function deployment, Auth mutation, storage mutation, or application deployment was performed during this pass.

Read-only production fingerprints are captured in the manifest. Supabase security advisors still report leaked-password protection disabled and 19 authenticated-executable public `SECURITY DEFINER` functions requiring explicit review; these were not changed without owner approval.

## Improvements completed

- Hardened password-reset bypass in `src/lib/auth.ts` and `vite.config.ts`.
- Fixed mobile drawer inert/focus timing and prevented route focus/keyboard shortcuts from stealing focus in `src/components/Sidebar.tsx` and `src/components/Layout.tsx`.
- Kept the toast host mounted through Suspense and preserved mobile/PWA toast rendering in `src/components/Toast.tsx` and `src/components/Layout.tsx`.
- Made Playwright server lifecycle configurable and graceful in `playwright.config.ts`; validated cold and warm runs.
- Added the audit-history retention follow-up migration and pgTAP coverage. It deliberately removes member/workspace foreign keys from immutable history so deletion cannot cascade or null historical evidence; this remains a proposed policy requiring approval.
- Updated release-alignment scripts to read the current release manifest instead of the stale repair manifest.

## Reliability and P1 status

Local command receipts, idempotency, retry/reconciliation, failure-state messaging, upload reconciliation, and HOD status recovery have passing unit/database/browser evidence in the focused suites. Durable hosted Auth/member lifecycle reconciliation, the full role matrix, cross-company forged-command/storage/portal/notification checks, backup/recovery evidence, and hosted monitoring remain **NOT VERIFIED** because staging access is unavailable.

## Required next actions before a GO decision

1. Provide authorized staging or disposable hosted Supabase credentials and run the full Super Admin, PM, HOD, Staff, Client, and zero-permission custom-role negative matrix with no-side-effect assertions.
2. Review and approve the lifecycle policy and the immutable-history retention migration; then apply the two pending migrations through the approved deployment process and rerun release-alignment checks.
3. Confirm hosted leaked-password protection, backups/recovery, monitoring/alerting, and Edge Function deployment evidence.
4. Re-run the full Playwright suite and resolve or explicitly waive its broad fixture failures before release.

## Git and deployment state

- HEAD: `c46bbcbe05746e20792cc6e62eb478906b48cf0b` on `codex/audit-p0p1-2026-10-16`.
- Working tree is intentionally dirty and includes pre-existing audit work plus the scoped fixes above; no commit or push was created.
- Deployment readiness: **NO-GO**. Deployment remains intentionally unperformed pending approval and the blockers above.
