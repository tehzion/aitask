# Full System Performance & Production Stability Audit

Date: 2026-10-23
Scope: `/Users/user/Downloads/aitask-master`
Assessment: **Conditional — local quality gates pass, but production readiness is not verified and the slow-mobile large-workspace profile regressed.**

## Executive summary

The audit found and addressed three measurable frontend cost centers:

- The application entry graph eagerly pulled the authenticated store/runtime into the public entry path. The shell was split into `AppContent`, reducing the initial index chunk from 28.5 kB raw / 10.9 kB gzip to 12.8 kB raw / 5.4 kB gzip.
- Project Manager task visibility rebuilt portfolio/client lookup sets inside a per-task predicate. Collection-level lookup sets are now built once.
- Dashboard statistics and monthly completion reporting performed repeated task-array passes. Both now use linear collection passes.
- `ServiceRoleDashboard` now subscribes to the relevant store slice rather than the entire Zustand store.

The bundle gate now passes: the eager JavaScript graph is 294.1 KiB gzip against a 300 KiB cap. Local desktop measurements improved for the 5,000-task dashboard, but the same synthetic large-workspace scenario became slower under the throttled mobile profile. That regression is unresolved and is the main follow-up before production promotion.

The source audit itself did not change Supabase policies or data shape. The release candidate now also includes the separately reviewed `20261023180000_bind_service_command_entity_types` guard migration; its production alias is `20261023154255_bind_service_command_entity_types` and its transactional six-assertion database probe passes.

## Measurement conditions

The startup profiler used a local production build with the local backend and a synthetic persisted workspace containing 5,000 tasks. It blocked service workers. The slow-mobile profile used a 390×844 viewport, 4× CPU throttling, 150 ms latency, and approximately 1.6 Mbps download throughput. Desktop used a 1440×900 viewport.

These measurements do **not** include hosted Supabase latency, production CDN behavior, real database query plans, real authentication latency, or real device memory pressure. `loginFcpMs` is First Contentful Paint, not Largest Contentful Paint.

## Before / after evidence

| Metric | Baseline | After | Result |
|---|---:|---:|---|
| Initial index JavaScript | 28.5 kB raw / 10.9 kB gzip | 12.8 kB raw / 5.4 kB gzip | Improved |
| Eager JavaScript graph | 1032.5 KiB raw / 300.7 KiB gzip | 1018.0 KiB raw / 294.1 KiB gzip | Budget now passes |
| Report chart chunk | 381.8 kB raw / 107.4 kB gzip | 381.8 kB raw / 107.4 kB gzip | Unchanged; within budget |
| Desktop authenticated dashboard ready | 1400–1662 ms | 1386–1597 ms | Mixed; no stable improvement |
| Desktop 5,000-task dashboard ready | 406–432 ms | 347–400 ms | Improved in repeated runs |
| Slow-mobile authenticated dashboard ready | 4016–4169 ms | 3985–4106 ms | Mixed; no stable improvement |
| Slow-mobile 5,000-task dashboard ready | 2664–2688 ms | 2812–2987 ms | Regression |
| LCP / INP / CLS | Not measured | Not measured | Required before release |
| API request count / DB latency | Not measured | Not measured | Requires hosted environment |
| Heap growth / memory pressure | Not measured | Not measured | Requires trace or device run |

The post-change ranges combine two runs from each local profile. They are directional evidence, not a production SLO result.

## Static findings and remediations

### Frontend and bundle loading

- The public entry now lazy-loads `AppContent`, keeping the authenticated runtime, store, and Supabase client out of the initial entry module.
- The route-level lazy loading already present in the repository was preserved.
- The `workspaceRuntime` chunk remains large at 570.7 kB raw / 163.9 kB gzip and triggers Vite's 500 kB raw warning. It is not part of the initial index chunk, but it is still a material authenticated-runtime cost.
- The generated PWA build precaches 152 entries totaling approximately 2.8 MiB. Install/update cost on low-bandwidth devices needs a real-device measurement.

### Rendering and client-side computation

- `ServiceRoleDashboard` now uses a shallow selector for the arrays and permissions it actually renders.
- PM visibility now avoids rebuilding ownership sets for every task and preserves the Boss Koo authorization exception.
- Dashboard summary counts and tracked monthly completions now use single-pass aggregation.
- The Tasks page still performs client-side filtering and does a per-task user lookup during search. For larger real workspaces, server-side filtering/pagination or virtualization remains the highest-value next frontend optimization.

### Supabase, persistence, and realtime

- Existing code has explicit realtime channel cleanup, filtered subscriptions, cancellation/timeout handling, paged workspace loading, and bounded notification loading. These paths were reviewed statically and no schema change was required.
- Live Supabase query plans, index selectivity, `pg_stat_statements`, RLS role matrices, realtime reconnect behavior, storage policies, and hosted latency were not available in this environment.
- Therefore the audit cannot certify database performance, production RLS correctness, realtime delivery, backup/restore behavior, or rollback safety.

### Dead code, dependencies, and error handling

- No dead-code or dependency removal was made without runtime evidence. TypeScript and ESLint are clean, but a full `depcheck`/`ts-prune` analysis is not part of the repository's current verified toolchain.
- No unhandled error path was declared fixed solely from static inspection. Production error rates and frontend error boundaries still require deployed telemetry.
- The build reports stale Browserslist data; this is maintenance noise, not a release-blocking runtime defect.

## Verification results

| Check | Result |
|---|---|
| `pnpm check` | Passed |
| `pnpm lint` | Passed |
| `pnpm test -- --reporter=dot` | 120 files passed; 919 tests passed |
| `pnpm build` | Passed; 2,604 modules transformed |
| `pnpm verify:bundle` | Passed; eager graph 294.1 KiB gzip |
| Focused `e2e/app-smoke.spec.ts` against dedicated local server | 1 passed |
| Full `pnpm test:e2e` run | Did not complete: local test-server connection dropped; 6 setup/action failures, 1 interrupted, 346 not run, 12 passed |

The full E2E result is a test-environment/bootstrap failure, not evidence that the product flow is broken or fully covered. It should be rerun after stabilizing the web-server lifecycle in CI.

## Release decision and required follow-up

Do not label this production-ready from this audit alone. Before promotion:

1. Capture a throttled-mobile trace for the 5,000-task reload and identify the regression source, especially local-storage parsing, store hydration, and dashboard render work.
2. Add a production-like performance harness recording LCP, INP, CLS, request count, authenticated boot time, long tasks, heap growth, and realtime reconnect behavior.
3. Run the Supabase staging gate with real RLS role coverage, `EXPLAIN (ANALYZE, BUFFERS)` for task/project queries, index review, realtime disconnect/reconnect tests, storage policy tests, and rollback/backup checks.
4. Stabilize the full Playwright web-server lifecycle so the complete suite runs deterministically.
5. Split or defer the remaining authenticated `workspaceRuntime` cost and consider server-side task filtering/pagination or list virtualization.
