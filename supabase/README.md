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
VITE_SUPABASE_ANON_KEY=your-anon-key
```

5. Restart the Vite dev server.

The first run creates a `default` workspace snapshot from the local demo data. After that, task, project, user, registration, and notification state syncs to Supabase.

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
