# Regression & Test Execution Report — AiTask

**Date:** 2026-10-17 · **Environment:** macOS, Node v22.23.2, pnpm 10.4.1
**Rule applied:** unexecuted tests are reported as *not run*, never as passing.

---

## 1. Executed gate (this review)

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Type check | `pnpm check` | **PASS** (exit 0) | `tsc -b --noEmit` no diagnostics |
| Lint | `pnpm lint` | **PASS** (exit 0) | `eslint .` no diagnostics |
| i18n coverage | `pnpm verify:i18n` | **PASS** — 0 findings / 170 files | AST audit |
| Migration guard | `pnpm verify:migrations` | **PASS** — 109 non-empty | script output |
| Unit tests | `pnpm test` | **PASS** — **105 files / 811 tests** | vitest |
| Production build | `pnpm build` | **PASS** — PWA precache 127 entries | `dist/` |

## 2. Flaky-test de-flake confirmation (SYN-03 / B5)

`taskStatusControls.test.ts` was de-flaked with fresh per-test fixtures and `vi.useFakeTimers()` (`:30-34`). The full suite ran green in this review. **Not yet stress-proven across many repeated runs** — CI should be watched for recurrence (the original failure appeared in ~1 of 4 runs).

## 3. Regression tests added by the fixes (reviewed, then executed as part of `pnpm test`)

| Test file | Covers | Executed |
| --- | --- | --- |
| `src/store/clientApprovalProgress.test.ts` | A2 completion keeps `Pending`; client review preserved | Yes (green) |
| `src/store/taskStageProgress.test.ts` | completion → `clientApprovalStatus:'Pending'`, 100% | Yes (green) |
| `src/lib/clientPortal.test.ts` | canonical `isAwaitingClientReview`/`isAwaitingInternalReview` | Yes (green) |
| `src/lib/taskStatusControls.test.ts` | completion gating, opt-out policy, revision authority | Yes (green) |
| `src/store/pmPortfolioIdScope.test.ts` | duplicate-name id isolation, foreign delete denial | Yes (green) |
| `src/lib/pmDuplicateClientScope.test.ts` | duplicate company-name service scope | Yes (green) |
| `src/store/duplicateClientDelete.test.ts` | id-first delete, Client-account cleanup | Yes (green) |
| `src/store/deliveryTaskLinks.test.ts` | PM link allowed in portfolio, denied foreign | Yes (green) |
| `src/lib/feedbackEdgeRateLimit.test.ts` | B7 results rate limit | Yes (green) |
| `src/store/servicePlans.test.ts` | B3 cycle/plan transition negatives | Yes (green) |
| `src/lib/monthlyRecords.test.ts` | GAP-D4 | Yes (green) |

## 4. NOT run (blocked / out of scope)

| Suite | Command | Blocker | Status |
| --- | --- | --- | --- |
| pgTAP DB suite (~60 files) | `supabase db test` | no linked Postgres | **Not run** (incl. `client_visible_completion_review`, `service_transition_guard`, `pm_client_scope_and_ownership`) |
| Playwright e2e (61+ specs) | `pnpm test:e2e` | no browsers | **Not run** (CI `ci.yml` executes these) |
| Supabase surface / rollout / DB-alignment | `pnpm verify:supabase*` | no live credentials | **Not run** |
| Deno edge-function type-check | — | `deno` not installed | **Not run** |

## 5. Prior-run evidence (from manifest — not re-executed here)

`migration_repair_manifest.review.json` records, from earlier authenticated rollouts: `completePgTapSuitePassed: 208`, `staffAuthorizationPgTapPassed: 29`, `hostedDatabaseAssertions: 15 / failures 0`, `clientPrivacyPgTapPassed: 9`. These support earlier migration batches but **do not cover the two newest pending migrations** (`pm_client_scope_and_ownership`, `department_scoped_visibility_cleanup`) or the two GAP-D pgTAP files.

## 6. Functional regression spot-checks (source-level)

- B2: approving a `Completed` task preserves `isCompleted:true` / `completionPercentage:100` (`store/index.ts:3032-3054`).
- B3: `Completed` cycle requires all deliverables `Delivered` (`store/index.ts:4265-4271`).
- B4: grantable groups exclude non-super-admin keys (`access.ts:177-187`).
- Cross-tenant: PM portfolio scoping is id-first, name-as-legacy-fallback (`store/index.ts:562-576`).
