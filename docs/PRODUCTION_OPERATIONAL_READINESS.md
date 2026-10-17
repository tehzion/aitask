# Production Operational Readiness — AiTask

**Date:** 2026-10-17 · **Branch:** `codex/audit-p0p1-2026-10-16` (HEAD `7ac0b25`, 3 commits ahead of origin)
**Scope:** operational conditions only (the technical release gate is already green — 812 tests, clean typecheck/lint/i18n/build).
**Rule:** verified = evidence-backed; pending = external dependency/approval; no condition is assumed satisfied.

---

## 1. Operational Readiness Checklist

| # | Condition | Status | Owner | Required action |
| --- | --- | --- | --- | --- |
| 1 | Production env vars correct (`VITE_AITASK_BACKEND=supabase`, URL, publishable key, demo login off, reset bypass off) | ✅ Verified | — | — |
| 2 | No service-role key exposed to frontend | ✅ Verified | — | — |
| 3 | Dev/prod/staging environment separation | ✅ Verified (staging project `dyaxtloducpgjoxuaszk` + separate Vercel project) | — | — |
| 4 | Migrations ordered, non-empty, reproducible | ✅ Verified (`verify:migrations` 109 non-empty; `supabase db push`; pgTAP in disposable Docker via CI) | — | — |
| 5 | **2 pending production migrations applied** (`pm_client_scope_and_ownership`, `department_scoped_visibility_cleanup`) | ❌ Pending | Release owner | Apply behind preflight/backup gate (one is a **P1 security** fix) |
| 6 | RLS policies / secure cutover applied | ✅ Verified (manifest `liveVerification`: anon access false, command RPC execution false, search paths fixed) | — | — |
| 7 | Authentication settings (leaked-password protection) | ❌ Disabled (Free plan) | Release owner | Upgrade to Pro+ and enable (explicit release blocker in `staging-release-setup.md` §7) |
| 8 | Scheduled DB backups | ❌ None (Free plan; `platformBackupClaimed:false`) | Release owner | Enable backups or disciplined manual logical backup |
| 9 | Recovery / rollback procedure documented | ✅ Verified (`docs/production-rpc-mismatch-recovery.md`, Vercel rollback + DB rollback plan) | — | — |
| 10 | Monitoring / error tracking | ⚠️ Partial (React `ErrorBoundary` + Vercel/Supabase built-in logs; **no APM/Sentry**) | Release owner | Add error monitoring + alerting if required |
| 11 | Health check endpoint | ⚠️ Partial (no `/health`; rely on `/build-info.json` provenance + Settings sync status) | Release owner | Optional dedicated health check |
| 12 | Four-role smoke tests (prod-equivalent) | ❌ Not run — **staging QA gate blocked** | Release owner | Restore `STAGING_VERCEL_TOKEN` + Supabase staging access |
| 13 | Managed database security patch | ❌ Unresolved (per `staging-release-setup.md` §7) | Release owner/Supabase | Resolve with Supabase |
| 14 | 3 local commits pushed + PR opened | ❌ Pending | Engineer | `git push` + PR |
| 15 | Scheduled background processes (cron) | ✅ Verified (pg_cron: service-cycles-daily, deadline reminders + cleanup, rate-limit cleanup, monthly revision) | — | — |
| 16 | Realtime subscriptions | ✅ Configured (publication on `aitask_entities`/`aitask_members`) | — | — |
| 17 | Edge functions deployed + config correct | ⚠️ Partial (config correct; **redeploy pending** for `fca797f` changes — feedback results rate limit + invite CORS allowlist) | Release owner | `supabase functions deploy` |

## 2. Verified Conditions (evidence)

