# AiTask Supabase Integration

This project now supports an opt-in Supabase snapshot backend while keeping the local demo mode intact.

## Quick Setup

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Set:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_AITASK_SHOW_DEMO_LOGIN=false
```

5. Restart the Vite dev server.

The first run creates a `default` workspace snapshot from the current app state: maintained login accounts and starter projects, with no seeded demo tasks. After that, task, project, user, registration, and notification state syncs to Supabase.

Existing live projects should rerun `supabase/schema.sql` before deploying newer frontend builds. The script is idempotent and adds the snapshot `version` column and explicit Data API grants needed for live freshness and conflict-safe saves.
It also removes the broad demo snapshot policies and installs a JSON guard trigger that rejects password, token, secret, API-key, and service-role fields.

Run this after setting env vars to confirm the browser key can reach the snapshot:

```bash
npm run verify:supabase
```

The command prints the current snapshot version and `updated_at`. If it fails, fix Supabase grants/RLS or Vercel env before asking users to rely on live sync.
It also verifies that demo policies are gone, the guard trigger exists, and the current snapshot contains no forbidden secret-like keys.

## Production Path

The snapshot backend is meant to make integration safe without rewriting every workflow at once. Before production, replace it with normalized Supabase tables, Supabase Auth, and role-level RLS policies for:

- profiles
- projects
- tasks
- task_comments
- task_approval_events
- notifications
- registrations
- storage attachments
