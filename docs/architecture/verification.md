# Refactoring verification

Verification date: 24 October 2026. The repository was checked with Node 22.23.2 and pinned pnpm 10.4.1. No production deployment or database mutation was performed.

## Completed automated checks

| Check | Outcome |
| --- | --- |
| Initial TypeScript / lint / production build | Passed before extraction |
| Initial unit baseline | 919 tests, 120 files passed |
| Final TypeScript | Passed |
| Final lint | Passed, zero lint warnings |
| Final unit suite | 924 tests, 121 files passed; includes five concurrently added security tests |
| Architecture checker tests | 9 passed |
| Module boundary/import resolution | Passed; no private-entry violations |
| Runtime / type-inclusive dependency cycles | 0 / 0 |
| Strict localization AST audit | 0 findings across 226 production source files |
| Non-empty migrations | 125 files verified; this is not migration replay validation |
| Production bundle budgets | Passed |
| PWA manifest/cache/build contracts | Passed |
| Production-mode English/Chinese recovery UI | 1 browser test passed |
| Production-built local PWA workflows | 3 browser tests passed |
| Differential browser cases after fixture correction | 7 passed; unchanged assertions/timeouts |
| Full local browser before/after comparison | Baseline: 248 passed / 114 failed / 3 not run. Refactored before fixture correction: 242 passed / 119 failed / 4 not run. All 7 differing cases passed after fixture-readiness correction; remaining full-run failures are retained below. |
| Disposable database rollout | Failed on existing migration/manifest conditions described below |

The final dependency inventory contains 226 production TypeScript/TSX files, 1,261 runtime edges, and 174 erased type-only edges. See [dependency-summary.json](evidence/dependency-summary.json). Declared entry points are checked against real files. The nine checker tests cover cycle detection, shared dependencies, dynamic/side-effect/type imports, private interfaces, composition exceptions, action-store isolation, infrastructure boundaries, and domain/UI separation.

## Workflow coverage

The retained unit tests cover PM portfolio/ownership restrictions, HOD and department parity, multi-project staff participation, task assignment and stages, optional review, revision/reopening, client privacy, member permissions, service plans and monthly cycles, renewal integrity, notification recipients/read receipts, optimistic versions, retained retries, session invalidation, and snapshot restoration. Tests and their mocks moved with the responsible feature or infrastructure implementation.

The browser suite exercises role navigation, mobile/responsive views, workflow editors, failure/retry/discard behavior, notification filters/popups, recurring records, reports, and tutorials. A test failure in an unchanged source snapshot is recorded as an existing failure rather than silently fixed or suppressed during a structural refactor.

The JSX comparison verified exact normalized source equality for all 274 Tasks JSX nodes and all 533 Approvals/review-panel JSX nodes. The comparison of 77 extracted feature-action bodies found no unexpected structural behavior changes; the pre-existing concurrent email-confirmation update is explicitly excluded from this refactor's behavior-preservation claim.

## Browser-run conditions

The initial source was preserved in a temporary baseline workspace with its own server and test outputs. Only temporary Vite filesystem allowances were added so that snapshot could serve the shared installed fonts; the application and browser tests were unchanged. Baseline build metadata has no Git checkout in that temporary directory, so Git metadata warnings are harness-only.

An intermediate run reused a server after source formatting. Vite's timestamped hot-module imports caused UI and fixture imports to address different store instances, invalidating that run. It was interrupted and excluded. The completed full serial run used a fresh server with frontend source held fixed. An attempted four-worker run was interrupted because of memory contention on this 8 GB host and is excluded from the comparison. The isolated accessibility/login retest passed. No test assertion or timeout was relaxed to mask those results.

The PWA tests ran a production-built explicit local demo backend; they do not prove availability of a hosted Supabase tenant. The production-mode recovery UI test displays forms and verifies localization/accessibility without submitting recovery mail.

## Full browser results and differential investigation

Both full runs attempted the same 365 test cases with the repository's serial worker settings. Neither full suite passed. The untouched snapshot produced 248 passes, 114 failures, and 3 tests not run; the refactored tree produced 242 passes, 119 failures, and 4 tests not run before fixture-readiness corrections. Full per-test outcomes are in [browser-before.txt](evidence/browser-before.txt), [browser-after.txt](evidence/browser-after.txt), and [browser-comparison.json](evidence/browser-comparison.json).

