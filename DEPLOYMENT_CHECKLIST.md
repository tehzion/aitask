# Deployment Checklist — AiTask

> Historical checklist. The owner authorized the audit-branch push and Supabase rollout and explicitly waived a fresh backup for this release. See [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) for execution results and outstanding gates; this does not waive future backup or production-promotion approval requirements.

**Prepared:** 2026-10-17 · **For:** incoming agent (do NOT execute without owner approval + backup/preflight gate)

---

## 1. Pre-deployment checks

- [ ] Working tree clean; on `codex/audit-p0p1-2026-10-16`.
- [ ] `pnpm check` / `pnpm lint` / `pnpm verify:i18n` / `pnpm test` / `pnpm build` all green.
- [ ] `pnpm verify:migrations` — 109 non-empty.
- [ ] Confirm production migration state against `supabase_migrations.schema_migrations` (do NOT trust the manifest alone).
- [ ] Create a fresh production backup (Free plan has no scheduled backups — see `docs/production-rpc-mismatch-recovery.md`).

## 2. Recommended deployment order (dependency-driven)

1. **Supabase migrations** (in filename order) behind the preflight/backup gate:
   - `20261016160000_pm_client_scope_and_ownership` (P1 security)
   - `20261016170000_department_scoped_visibility_cleanup`
   - Run pgTAP `supabase/tests/database/pm_client_scope_and_ownership.test.sql` + full suite.
2. **Edge functions** (after setting env vars):
   - `invite-aitask-member` (needs `AITASK_ALLOWED_ORIGINS`; confirm `AITASK_PUBLIC_URL`/`publicAppUrl`)
   - `aitask-feedback` (results-branch rate limit)
3. **Git push + PR** (plain push, no force; open PR to release base).
4. **Vercel deploy** (reviewed `master` merge → auto-deploy; or tagged release workflow).
5. **Post-deployment verification** (§4).

> Frontend fails closed (read-only) on schema mismatch, so migrations MUST precede a frontend that needs them. Both pending migrations are backward-compatible (trigger/data-only); no expected downtime.

## 3. Migration verification

- Confirm business hashes unchanged after migration (repeat of `auditP0P1ProductionRollout`).
- Confirm `anonymousDirectTableAccess:false`, `anonymousCommandRpcExecution:false` still hold.
- `pnpm verify:supabase:rollout` (disposable Docker stack) for migration/pgTAP/advisors.

## 4. Post-deployment smoke tests

**Automated:** `pnpm test:e2e` (Playwright), `pnpm test:e2e:login-i18n`, `pnpm test:e2e:pwa`, `pnpm verify:supabase`, `pnpm verify:release-provenance -- --url <prod> --version <v> --commit <sha>`.

**Manual (four roles):**
- [ ] Login/logout each role; dashboards load with correct data.
- [ ] Role permissions: PM portfolio-scoped, HOD dept-scoped, Staff assigned-scoped, Super Admin unrestricted.
- [ ] CRUD: create/edit/delete task, company, plan; modals auto-close on success, preserve input on failure.
- [ ] Assign → notify assignee; approve/reject → notify requester; notification click → correct record + mark read.
- [ ] Dashboard counts match records; no stale counters after reassignment/deletion.
- [ ] Cross-role sync ≤15 s (or on focus).
- [ ] File upload/download within 100 MB / 5 MIME types.
- [ ] No console errors; no critical Vercel/Supabase errors.

## 5. Rollback procedures

| Failure | Action |
| --- | --- |
| Failed Vercel deploy | Vercel rollback to prior production artifact (instant). |
| Failed DB migration | **Vercel rollback does NOT reverse DB changes.** Restore from backup OR apply a corrective migration; never "replay" migrations as an app-rollback shortcut (migration history is connector-alias-mapped). |
| Frontend/backend incompatibility | Frontend fails closed to read-only; roll back Vercel to a build matching the deployed schema. |
| Missing env vars | App fails closed with a config notice; add vars and redeploy. |
| Broken auth / RLS | Restore prior migrations/policies; verify `secure-cutover` + RLS via `verify:supabase`. |
| Realtime failures | Polling (15 s) still reconciles; verify channel + `AITASK_PUBLIC_URL`. |

## 6. Final conditions for GO

- [ ] Both pending migrations applied + verified.
- [ ] Edge functions redeployed.
- [ ] pgTAP + e2e + live RLS/grants re-check pass.
- [ ] Product sign-off recorded (approval-ordering policy — **already signed off 2026-10-17**).
