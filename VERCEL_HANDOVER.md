# Vercel Handover — AiTask

> Historical pre-release snapshot. See [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) for independently verified production/configuration state. No Vercel production promotion or master merge was performed during the takeover.

**Prepared:** 2026-10-17

## 1. Configuration (`vercel.json` + `DEPLOYMENT.md`)

| Setting | Value |
| --- | --- |
| Framework preset | `vite` |
| Build command | `pnpm build` (runs `tsc -b && vite build`) |
| Output directory | `dist` |
| Install | default (pnpm detected from `pnpm-lock.yaml`) |
| Rewrites | SPA fallback: all non-asset routes → `/index.html` |
| Headers | CSP, `Strict-Transport-Security` (preload), `X-Frame-Options: DENY`, `X-Content-Type-Options`, COOP/CORP, Referrer-Policy, Permissions-Policy; immutable cache for `/assets/*`, no-store for `index.html`/`sw.js`/`manifest` |

## 2. Production / staging

- **Production branch:** `master` (canonical Vercel project; auto-deploys reviewed merges).
- **Staging:** separate Vercel project + Supabase project `dyaxtloducpgjoxuaszk` (`aitask-staging`). Protected by Vercel Deployment Protection with GitHub Actions Trusted Sources (OIDC).
- **Release provenance:** `build-info.json` embeds version + commit; `verify:release-provenance` checks it post-deploy.

## 3. Required environment variables (names only)

- `VITE_AITASK_BACKEND=supabase`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_AITASK_SHOW_DEMO_LOGIN=false`
- `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false`

> `VITE_*` values are baked at build time — changing them requires a redeploy.

## 4. Build verification (executed this session)

`pnpm build` **PASS** (production build + PWA precache 127 entries, service worker generated). `pnpm check`, `pnpm lint`, `pnpm verify:i18n` (0 findings), `pnpm test` (105 files / 814 tests) all PASS.

## 5. CI/CD

- `.github/workflows/ci.yml` — dependency audit, typecheck, lint, unit tests, build, bundle/PWA, e2e smoke, `verify:supabase` + a `database` job (`verify:supabase:rollout` = migrations + pgTAP + advisors in disposable Docker).
- `.github/workflows/staging.yml` — authenticated staging QA on PR to `master`.
- `.github/workflows/release.yml` — tagged release provenance + staging deploy + QA fixture.

## 6. Deployment dependencies

The frontend **fails closed into read-only** when the backend schema is older than the frontend expects. Therefore:

1. Apply pending Supabase migrations **before** deploying a frontend that requires them.
2. Redeploy edge functions after setting their env vars.
3. Then deploy Vercel and verify `/build-info.json`.

## 7. Known risks

- **Staging gate currently inoperable** (per prior reports): staging Supabase access returns authorization denial and the staging Vercel token fails its team preflight. This blocks the authenticated staging QA path — re-provision `STAGING_VERCEL_TOKEN` from the staging org and restore staging Supabase access before relying on it.
- `.env.production` (tracked) holds the public URL + publishable key only — no secret.
- Leaked-password protection disabled (Supabase Free plan).
