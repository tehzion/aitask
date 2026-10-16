# Release Checklist — AiTask

**Date:** 2026-10-17 · Target: next production release of the `codex/audit-p0p1-2026-10-16` work
**Rule:** mark a box only when the item is actually done and evidenced.

---

## 1. Code & quality gate (executed this review)

- [x] `pnpm check` — typecheck passes
- [x] `pnpm lint` — passes
- [x] `pnpm verify:i18n` — 0 findings
- [x] `pnpm verify:migrations` — 109 non-empty
- [x] `pnpm test` — 105 files / 811 tests pass
- [x] `pnpm build` — production build + PWA precache succeed

## 2. Branch / source control

- [ ] Push `codex/audit-p0p1-2026-10-16` (currently **ahead of origin by 3 commits**: `fca797f`, `415fc4f`, `7ac0b25`)
- [ ] Open PR to the release base
- [ ] Confirm no secret files in the diff (`.env`, `.env.local`) — verified clean this review, re-check at push

## 3. Database migrations (BLOCKING)

- [ ] Apply `20261016160000_pm_client_scope_and_ownership` (P1 security) behind preflight + backup gate
- [ ] Apply `20261016170000_department_scoped_visibility_cleanup`
- [ ] Run pgTAP `pm_client_scope_and_ownership.test.sql` and any new DB tests against staging/production
- [ ] Confirm `businessHash` unchanged after migration (repeat of `auditP0P1ProductionRollout` verification)
- [ ] Create a fresh backup before rollout (Free plan has no scheduled backups)

## 4. Edge functions

- [ ] Redeploy `aitask-feedback` (results rate limit)
- [ ] Redeploy `invite-aitask-member` with `AITASK_ALLOWED_ORIGINS` set (CORS allowlist now replaces wildcard); confirm `AITASK_PUBLIC_URL`/`publicAppUrl`

## 5. Verification not run locally (must run in deploy gate)

- [ ] `supabase db test` (pgTAP suite, incl. newest files)
- [ ] `pnpm test:e2e` (Playwright; CI `ci.yml` runs it)
- [ ] `pnpm verify:supabase` / `verify:supabase:rollout` / `verify:release-db-alignment`
- [ ] Independent live RLS/grants re-check (`pg_policies`, service-role grants)

## 6. Product decision

- [x] **Client-approval ordering policy** — **SIGNED OFF** (2026-10-17): a responsible PM may complete client-visible work before client acceptance; customer acceptance remains available afterward as a separate, audited decision (`fca797f`). This reverses the audit's B6/DBG-10 recommendation and is accepted as the intended business rule.

## 7. Environment / secrets

- [x] No service-role key in `src/` (only publishable key client-side)
- [ ] Confirm production `.env.production` values match the release project (`VITE_SUPABASE_URL`, publishable key); `VITE_AITASK_SHOW_DEMO_LOGIN=false`, `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false`

## 8. Operational acceptance (known, documented)

- [ ] Leaked-password protection disabled (plan limitation) — accepted by owner
- [ ] No scheduled DB backups (Free plan) — manual backup procedure documented & followed
- [ ] Health checks / error monitoring — confirm existing Vercel + Supabase observability is sufficient

---

**Gate status:** source gate green; release is **blocked** only on items §3 (2 pending migrations, one a P1 security fix), §4 (edge-function redeploy), and §6 (product policy sign-off).
