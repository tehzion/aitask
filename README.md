# AiTask

AiTask is a React, TypeScript, Vite, Tailwind, and Zustand task-management SPA for a marketing agency workflow.

## Supabase Readiness

The app runs in local demo mode by default and now includes an opt-in Supabase snapshot backend.

1. Copy `.env.example` to `.env.local`.
2. Run `supabase/schema.sql` in your Supabase SQL editor.
3. Set `VITE_AITASK_BACKEND=supabase`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
   Keep `VITE_AITASK_SHOW_DEMO_LOGIN=false` for hosted/client-facing builds.
4. Restart the Vite dev server.

Settings shows the active backend, snapshot table, and last sync time.

The current Supabase bridge stores the working mock app state in `public.aitask_app_state` so existing UI workflows continue to work while backend migration is staged. Before production, move to Supabase Auth, normalized tables, file storage, and stricter RLS policies. See `supabase/README.md`.
The bridge must never store passwords or secret-like fields; `supabase/schema.sql` includes a guard trigger and `npm run verify:supabase` checks the deployed table/policies.

## Vercel Deployment

This app is Vercel-ready as a Vite SPA. `vercel.json` configures the build output and rewrites all app routes to `index.html` for React Router.

For deployment steps and required Supabase environment variables, see `DEPLOYMENT.md`.

## Development

```bash
npm run dev
npm run lint
npm run check
npm run build
```

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
