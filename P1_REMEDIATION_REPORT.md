# AiTask P1 Remediation Report

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Decision:** Local verification complete; production release remains **NO-GO** pending explicit retention/deletion approval and operational prerequisites.

## P1 status

| Item | Result | Evidence / remaining action |
| --- | --- | --- |
| HIST-001 — audit history and retention | **LOCAL PASS / PRODUCTION BLOCKED** | The patched retention migration passed against the disposable PostgreSQL/Supabase stack. pgTAP verified append-only history, retained actor history after member deletion, workspace deletion blocked by `ON DELETE RESTRICT`, and immutable update/delete rejection. The migration has not been applied to production because its deletion semantics require explicit approval. |
| REL-002 — migration alignment | **BLOCKED** | Repository: 114 non-empty migrations. Production project `ohjhwyiffgzyatcmmdql`: 112 recorded migrations. Pending repository migrations are `20261017091031_workspace_revision_realtime` and `20261017140000_audit_history_retention_guards_followup`. The alignment gate correctly stops on this difference. |
| CFG-005 — hosted password-reset bypass | **PASS** | A safe production build passed with `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false`. A hosted build with the bypass enabled failed closed with `Hosted production builds must not enable VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS.` |
| TEST-003 — regression coverage | **PASS** | Unit suite: 107 test files and 830 tests passed. Full Playwright E2E: 324 passed, 0 failed, 0 skipped, 0 interrupted. |
| UX-004 — user-flow regressions | **PASS** | The completed E2E suite covered the remediation-sensitive dirty-navigation, client wizard/search, client workspace, delivery review, plan-date, staff-snapshot, and workflow-gate flows. |
| OPS-006 — production operations | **BLOCKED / NOT VERIFIED** | Staging is intentionally skipped. Fresh production backup/recovery evidence was not available, live four-role sessions were not available, and Vercel environment-variable metadata returned 403. These are release blockers, not local test failures. |

## Database verification

`pnpm verify:supabase:rollout` completed successfully against a disposable local Supabase/PostgreSQL stack:

- 67 database test files.
- 1,032 pgTAP assertions reported by the rollout gate.
- 114 migration files validated as non-empty.
- Schema lint and security advisor checks completed.
- Storage, onboarding, service-command, staff-save, workflow, and HOD checks passed.
- Audit-history pgTAP passed after the fixture was made transactional and the workspace foreign key was changed to `ON DELETE RESTRICT`.
- The disposable service-upload fixture cleanup disables only the relevant capture triggers during fixture teardown; production behavior is unchanged.

This local result demonstrates migration and policy behavior in the disposable stack. It does not prove that the live production database can accept the pending migrations.

## Code gates

- `pnpm check` — PASS.
- `pnpm lint` — PASS.
- `pnpm exec vitest run src --maxWorkers=1 --reporter=dot` — PASS, 107 files / 830 tests.
- `pnpm test:e2e --reporter=line` — PASS, 324 / 0 / 0 / 0 passed/failed/skipped/interrupted.
- `env VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false pnpm build` — PASS.
- Bypass-enabled hosted build — expected FAIL-CLOSED.
- `node scripts/verify-pwa.mjs` — PASS.
- `node scripts/verify-bundle-size.mjs` — PASS.
- `git diff --check` — PASS.
- `pnpm verify:release-db-alignment` — expected BLOCKED because production is two migrations behind the repository.

## Production compatibility boundary

The exact production Supabase project is `ohjhwyiffgzyatcmmdql` (AiTask, `ap-southeast-1`, `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.121). Read-only migration history shows 112 production entries, with the latest connector aliases `20261017095621` (`audit_value_history`) and `20261017095628` (`align_service_cycle_cancel_rpc`). No migration was applied in this turn.

The exact Vercel project is `prj_uzWREguA16aYjlhTHPw9hE8DRLSM` under team `team_g508b9bq8m0arklfrfDId3wH`. The latest listed production deployment is READY, but it is from an earlier audit-branch commit (`463eb7c3a3a88215505e8387d4f80ace73bbc0cd`), not the current release-preparation HEAD. Vercel environment metadata could not be verified because the read-only environment request returned HTTP 403.

## Required next approval

Before production execution, the release owner must explicitly approve the retention/deletion policy and the exact migration sequence. Backup/recovery evidence, Vercel environment verification, and a compatible application deployment must then be confirmed. Until those conditions are met, the correct state is NO-GO.
