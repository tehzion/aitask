# Vercel + Supabase Setup

AiTask deploys to Vercel as a Vite single-page app and syncs through Supabase Auth.

## Vercel

Use these project settings:

- Framework Preset: `Vite`
- Build Command: `pnpm build`
- Output Directory: `dist`
- Install Command: Vercel default (pnpm is detected from `pnpm-lock.yaml`)

The included `vercel.json` sends all routes to `index.html` so React Router direct links work, including `/tasks`, `/calendar`, `/reports`, `/approvals`, and `/settings`.

## Supabase

1. Create a Supabase project.
2. Apply the database schema. The secure identity-based workspace lives in `supabase/secure-auth-schema.sql`; historical migrations live under `supabase/migrations/` and should be applied in filename order (`supabase db push` with the Supabase CLI applies both). The legacy JSON-snapshot table (`supabase/schema.sql`) is only needed while migrating an old snapshot deployment; `supabase/secure-cutover.sql` revokes anon access to it.
3. In Vercel, add these Environment Variables for Production, Preview, and Development:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_AITASK_SHOW_DEMO_LOGIN=false
VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=false
```

4. Redeploy the Vercel project after saving env vars.

Users sign in with Supabase Auth. The workspace (members, tasks, projects, clients, plans, cycles, notifications, roles) is stored in normalized RLS-protected tables and mutated through the `aitask_execute_command` RPC with per-entity optimistic concurrency and command-id idempotency.

## Verification

Run these before redeploying:

```bash
pnpm verify:supabase
pnpm lint
pnpm check
pnpm build
pnpm verify:pwa
pnpm test:e2e
```

- `verify:supabase` checks that anonymous callers cannot execute workspace commands or read the secure tables, that the legacy snapshot guard trigger exists, and that a spoofed `Origin` cannot write the legacy snapshot. Set `AITASK_EXPECT_SECURE_CUTOVER=true` once `secure-cutover.sql` has been applied.
- `verify:pwa` rebuilds `dist/` and checks the generated manifest/service worker.
- `pnpm verify:supabase:rollout` (requires Docker) validates all migrations, pgTAP tests, lint, advisors, and postflight SQL against a disposable local Supabase stack.
- `pnpm verify:release-provenance -- --url https://your-release.example --version <version> --commit <full-sha>` confirms a deployed build’s public version and immutable Git commit.

## Tagged production releases

Keep the canonical Vercel project connected to `master` for automatic production
deployments. Protect `master` with required pull-request checks so the local,
database, and authenticated staging gates pass before a merge reaches Vercel.
Matching `vX.Y.Z` tags rerun the gate and verify the automatically deployed commit.
Configure the required Vercel and staging QA secrets as described in
[`docs/staging-release-setup.md`](docs/staging-release-setup.md).

The v2.1.1 direct-production path was a one-time exception. v2.1.2 also used a
one-time direct-production gate (recorded in `docs/client-release-notes-2026-08.md`)
because the isolated staging environment was not yet provisioned; that release is
verified against live production provenance after the Vercel Git integration
deploys `master`. v2.1.3 used the same one-time frontend gate. v2.1.4 is the
final exact one-time exception: after verified owner-only logical backups it
applies the immutable v2.1.3 Staff authorization migration and its narrow cycle-
timestamp correction, verifies unchanged business data, and only then permits
the tagged Vercel Git deployment. No authenticated production test is run.
Every later release must pass isolated authenticated staging QA before its
reviewed `master` merge triggers the automatic production deployment.

## Backend migrations and upgrade runbook

New migrations must reach production through `supabase db push` — never by
running migration files manually. The app verifies backend capabilities at
startup and switches to a read-only "system update" state when the deployed
schema is older than the frontend expects.

Before applying migrations to a live project, follow
[`docs/production-rpc-mismatch-recovery.md`](docs/production-rpc-mismatch-recovery.md):
it defines fail-closed stop conditions (verified restorable backup, preflight
counts/checksums, schema-equivalence evidence), the preflight/postflight SQL in
`supabase/preflight/`, and the post-rollout validation steps. Do not redeploy a
frontend that requires newer RPCs before those gates pass.

## If Vercel Does Not Show Live

The dashboard should show `Supabase`/`Live` after the Production deployment is built with Supabase variables. If it shows `Sync issue`, Settings will list the missing variable. If it shows `Local build`, the deployed bundle was explicitly built with `VITE_AITASK_BACKEND=local`.

Vite embeds `VITE_*` values at build time, so changing Vercel environment variables only takes effect after a new deployment.

Demo account shortcuts are shown only when `VITE_AITASK_SHOW_DEMO_LOGIN=true` (and never in hosted builds by default — the app fails closed).

## Local Development

```bash
pnpm dev      # local demo mode (no Supabase)
pnpm build    # production build
```

Set `VITE_AITASK_BACKEND=supabase` plus the URL/key above to develop against a hosted workspace.

## Production Note

The legacy shared-JSON snapshot bridge (`aitask_app_state`) is an interim compatibility path. The secure deployment uses Supabase Auth with identity-based RLS; before onboarding real clients, confirm `supabase/secure-cutover.sql` has been applied so anonymous snapshot access is revoked.