Seven cases differed from the baseline failure set. In an isolated rerun of those same seven cases, the untouched source reproduced five failures and passed two; the refactored source reproduced six failures and passed one. This demonstrates existing timing-sensitive fixture behavior; it does not justify declaring all differences harmless without checking them.

Fixture inspection found direct store injection immediately after navigation, before the lazy app lifecycle's initial commit, and a responsive sign-in helper that navigated to Login before clearing the previous account. The targeted fixtures now wait for the rendered main region before injecting state, and responsive sign-in clears persisted account state before the fresh navigation. Message-probe injection also waits after navigation. Workflow assertions, expected values, and timeouts are unchanged. All seven isolated cases passed after this fixture-readiness correction, including the full responsive role/route matrix, both Staff review locales, comment acknowledgement/full-edit recovery, deletion counts, and conflict rendering. The earlier full-suite numbers remain visible rather than being relabeled as passing. The complete 365-case suite was not rerun after this test-only setup correction; no production source changed during these differential reruns. The 112 other refactored full-run failures also failed in the original full baseline. Remaining existing browser failures and database blockers still prevent release certification.

## Performance measurements

| Metric | Before | After |
| --- | ---: | ---: |
| Eager production JS chunks | 4 | 4 |
| Eager JS raw size | 1,018.3 KiB | 1,019.7 KiB |
| Eager JS gzip size | 294.1 KiB | 294.1 KiB |
| Eager gzip budget | 300 KiB | 300 KiB |
| Initial index JS raw/gzip | 13.0 / 5.4 kB | 13.0 / 5.4 kB |
| Chart vendor JS raw/gzip | 381.8 / 107.4 kB | 381.8 / 107.4 kB |
| Desktop login FCP, median | 426 ms | 312 ms |
| Desktop dashboard ready, median | 2,256 ms | 1,491 ms |
| Desktop 5,000-task reload, median | 949 ms | 1,073 ms |
| Throttled mobile login FCP, median | 21,786 ms | 21,216 ms |
| Throttled mobile dashboard ready, median | 16,082 ms | 16,551 ms |
| Throttled mobile 5,000-task reload, median | 17,359 ms | 18,223 ms |

These are two synthetic local development-server runs per profile with service workers blocked, not a production performance benchmark. Mobile uses 390×844, 4× CPU throttling, 150 ms latency, and 1.6 Mbps download throughput. Other verification processes shared the host; the desktop reload samples overlap (before 760–1,138 ms; after 991–1,154 ms). The raw timing samples are preserved in [before-startup.json](evidence/before-startup.json) and [after-startup.json](evidence/after-startup.json).

Timing changes cannot be attributed to this refactor from these samples. No performance improvement is claimed. The measured production eager gzip size and chunk count remain effectively unchanged. Hosted database latency, subscription delivery throughput, and real production load were not measured.

## Database and release limits

Docker became available and the original disposable rollout ran against a temporary local project. It failed during replay of an existing HOD authorization migration: `HOD assignment boundary was not found; review the current function before applying` (SQLSTATE P0001). As a result, pgTAP, advisors, and authenticated local postflight checks did not complete. See [database-before.txt](evidence/database-before.txt).

A later concurrent security change added `20261024090000_security_boundary_hardening.sql`. The final rollout gate rejects the current migration tail because it no longer matches the repair manifest. See [database-after.txt](evidence/database-after.txt). The refactor did not modify that migration or the manifest, change RLS/RPC authorization, or bypass rollout verification. Migration non-emptiness passing does not resolve either blocker.

Existing production build warnings about a chunk larger than 500 kB and stale Browserslist data remain visible. Browser tooling also emits the inherited FORCE_COLOR/NO_COLOR environment warning. These were not suppressed and no dependencies were upgraded to silence them.

Do not treat this working tree as deployment-approved: resolve the database gate and assess remaining baseline browser failures before release. The structure is source/data compatible, but hosted database regressions cannot be certified by the available successful checks.
