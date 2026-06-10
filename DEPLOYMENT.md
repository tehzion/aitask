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
```

5. Redeploy the Vercel project after saving env vars.

The first Supabase-enabled visit creates the workspace snapshot from the current app state: maintained login accounts and starter projects, with no seeded demo tasks. After that, users, tasks, projects, notifications, registrations, and custom roles sync through Supabase.

If the app was already live before the freshness update, run the latest `supabase/schema.sql` again before redeploying. It keeps the existing snapshot and adds the `version` column plus explicit Data API grants used for conflict-safe sync.

## If Vercel Still Shows Local

The dashboard badge `Local build` means the deployed Vite bundle was built without `VITE_AITASK_BACKEND=supabase`. Vite embeds `VITE_*` values at build time, so changing Vercel environment variables only takes effect after a new deployment.

Check the Vercel project has these variables in the same environment you are viewing, usually Production:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_STATE_TABLE=aitask_app_state
VITE_SUPABASE_STATE_ID=default
```

Then redeploy from Vercel. When the build is correct, Dashboard and Settings show `Supabase`/`Live` instead of `Local build`.

## Local Check Before Deploy

Run these serially:

```bash
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
