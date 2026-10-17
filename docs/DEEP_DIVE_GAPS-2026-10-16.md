# AiTask — Deep Dive: Cross-Layer Gaps

**Date:** 2026-10-16 · **Branch:** `codex/audit-p0p1-2026-10-16` (HEAD `1c95a29`)
**Method:** Frontend behaviour probed against the actual database triggers/RPCs (static), plus pgTAP/unit-test coverage review. No live Supabase.

The earlier reports checked that the *frontend* fixes behave as intended. This deep dive checks whether those fixes survive the **database**, which is the authoritative write path in the secure (production) backend. It found a high-impact mismatch.

---

## GAP-D1 (High, Confirmed) — The client-approval fix is overridden by the database on completion

**What the branch fixed (frontend):** `A2` / `DBG-01` / `DBG-03` / `B2` / `DA-01` all assume that a Project Manager completing a **client-visible** task leaves `clientApprovalStatus = 'Pending'`, so the client can review afterwards.

- `src/store/index.ts:2340-2346` sets `clientApprovalStatus = 'Pending'` for `visibility !== 'internal'` on completion (and `updateTask` mirrors it).

**What the database actually does:** the `BEFORE UPDATE` trigger `private.aitask_guard_task_stage_progress()` **unconditionally forces** `clientApprovalStatus = 'Approved'` when any non-client actor completes a task:

- `supabase/migrations/20261013160804_task_dependency_review_invalidation.sql:229-231` (latest definition; still the active one):
  ```sql
  if new.data->>'status'='Completed' and v_changed then
    new.data := new.data || jsonb_build_object('clientApprovalStatus','Approved');
  end if;
  ```
- No migration conditions this on `visibility`, and none of the branch's three new migrations change it (grep: only `20261013055051`, `20261013105534`, `20261013160804` ever set this — all predate A2).

**Consequence (production / secure mode only):**
- PM completes a client-visible task → the row is stored with `clientApprovalStatus = 'Approved'`.
- `canReviewTaskAsClient` → `isAwaitingClientReview` becomes false → **the client can no longer review** the task.
- `getClientApprovalDate()` returns `null` (no `approvalHistory` event was written) → the exact `DBG-01` symptom the fix was meant to remove.

**Why it wasn't caught:** every completion test runs in **local** mode — `src/store/clientApprovalProgress.test.ts:6,51` pins `shouldUseSecureSupabase → false`, and the completion assertions at `:100-126` expect `'Pending'`. A unit test with `secure = true` (`:88`) only toggles frontend branching; it never runs the DB trigger. `optional_task_internal_approval.test.sql:54` exercises DB completion only for an **internal** task.

**Impact:** the entire client-approval remediation (`DBG-01`, `DBG-03`, `B2`, `A2`, `DA-01`) is effective in the demo/local backend but **ineffective in the hosted backend**. It also makes `DA-01`'s "client approval required before completion" moot server-side, since the DB marks acceptance only *after* completion.

**Recommended fix (pick one, decide the policy):**
- **Align DB to A2:** add a migration that only forces `'Approved'` for `visibility='internal'` (or when `clientApprovalStatus` was already `'Approved'`), leaving client-visible completions at `'Pending'`; add a pgTAP test asserting a client-visible PM completion stays reviewable.
- **Or align A2 to the DB:** keep completion = acceptance and reopen/replace A2 (and drop the `DA-01` guard), restoring the pre-branch behaviour consistently in both backends.

---

## GAP-D2 (Medium, Confirmed) — Service transitions are validated in the frontend only

`B3` added `allowedServiceCycleTransitions` and the `Active → Draft`/`Completed`-needs-all-delivered rules in the **store** (`src/store/index.ts`). The database RPC that actually persists status changes validates only the enum value, not the transition or deliverable completeness:

- `supabase/migrations/20260815042430_client_service_management.sql:470-488` (`aitask_set_service_cycle_status`) rejects only statuses outside `('Draft','Published','Completed')`; `aitask_set_deliverable_status` (`:490-506`) likewise.
- So a crafted command can still store `Completed` with zero deliveries, or `Completed → Draft`, and the plan-level rule is not enforced at all server-side.

**Impact:** `DBG-06`/`DBG-07` "impossible states" remain reachable via direct RPC (not via the UI). Frontend/DB enforcement mismatch.

**Recommended fix:** mirror the transition + deliverables-complete checks inside `aitask_set_service_cycle_status` (and the plan-status path), with pgTAP coverage.

---

## GAP-D3 (Low) — `getCycleServiceProgress` clientId filter can undercount legacy rows

`src/lib/serviceManagement.ts:186` now filters `deliverable.clientId === cycle.clientId`. A legacy/edge deliverable without a `clientId` would be dropped from the cycle's progress. Secure rows always carry `clientId`, so impact is limited to legacy snapshots.

## GAP-D4 (Low) — `resolveMonthlyRecord` plan scoping

`src/lib/monthlyRecords.ts:16-21` hides cycles whose `planId` is outside the caller's `planIds` set. Both callers pass the client's full plan list (`ClientWorkspace.tsx:246`, `ClientServiceWorkspace.tsx:73`), so the risk is only if a cycle legitimately belongs to a plan not in that set.

## GAP-D5 (Coverage) — No test asserts the client-visible completion rule at the DB layer
`optional_task_internal_approval.test.sql` covers an internal opt-out; nothing asserts the client-visible path. That is why GAP-D1 went unnoticed.

---

## Also still open (from prior reports)
DBG-09 (dead branch), AUTH-02/03/04/05, SYN-02, ARC-01/03, PERF-01/02/03, DBG-13 — plus the deployment/verification backlog (migrations + edge function unapplied; pgTAP/e2e not run; no live RLS check).

## Resolution (2026-10-16) — all five gaps addressed
- **GAP-D1 — Fixed.** New migration `20261016140000_client_visible_completion_review.sql` makes the completion trigger only force `clientApprovalStatus='Approved'` for internal tasks (or when already approved), so client-visible completions stay `'Pending'` and remain reviewable — matching the frontend. Regression test: `supabase/tests/database/client_visible_completion_review.test.sql`.
- **GAP-D2 — Fixed.** New migration `20261016150000_service_transition_guard.sql` adds a command-scoped `BEFORE UPDATE` trigger enforcing the store's cycle transitions and the all-delivered rule for `Completed`, plus blocking `Active → Draft` on plans with started cycles. It only runs for the intent-specific commands from a signed-in member, so server-derived transitions, cron generation and fixtures are untouched. Test: `supabase/tests/database/service_transition_guard.test.sql`.
- **GAP-D3 — Fixed.** `getCycleServiceProgress` keeps legacy deliverables that omit `clientId` (`src/lib/serviceManagement.ts`); test added.
- **GAP-D4 — Fixed.** `resolveMonthlyRecord` keeps cycles without a `planId` (`src/lib/monthlyRecords.ts`); new `src/lib/monthlyRecords.test.ts`.
- **GAP-D5 — Fixed.** The DB-layer tests above cover the client-visible completion rule and the transition guard.

Both new migrations are registered in `supabase/preflight/migration_repair_manifest.review.json` (pending production). The DB changes **cannot be executed here** (no local Postgres; Supabase CLI unauthenticated), so the two pgTAP files are **unrun** — they must pass in the deploy gate.

## Bottom line
The cross-layer gaps are closed in the source: the database now agrees with the frontend on client-visible completion and service transitions. The remaining risk is purely verification — the new SQL and pgTAP tests are unrun until a database is available.
