# AiTask — Test & Verification Report

**Date:** 2026-10-16 · **Version:** `3.0.0` · branch `codex/delivery-review-blindspots` (HEAD `d35e2a1`, uncommitted tree)
**Environment:** local developer machine (macOS, Node 22). **No live Supabase/staging project; no browsers provisioned for this audit.**

---

## 1. What was run (safe local checks)

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| TypeScript | `pnpm check` (`tsc -b --noEmit`) | **PASS** (exit 0) | no diagnostics |
| Lint | `pnpm lint` (`eslint .`) | **PASS** (exit 0) | no diagnostics |
| i18n coverage | `pnpm verify:i18n` | **PASS** — 0 findings across 172 source files | AST audit output |
| Unit tests | `pnpm test` (`vitest run src`) | **756 passed / 756** on runs 2–4, but **run 1 failed 1** | see §3 |
| Production build | `pnpm build` (`tsc -b && vite build`) | **PASS** (exit 0); service worker + PWA precache generated | `dist/` |

Not run (and why):
- **Playwright e2e** (61 specs) — browsers not provisioned for this audit.
- **pgTAP DB suite** (~6.5k LOC, ~60 files) — no linked/local Postgres in scope.
- **`pnpm verify:supabase` / `verify:supabase:rollout` / `verify:release-db-alignment`** — require a live project.
- **`pnpm verify:pwa`, `verify:bundle`, `verify:csv:libreoffice`** — browser/LibreOffice dependencies.

---

## 2. Test inventory (static)
- **Vitest** `src`: 99 test files, 756 tests (after a successful run). Dense coverage of `lib/` helpers and `store/` reducers.
- **Playwright** `e2e/`: 61 spec files (role flows, i18n login, PWA, regressions).
- **pgTAP** `supabase/tests/database/`: ~60 SQL test files covering RLS, RPC authorization, workflow gates, notifications.
- **Verification scripts** `scripts/`: 21 (i18n, bundle, PWA, Supabase surface, release provenance, DB alignment, CSV).

---

## 3. Flaky test — CONFIRMED

- **File:** `src/lib/taskStatusControls.test.ts:40`
- **Observed:** first `pnpm test` → `1 failed | 755 passed` (`expected { status: 'Completed', … } to be undefined`). Next **2 full-suite runs** and **5 isolated runs** → all pass.
- **Attempted root-cause ruled out:** the obvious shared-fixture mutation is not the cause — `getTaskStatusOptions` returns a freshly built array (`src/lib/taskWorkflowAccess.ts:45`), and `getTaskStatusControls` pushes into that fresh array (`src/lib/taskStatusControls.ts:19-20`), so the caller's `statuses` array is not mutated.
- **Remaining hypotheses:** cross-file module state, worker scheduling, or a time-dependent branch (`canReviewTaskInternally` compares `Date.parse(...) > Date.now()`).
- **Impact:** nondeterministic CI; a genuine regression could be masked by a re-run.
- **Recommended next step:** reproduce under `vitest run --no-file-parallelism` and `--sequence.shuffle=true`; if stable in isolation, audit for shared module-level state across test files.

---

## 4. Coverage gaps (areas with weak or no automated verification)

| Area | Gap | Related finding |
| --- | --- | --- |
| Client approval lifecycle | No test asserts `clientApprovalStatus='Approved'` has a matching `approvalHistory` event | DBG-01 |
| Dashboard selectors | No cross-module test asserting PM/Boss/client "awaiting review" agree | DBG-02 |
| Client reopen | Tests *assert* the reopen behaviour as legacy-intended rather than guarding against regressions | DBG-03 |
| Service cycle / plan transitions | No negative tests for impossible transitions | DBG-06/07 |
| `Project` task counts | No coverage of `totalTasks/completedTasks` | DBG-04 |
| `primaryTaskId` integrity | No test for delete/unlink cleanup | DBG-05 |
| Permission editor | No test that non-grantable keys are hidden/stripped consistently | AUTH-01 |
| Empty migration | No CI guard that migration files are non-empty | OPS-01 |
| Feedback `results` throttle | No test (or limit) on the reviewer read path | SEC-02 |
| Snapshot validation | No tests asserting service collections are schema-validated | SYN-04 |

---

## 5. Explicitly UNVERIFIED (needs live environment)

- **RLS / grants in the live project.** Whether `aitask_app_state` anon/authenticated grants are actually revoked (`SEC-01`), whether `service_role` holds only the documented `SELECT, UPDATE` on `aitask_members`, and whether the storage bucket policies match source (`SUPABASE_AUDIT` §2).
- **Deployed schema version / migration state.** Whether the 9 `pendingProductionMigrations` are still pending in production, and whether the empty migration has already been recorded as applied (`OPS-01`, `SUP-IZ`).
- **pgTAP results.** The DB suite (including the previously failing `staff_task_contact_notifications.test.sql` / `task_signed_review_readiness.test.sql` fixtures noted in prior audits) was not executed.
- **Playwright e2e.** Not executed; the in-flight hardening's e2e assertions (`staff-audit-regressions.spec.ts`) were not run.
- **Production data integrity.** Duplicate company names, orphaned `primaryTaskId`, and historical approval histories were not inspected (`Unverified`).
- **Runtime RLS isolation across tenants/users.** Cannot be exercised without a live project.

> Per the audit brief: no feature is claimed "tested" here unless it was actually executed. Everything under §5 is **code review only**.

---

## 6. Recommended verification additions (for the fix phase)
1. Unit test: completing a client-visible task must leave `clientApprovalStatus` reviewable **or** record an approval event.
2. Unit test: one canonical `isAwaitingClientReview` yields identical results across `pmDashboard`, `ServiceRoleDashboard`, and `deliveryTracker` fixtures.
3. Unit test: `reviewClientApproval` must not mutate a `Completed` task.
4. Unit tests: `setServiceCycleStatus` / `setClientPlanStatus` reject impossible transitions.
5. CI guard: fail if any `supabase/migrations/*.sql` is 0 bytes.
6. De-flake `taskStatusControls.test.ts` (see §3).
7. Wire `pnpm verify:supabase:rollout` into release CI once staging access is restored.
