# AiTask Test Coverage Report

Audit date: 2026-10-17
Mode: audit only; no fixes applied

## Automated checks executed

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm check` | Passed | TypeScript project build with `--noEmit` |
| `pnpm lint` | Passed | ESLint completed with no reported findings |
| `pnpm verify:migrations` | Passed | 110 SQL migrations verified non-empty |
| `pnpm verify:i18n` | Passed | 0 findings across 171 source files |
| `pnpm test -- --maxWorkers=1 --reporter=dot` | Passed | 107 test files / 820 tests |
| `pnpm build` | Passed | 2,817 modules transformed; PWA generated; large runtime chunk warning |
| `node scripts/verify-pwa.mjs` | Passed | Manifest, shell, icons, and cache boundaries |
| `node scripts/verify-bundle-size.mjs` | Passed | Initial index JS 26.7 kB raw / 10.1 kB gzip |

### Build performance observation

The build passed but Vite reported:

- `workspaceRuntime`: 540.12 kB minified / 157.11 kB gzip.

The current bundle verifier passes because it budgets the initial index JS, not all eager chunks. This is recorded as a performance finding, not a failed build.

## Unit and component coverage

The 820 passing tests cover substantial behavior, including:

- Auth/local credential and password recovery behavior;
- security parsing/sanitization and message localization;
- role/permission visibility;
- secure workspace loading, paging, retry, conflict, and session invalidation;
- secure member and notification mutations;
- task/service saves and review workflows;
- uploads, file integrity, and reconciliation logic;
- dashboard/report calculations;
- PWA/update and state persistence helpers;
- feedback Edge Function validation/rate limiting through local harnesses.

Unit coverage does not prove live RLS, deployed RPC definitions, deployed Edge Function versions, browser rendering, or real network interruption behavior.

## Browser coverage

The configured Playwright suite contains 324 tests using one desktop Chrome worker and a local Vite mock backend. The first broad run began but was interrupted after the local test server became unavailable:

- 30 tests failed;
- 294 tests did not run;
- many failures after the first server issue were `ERR_CONNECTION_REFUSED` or fixture setup failures;
- this run must not be interpreted as 30 independent product defects.

Focused reruns were then performed:

### Focused accessibility result

Command:

```text
pnpm exec playwright test e2e/accessibility.spec.ts --project=desktop-chrome
```

Result: failed.

Failure: `e2e/accessibility.spec.ts:85` expected the Dashboard link to be focused after opening mobile navigation; the link existed but was inactive. Relevant implementation: `src/components/Sidebar.tsx:158-162`.

### Focused smoke result

Command:

```text
pnpm exec playwright test e2e/app-smoke.spec.ts --project=desktop-chrome
```

Result: failed.

The first clean attempt progressed through the app but could not find the injected “Mobile overlay QA” toast at `e2e/app-smoke.spec.ts:369` after online/PWA-update events. A prior cold run also timed out while navigating to `/clients` with the global “Loading AiTask…” fallback; a later clean run progressed past that point, so the cold-start loading symptom is currently classified as potential/flaky rather than a confirmed deterministic route defect.

### Browser coverage not proven

- Complete role-by-role browser flow coverage is not green in this audit.
- Cross-browser, touch-device, real PWA install, and production-hosted browser behavior were not established.
- Browser test failures were not fixed during this audit.

## Supabase/database coverage boundary

Repository SQL tests and migration-specific pgTAP files were inspected, but no live Supabase verifier was run. The repository includes `pnpm verify:supabase`, which performs an anonymous write probe; running it would violate the audit's non-mutating scope.

Therefore the following remain unverified:

- live migration history and aliases;
- live RLS policy/function/grant state;
- live Storage bucket/policies and object-owner behavior;
- live Auth settings and Edge Function versions;
- cross-company negative authorization tests against the intended deployed project;
- production network latency, timeout, and retry behavior.

Use a disposable local Supabase stack for mutation/integration tests. Use the production project only for read-only metadata/policy verification unless separate explicit authority is granted.

## Coverage gaps to close

1. Fix and rerun mobile focus and toast overlay tests.
2. Stabilize Playwright server startup/teardown and rerun all 324 tests.
3. Run the disposable Supabase migration/RLS/Storage/Edge integration suite.
4. Add explicit negative tests for PM cross-company service RPCs and department-scoped roles.
5. Add Auth/member lifecycle failure-injection tests for rollback and orphan recovery.
6. Add hosted-build configuration tests proving reset bypass is impossible in production.
7. Add chunk-level performance budgets and cold authenticated-route startup measurements.

## Overall test confidence

**Static/unit confidence: high.**
**Local UI confidence: incomplete; current focused regressions exist.**
**Live Supabase/security confidence: unverified.**
**Production-release confidence: insufficient until P0 gates in `IMPROVEMENT_PLAN.md` are complete.**
