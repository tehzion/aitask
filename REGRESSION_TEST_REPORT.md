# Regression Test Report

**Audit date:** 2026-10-17
**Environment:** macOS, Node `v22.23.2`, pnpm `10.4.1`, Supabase CLI `2.117.0`.

## Executed checks

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Type check | `pnpm check` | Pass | Exit 0 on current dirty tree |
| Lint | `pnpm lint` | Pass | Exit 0 |
| i18n AST coverage | `pnpm verify:i18n` | Pass | 0 findings across 171 source files |
| Migration guard | `pnpm verify:migrations` | Pass | 113 SQL migrations non-empty |
| Unit suite | `pnpm exec vitest run src --maxWorkers=1 --reporter=dot` | **Fail** | 107 files; 823 passed, 5 failed, 828 total |
| Production build | `pnpm build` | Pass | Vite/PWA build; 127 precache entries |
| PWA verifier | `node scripts/verify-pwa.mjs` | Pass | Manifest, app shell, cache boundaries valid |
| Bundle verifier | `node scripts/verify-bundle-size.mjs` | Pass | Eager graph 294.5 KiB gzip under 300 KiB cap |
| Disposable migration chain | Supabase local `start` | Pass | All current migrations applied in order |
| Disposable pgTAP | `supabase test db ... --local` | Pass | 67 files / 1,024 assertions |
| Disposable schema lint | `supabase db lint ... --local` | Pass | No schema errors |
| Disposable advisors | `supabase db advisors ... --local` | Pass with info | No fail-on-error findings |
| Anonymous security | `pnpm verify:supabase` against local stack | Pass | RPC/table/cutover probes all passed |

## Unit failures

Five current failures are deterministic expectation mismatches after `userFacingMessage` normalization:

- four cases in `src/lib/secureWorkspace.test.ts` still expect raw validation/permission strings;
- one case in `src/lib/serviceFileIntegrity.test.ts` still expects `RPC unavailable` instead of the safe request-failed descriptor.

These are release-gate failures even though the implementation direction is security/UX-positive.

## Browser verification

The configured suite lists **324 tests in 54 files**. The first sandbox run could not bind `127.0.0.1:4180`; an escalated rerun started successfully. The broad run then exposed failures in:

- `e2e/accessibility.spec.ts`: expected `Continue for now` was not available during the demo workspace bootstrap;
- `e2e/action-save-gaps.spec.ts`: password-setup/bootstrap state prevented the test harness from installing/using `window.finishActionSave`, and injected error text was absent;
- additional plan-date and task-quick-save cases in the same early sequence.

The run was intentionally interrupted after test 17 to avoid spending the remaining run budget on a known failing bootstrap path. It is therefore **not a full-suite pass**. No browser result should be represented as a production-role smoke pass.

## Database smoke helpers

Positive local authenticated paths passed for storage access, Staff action saves, HOD/PM/client workflows, and retry-oriented operations before teardown. The helper chain then failed during cleanup because the immutable history trigger rejected:

1. workspace cascade deletion; and
2. member deletion’s `actor_member_id ON DELETE SET NULL` update.

This is both a test failure and a confirmed migration behavior defect.

## Not executed or not sufficient

- `pnpm install --frozen-lockfile`: blocked by registry DNS and an interactive node_modules replacement prompt; the existing pinned install was used.
- `pnpm audit` / dependency vulnerability scan: not run because external registry access was unavailable.
- `pnpm verify:release-provenance`: not run to a release artifact; it requires an explicit deployed URL or build-info file.
- Full production/staging E2E and four-role smoke: no authenticated staging/production session.
- Edge Function Deno typecheck: Deno was not available as a repository gate.
- Live Supabase RLS/grants/Auth/Storage/backup settings: not independently queried.
