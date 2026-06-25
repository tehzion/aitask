# Vercel + Supabase Setup

AiTask can deploy to Vercel as a Vite single-page app.

## Vercel

Use these project settings:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: Vercel default

The included `vercel.json` sends all routes to `index.html` so React Router direct links work, including `/tasks`, `/calendar`, `/reports`, `/approvals`, and `/settings`.

## Supabase

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/schema.sql`.
4. In Vercel, add these Environment Variables for Production, Preview, and Development:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STATE_TABLE=aitask_app_state
VITE_SUPABASE_STATE_ID=default
VITE_AITASK_SHOW_DEMO_LOGIN=false
```

5. Redeploy the Vercel project after saving env vars.

The first Supabase-enabled visit creates the workspace snapshot from the current app state: maintained login accounts and starter projects, with no seeded demo tasks. After that, users, tasks, projects, notifications, registrations, and custom roles sync through Supabase.

If the app was already live before the freshness update, run the latest `supabase/schema.sql` again before redeploying. It keeps the existing snapshot and adds the `version` column plus explicit Data API grants used for conflict-safe sync.
The latest schema also removes broad demo snapshot policies and installs the guard trigger that rejects password/token/secret-like JSON keys.

Before redeploying, verify the frontend key can read the snapshot through the Supabase Data API:

```bash
npm run verify:supabase
```

That command reports the current snapshot version and `updated_at`. If it fails with `401`/`403`, check the publishable key, table grants, and RLS policies before sending clients back to the app.

## If Vercel Does Not Show Live

The dashboard should show `Supabase`/`Live` after the Production deployment is built with Supabase variables. If it shows `Sync issue`, Settings will list the missing variable. If it shows `Local build`, the deployed bundle was explicitly built with `VITE_AITASK_BACKEND=local`.

Vite embeds `VITE_*` values at build time, so changing Vercel environment variables only takes effect after a new deployment.

Check the Vercel project has these variables in the same environment you are viewing, usually Production:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STATE_TABLE=aitask_app_state
VITE_SUPABASE_STATE_ID=default
VITE_AITASK_SHOW_DEMO_LOGIN=false
```

Then redeploy from Vercel. When the build is correct and `supabase/schema.sql` has been run, Dashboard and Settings show `Supabase`/`Live`.

If clients already used the app before Supabase was live, the next hosted load now recovers browser-local workspace changes that are newer than the remote snapshot and syncs that merged state back to Supabase.

Demo account shortcuts and demo passwords are shown by default for walkthroughs. Set `VITE_AITASK_SHOW_DEMO_LOGIN=false` to hide them for client-facing deployments.

## Local Check Before Deploy

Run these serially:

```bash
npm run verify:supabase
cmd /c npm run lint
cmd /c npm run check
cmd /c npm run build
```

Then preview locally if needed:

```bash
cmd /c npm run preview
```

## Important Production Note

The current Supabase bridge is a shared JSON snapshot so the app can move online quickly without breaking workflows. Before a real production launch, migrate to Supabase Auth, normalized tables, storage buckets for attachments, and stricter row-level security policies.
