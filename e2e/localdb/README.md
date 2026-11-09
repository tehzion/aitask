# Local Supabase fault-injection tests

These scenarios are destructive to the **local** `aitask-main` workspace: `local_reset.sql` deletes its non-configuration entities before each test. Use a dedicated local stack with disposable QA data; do not use a shared development database. The database address is fixed to `127.0.0.1:54322`, and the reset requires the explicit `AITASK_LOCALDB_ALLOW_RESET=yes` environment variable. Back up any local data first.

Start the local Supabase stack and a fresh Vite process configured for that stack as described in the audit handoff. Restart Vite after changing `src/store/index.ts`; an HMR-created store instance makes state assertions unreliable. Provide the seeded `boss`, `pm`, `hod`, and `staff` local-only accounts. Then run:

```sh
AITASK_LOCALDB_ALLOW_RESET=yes LOCALDB_PORT=4320 pnpm exec playwright test -c e2e/localdb/playwright.localdb.config.ts
```

The suite does not start Storage. Upload replay requires a separate local stack with Storage enabled. Do not point the UI or tests at a hosted Supabase instance.
