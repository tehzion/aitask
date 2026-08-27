# AiTask

AiTask is a React, TypeScript, Vite, Tailwind, and Zustand task-management SPA for a marketing agency workflow.

## Supabase Readiness

The app runs in local demo mode by default. Production deployments use the
secure identity-based Supabase backend: Supabase Auth, normalized RLS-protected
tables, file storage, and versioned command RPCs with per-entity and
workspace-level optimistic concurrency.

1. Copy `.env.example` to `.env.local` (or configure `.env.production` for a hosted build).
2. Apply `supabase/secure-auth-schema.sql` plus every migration under
   `supabase/migrations/` in filename order (`supabase db push` does both).
3. Set `VITE_AITASK_BACKEND=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
   Keep `VITE_AITASK_SHOW_DEMO_LOGIN=false` for hosted/client-facing builds.
4. Restart the Vite dev server (or redeploy).

Settings shows the active backend, sync status, and last sync time.

The legacy JSON-snapshot bridge (`public.aitask_app_state`, `supabase/schema.sql`)
is an interim compatibility path used only while migrating an old snapshot
deployment; `supabase/secure-cutover.sql` revokes anonymous access to it.
`pnpm verify:supabase` validates the deployed tables, policies, and RPC surface.

Before upgrading a live deployment, read
`docs/production-rpc-mismatch-recovery.md`: the app fails closed into a
read-only state until the backend exposes the required schema-version RPCs, and
the runbook defines the backup/preflight gates for applying new migrations.

## Vercel Deployment

This app is Vercel-ready as a Vite SPA. `vercel.json` configures the build output and rewrites all app routes to `index.html` for React Router.

For deployment steps and required Supabase environment variables, see `DEPLOYMENT.md`.

## Development

```bash
pnpm dev
pnpm lint
pnpm check
pnpm build
```

## Release Versioning

The semantic release number is stored in `package.json`. Every build appends the
current Git commit, producing an identifier such as `v1.5.1+d9494d6`; a dirty local
workspace is marked with `.dev`.

Use one of these commands before a release, then update `CHANGELOG.md`:

```bash
pnpm release:patch
pnpm release:minor
pnpm release:major
```

- Patch: fixes and small polish (`1.0.0` to `1.0.1`).
- Minor: backward-compatible features (`1.0.0` to `1.1.0`).
- Major: breaking data, API, or workflow changes (`1.0.0` to `2.0.0`).

Production promotion is tag-only. Create a matching `v<version>` tag after the
release checks pass; the tagged workflow verifies the generated
`/build-info.json` version and full Git commit before and after deployment. See
[`docs/staging-release-setup.md`](docs/staging-release-setup.md) for the required
staging tenant, CI secrets, and rollback procedure.

## Original Vite Notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
