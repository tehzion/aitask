# Deployment Checklist — AiTask

> Current release-preparation checklist. Historical execution notes below are retained for traceability. No production migration, deployment, or push was performed in the current turn because retention approval, backup/recovery evidence, and Vercel environment verification remain incomplete.

**Prepared:** 2026-10-17 · **For:** incoming agent (do NOT execute without owner approval + backup/preflight gate)

## Current follow-up gate state

As of the latest verification, this checklist remains blocked for production promotion:

- **Staging Supabase access:** BLOCKED. The connected account does not list project `dyaxtloducpgjoxuaszk`; direct connector queries return permission denial.
- **CLI access:** BLOCKED. The repository-pinned CLI is installed but has no `SUPABASE_ACCESS_TOKEN` or authenticated profile. The local Supabase link points to production only.
- **Disposable database testing:** PASS. The local Supabase rollout completed with 67 database files and 1,032 pgTAP assertions, including append-only history and foreign-key behavior. This is not evidence of production compatibility.
- **Staging/live role testing:** BLOCKED/NOT VERIFIED. Staging is intentionally skipped and no authenticated four-role production sessions were available.
- **Lifecycle approval:** BLOCKED. Member deactivation, project archive/reopen, and client archive rules require owner approval. See [LIFECYCLE_DECISIONS.md](LIFECYCLE_DECISIONS.md).
- **Repository migrations:** 114 non-empty files pass validation. Production has 112 recorded migrations through aliases `20261017095621 audit_value_history` and `20261017095628 align_service_cycle_cancel_rpc`, verified read-only. Pending repository migrations are `20261017091031_workspace_revision_realtime` and `20261017140000_audit_history_retention_guards_followup.sql`; the latter remains pending explicit retention/deletion approval. See the [current release manifest](supabase/preflight/aitask_release_manifest_20261017.json).

Do not substitute production credentials or the production project for staging. Do not apply lifecycle or otherwise unreviewed migrations until the relevant business decisions and release approvals are explicit. The two confirmed technical migrations above are already applied and must not be replayed.

---

## 1. Pre-deployment checks

- [x] Release commit prepared on `codex/audit-p0p1-2026-10-16`; temporary `.codex-manifest-test.txt` is excluded.
- [x] `pnpm check` / `pnpm lint` / `pnpm verify:i18n` / full unit suite / safe `pnpm build` all green.
- [x] Full Playwright E2E: 324 passed, 0 failed, 0 skipped, 0 interrupted.
- [x] `pnpm verify:migrations` — 114 non-empty.
- [ ] `pnpm verify:release-db-alignment` — intentionally blocked until the two pending migrations are approved and applied in production.
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

> Frontend fails closed (read-only) on schema mismatch, so migrations MUST precede a frontend that needs them. The retention migration changes deletion semantics and is not treated as backward-compatible or deployable without explicit approval.

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
- [ ] Current audit-history and service-cycle compatibility migrations applied and verified in staging.
- [ ] Edge functions redeployed.
- [ ] pgTAP + e2e + live RLS/grants re-check pass.
- [ ] Four-role authenticated staging sessions and simultaneous concurrency checks pass.
- [ ] Member and project/client lifecycle decisions approved and implemented.
- [ ] Product sign-off recorded (approval-ordering policy — **already signed off 2026-10-17**).