- **Env separation:** `.env.production` (committed) carries only the production URL + `sb_publishable_*` key, `VITE_AITASK_SHOW_DEMO_LOGIN=false`, `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false`. `.env`/`.env.local` are gitignored; staging uses a distinct Supabase project + Vercel project. `release.yml` asserts `STAGING_SUPABASE_URL != PRODUCTION_SUPABASE_URL`.
- **No frontend secret:** `src/` contains no `SUPABASE_SERVICE_ROLE_KEY`; only the publishable key (`src/lib/backend.ts`). Service role appears only in edge functions (server-side) and CI secrets (no `VITE_` prefix).
- **Security headers:** `vercel.json` — CSP, HSTS (`max-age=63072000; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options`, COOP/CORP, Referrer-Policy, Permissions-Policy, and no-store cache on `index.html`/`sw.js`.
- **Build provenance / rollback:** `build-info.json` embeds version+commit; `verify:release-provenance` checks deployed build; rollback = Vercel rollback + DB rollback plan (never replay migrations as an app-rollback shortcut).
- **CI/CD:** `ci.yml` (dependency audit, typecheck, lint, unit+permission tests, build, bundle/PWA, e2e smoke, `verify:supabase`) + `database` job (`verify:supabase:rollout` = migrations + pgTAP + advisors in disposable Docker) + `staging.yml` (authenticated staging QA) + `release.yml` (tagged release provenance + staging deploy + QA fixture + rollback).
- **Credentials hygiene:** `verify-qa-artifacts.py` scans QA artifacts/ZIPs for credential values before upload.

## 3. Outstanding Requirements

| Priority | Requirement | Blocker | Action |
| --- | --- | --- | --- |
| P1 | Apply `pm_client_scope_and_ownership` + `department_scoped_visibility_cleanup` | Approval + backup gate | Deploy behind preflight; run pgTAP |
| P1 | Enable leaked-password protection | Free-plan limitation | Supabase Pro+ upgrade |
| P1 | Run four-role smoke tests | Staging access denial (Supabase staging returns authorization denial; Vercel staging token fails team preflight) | Recreate `STAGING_VERCEL_TOKEN` from staging-org account; restore Supabase staging access |
| P1 | Scheduled backups | Free plan | Enable backups or manual logical-backup discipline |
| P1 | Managed DB security patch | Supabase | Resolve with provider |
| P2 | Redeploy edge functions (`aitask-feedback`, `invite-aitask-member`) | Requires `AITASK_ALLOWED_ORIGINS` / `AITASK_PUBLIC_URL` set | `supabase functions deploy` |
| P2 | Error monitoring/alerting (Sentry/APM) | None (choice) | Add if operational SLO requires it |
| P2 | Push 3 local commits + open PR | None | `git push` + `gh pr create` |

## 4. Supabase Operational Status

| Area | Status |
| --- | --- |
| RLS + secure cutover | ✅ Verified (manifest live evidence) |
| Command RPC + idempotency/optimistic concurrency | ✅ Source-verified; prior pgTAP `completePgTapSuitePassed:208` |
| Migrations | ✅ Ordered/reproducible; **2 pending** |
| Cron (pg_cron) | ✅ 4 scheduled jobs present in migrations |
| Realtime | ✅ publication configured |
| Storage | ✅ 4 policies; 100 MB / 5 MIME types |
| Edge functions | ⚠️ config correct; redeploy pending |
| Backups | ❌ none scheduled (Free plan) |
| Leaked-password protection | ❌ disabled |

## 5. Four-Role Smoke-Test Results

| Role | Production smoke | Prod-equivalent (staging) | Unit/permission tests |
| --- | --- | --- | --- |
| Super Admin | Not run (correctly avoided) | **Blocked** (staging gate) | ✅ Pass |
| Project Manager | Not run | **Blocked** | ✅ Pass (`accessPmScope`, `pmDashboard`, `pmPortfolioIdScope`) |
| HOD | Not run | **Blocked** | ✅ Pass (`hodPermissionParity` 12) |
| Staff | Not run | **Blocked** | ✅ Pass (`staffDashboard` 14, `staffWorkflow`) |

The authenticated staging QA path (`reset-staging-qa.mjs` → `staging.yml`/`release.yml`) is the intended production-equivalent smoke test, but it is **currently inoperable** because the staging Supabase project returns authorization denial and the staging Vercel token fails its team preflight (`staging-release-setup.md` §7). Until restored, four-role smoke tests cannot be honestly reported as passed.

## 6. Notification & Dashboard Verification

- **Notifications:** generation, recipient resolution (dedup via `Set`, actor-excluded, one-audience invariant), classification/grouping/read-tracking, and i18n are unit-verified (`notificationCenter/Popups/Reads/Presentation` tests + `store` recipient tests). Realtime delivery and cross-account isolation are **not verified live**.
- **Dashboards:** `dashboardData.test.ts` (21), `staffDashboard.test.ts` (14), `pmDashboard.test.ts`, `hodPermissionParity.test.ts` (12) pass; calculations trace to canonical selectors. Live DB-vs-display comparison **not performed** (no live access).

## 7. Monitoring & Recovery Readiness

- **Error handling:** React `ErrorBoundary` (`src/main.tsx`) prevents whole-app crashes; fail-closed read-only on schema mismatch (`upgradeRequired`/`retry_required`).
- **Monitoring:** no external APM/error-tracker — Vercel + Supabase built-in logs only. **Gap** if operational SLO requires alerting.
- **Recovery:** backup/restore runbook present (`production-rpc-mismatch-recovery.md`, `supabase/preflight/`); last verified logical backup 2026-09-04 (`backupRestoreEvidence`). No scheduled backups — recovery depends on manual discipline.
- **Rollback:** Vercel instant rollback + release-specific DB rollback plan; migration history is connector-alias-mapped and must not be replayed as an app-rollback shortcut.

## 8. Final Recommendation

### NO-GO

**Reasoning.** The code is production-correct (gate green, no release-blocking code defects), but the application is **not operationally ready** for a responsible production release while these conditions remain unmet:

1. **P1 security migration unapplied** (`pm_client_scope_and_ownership`) — a live PM cross-company injection remains in production.
2. **Four-role smoke tests cannot be run** — the authenticated staging QA gate is inoperable (staging Supabase + Vercel access denied), so role correctness in a production-equivalent environment is unverified.
3. **Leaked-password protection disabled** (explicitly listed as a release blocker).
4. **No scheduled database backups** on the Free plan.
5. **Managed database security patch unresolved.**

**Path to CONDITIONAL-GO / GO (in order):**
1. Restore staging access (`STAGING_VERCEL_TOKEN` from the staging org; restore Supabase staging project access).
2. Apply the 2 pending migrations behind the preflight/backup gate; run pgTAP.
3. Upgrade Supabase to enable leaked-password protection and scheduled backups; resolve the managed DB security patch.
4. Redeploy the 2 edge functions with `AITASK_ALLOWED_ORIGINS`/`AITASK_PUBLIC_URL` set.
5. Run the four-role authenticated staging QA, then push the 3 local commits and open a PR; verify `/build-info.json` provenance on the tagged release.

No code changes were made in this phase; no production data, schema, RLS, or deployment was modified.
