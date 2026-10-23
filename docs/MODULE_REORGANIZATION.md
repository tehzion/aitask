# Module reorganization report

Last reviewed: 2026-10-23

## Previous organization

The application used a conventional layer-first layout:

```text
src/
├── App.tsx / AppContent.tsx
├── components/       shared shell, feature UI, modal UI, and notifications
├── hooks/            application and feature hooks
├── lib/              domain rules, formatting, security, Supabase transport, notifications
├── pages/            route-level workflows
├── store/            one large Zustand store and store tests
└── types/            shared persisted/runtime contracts
```

This was operationally valid, but notification code was spread across `components`, `hooks`, `lib`, and `pages`, while app boot and route authorization were mixed into a single content component. That made ownership and safe change locations harder to discover.

## Updated organization

The first incremental boundary is now:

```text
src/
├── app/
│   ├── AppContent.tsx
│   ├── routeGuards.tsx
│   └── useAppLifecycle.ts
├── modules/
│   └── notifications/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       ├── services/
│       └── index.ts
├── components/       shared shell and reusable UI
├── hooks/            cross-feature hooks
├── lib/              shared rules, secure transport, and infrastructure
├── pages/            remaining route-level workflows
├── store/            unchanged state/mutation façade
└── types/            unchanged shared contracts
```

Moved notification responsibilities include the notification center, feed pagination, popup detection, presentation/localization, read-state helpers, secure notification adapter, read-action hook, sound hook, notification route, popup host, preview component, and their focused tests.

## Refactoring summary

- Moved application orchestration into `src/app` and split route guards from lifecycle side effects.
- Moved the notification feature into `src/modules/notifications` without changing its public behavior or data contracts.
- Updated only import paths and lazy route/component boundaries around those moves.
- Kept `src/store/index.ts`, Supabase snapshot/command handling, RLS-facing code, and persisted types unchanged in shape.
- The release also includes the separately reviewed `20261023180000_bind_service_command_entity_types` database guard, which binds service RPC command types to their permitted entity types and preserves the existing service-cycle transition rules.
- No route redesign or UI redesign was introduced.

## Cleanup and dependency review

No dead production code or package dependency was removed in this increment. The move itself removed duplicate ownership of notification files; it did not add compatibility wrappers or duplicate Supabase clients. Existing dependencies remain in use, including `@supabase/supabase-js`, `zustand`, `date-fns`, `react-router-dom`, and `recharts`.

The largest remaining concern is the store's size and mixed responsibilities, not an unused package. That should be addressed in a separately tested domain-slice change.

## Regression and performance status

After the move, TypeScript, lint, i18n coverage, the production build, the bundle budget, and the normal `pnpm test` suite pass. The focused accessibility and app-smoke flows pass against the migrated tree. The live database guard was exercised by a transactional six-assertion pgTAP probe; the disposable local Supabase rollout remains unavailable because Docker is not running.

The move preserves lazy loading for the notification route, popup host, and preview. It makes no query, realtime, state-update, or rendering algorithm change, so no runtime performance improvement is claimed. The final build kept the shared `workspaceRuntime` chunk at 570.68 kB minified / 163.92 kB gzip and `reportsCharts` at 391.01 kB / 110.19 kB gzip; Vite continues to report the existing >500 kB `workspaceRuntime` warning and stale Browserslist data notice.
