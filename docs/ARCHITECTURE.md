# AiTask architecture

Last reviewed: 2026-10-23

This document describes the current implementation and the incremental module boundary established during the codebase reorganization. It is intentionally implementation-led: the existing workflows, persistence model, permissions, and UI remain the source of truth.

## Runtime map

```text
src/main.tsx
  └─ providers (theme, i18n, error boundary, PWA/update diagnostics)
     └─ src/App.tsx (router entry and suspense boundary)
        └─ src/app/AppContent.tsx (route table and shell notices)
           ├─ src/app/routeGuards.tsx (authentication and path authorization)
           ├─ src/app/useAppLifecycle.ts (backend boot, sync, session recovery)
           ├─ src/components/Layout.tsx (authenticated shell and outlet context)
           ├─ src/pages/* (page-level workflows)
           └─ src/modules/notifications/* (notification UI, state actions, services)

src/store/index.ts
  ├─ local workspace state and Zustand actions
  ├─ optimistic mutations and save/recovery orchestration
  └─ Supabase snapshot/realtime integration

src/lib/*
  ├─ pure domain rules and transformations
  ├─ shared UI/application utilities
  └─ secure backend transport and authorization-facing adapters

src/types/index.ts  ── shared persisted/runtime contracts
src/mock/*           ── local/demo data and local-only workflows
supabase/*           ── schema, RLS, RPC, and deployment verification assets
```

## Business responsibility map

| Business area | Current implementation boundary |
| --- | --- |
| Authentication and account access | `src/lib/auth.ts`, `src/lib/authRecovery.ts`, `src/pages/Login.tsx`, `src/pages/AccountPassword.tsx`, `src/app/routeGuards.tsx` |
| User, role, and department management | `src/pages/Approvals.tsx`, `src/pages/Settings.tsx`, `src/lib/access.ts`, `src/lib/departments.ts`, store member actions |
| Projects, clients, and task workflows | `src/pages/Clients.tsx`, `src/pages/Tasks.tsx`, `src/pages/ClientWorkspace.tsx`, `src/lib/projectManagement.ts`, `src/lib/task*`, store task/project actions |
| Approval and review workflows | `src/pages/Approvals.tsx`, `src/components/DeliveryReviewPanel.tsx`, `src/components/TaskReviewSettings.tsx`, `src/lib/workflowReview.ts`, `src/store/taskReviewActions.ts` |
| Recurring work and monthly operations | `src/hooks/useMonthlyServiceCycles.ts`, `src/lib/monthlyRecords.ts`, service-plan components, store cycle actions |
| Notifications and realtime user feedback | `src/modules/notifications`, `src/lib/supabaseClient.ts`, `src/lib/secureWorkspace.ts`, store notification projections |
| Dashboard and reporting | `src/pages/Dashboard.tsx`, `src/components/ServiceRoleDashboard.tsx`, `src/lib/dashboardData.ts`, `src/lib/pmDashboard.ts`, `src/lib/taskReporting.ts`, `src/pages/Reports.tsx` |
| Files and attachments | `src/lib/serviceFiles.ts`, `src/lib/taskOutputUpload.ts`, `src/lib/taskOutputEvidence.ts`, task/delivery components |
| Settings, onboarding, and support | `src/pages/Settings.tsx`, `src/pages/Help.tsx`, onboarding/tutorial and theme utilities |

## Boundaries and conventions

- `src/app` owns application orchestration only. Route guards and lifecycle side effects do not belong in individual business pages.
- `src/modules/<name>` owns cohesive business UI, hooks, and services. The notifications module is the first completed boundary and is deliberately dependent on shared types, access rules, secure transport, and the store; it does not own those cross-cutting concerns.
- `src/lib` contains reusable domain rules, transformations, security helpers, and transport adapters. It must not import page components or feature UI.
- `src/components` contains shared shell and reusable UI. A component that is specific to one business area should move with that area when the next module is refactored.
- `src/store` remains the state and mutation façade. Authorization and database security stay in the store/server/RLS path; moving presentation code must never become the only permission check.
- `src/types/index.ts` is the shared contract for persisted entities and runtime projections. Database column names and persisted enum values are not renamed for style.
- New imports should use the nearest module boundary and should not reach through another feature's UI. A module may consume shared services and explicit store actions, but unrelated pages must not be used as services.

## Data access and authorization

There are two supported backends behind the same store contract: local/demo storage and Supabase. `src/lib/backend.ts` selects the mode; `src/lib/supabaseClient.ts` owns the configured client and realtime invalidation channels; `src/lib/secureWorkspace.ts` owns the RLS-protected command/snapshot protocol. The notification secure adapter is located with notification code but receives its transport runtime from `secureWorkspace`, so the database authorization boundary is unchanged.

The frontend derives visibility for display, but secure commands, snapshot loading, and Supabase RLS remain authoritative. Permission changes are refreshed through the existing member/workspace realtime channels and the normal snapshot path.

## State-management conventions

- Use local React state for modal visibility, filters, draft inputs, and other page-local interaction state.
- Read small store slices with selectors; use `useShallow` only for a deliberately grouped set of related values.
- Keep optimistic writes, recovery, conflict handling, and server commands in the store/secure transport path.
- Do not copy persisted entities into a second global store. Derived views belong in pure `src/lib` functions or component memoization.
- Preserve the notification feed's realtime invalidation and read-state rollback behavior when changing notification UI.

## Development and verification

```text
pnpm check       TypeScript project check
pnpm lint        ESLint
pnpm test        Vitest unit/component tests
pnpm build       production TypeScript + Vite/PWA build
pnpm test:e2e    Playwright regression suite (requires its configured environment)
```

The 2026-10-23 pre-refactor baseline was: TypeScript pass, 120 test files / 919 tests pass, production build pass, and a clean lint rerun pass. The first parallel lint invocation reported a transient parse error while the existing App shell file was being changed; a subsequent standalone run passed.

## Remaining architecture debt

- `src/store/index.ts` is still the largest boundary at roughly 6,760 lines. It should be split into domain slices only after each slice has explicit mutation and persistence contracts.
- Several page components remain oversized (`Approvals`, `Calendar`, `Clients`, `ClientWorkspace`, `Tasks`, `Settings`). Extracting view-only sections is lower risk than moving workflow logic without tests.
- `src/lib` still mixes pure domain services and secure transport adapters. The next extraction should introduce explicit service categories without duplicating Supabase clients.
- There is no automated import-cycle rule in the current toolchain. A static relative-import scan currently reports pre-existing secure transport/store cycles (`secureWorkspace` ↔ secure command helpers and `store` ↔ `taskReviewActions`); the notification secure adapter also appears through a type-only runtime contract import. Add an import-cycle rule after the module graph stabilizes, then enforce app → modules/shared and module → shared directionality.
- The existing generated audit/output files and deployment artifacts are intentionally outside the application module graph and were not reorganized.
