# AiTask — Improvement Plan

**Date:** 2026-10-16 · **Version:** `3.0.0` (branch `codex/delivery-review-blindspots`, uncommitted tree)
**Companion reports:** `SYSTEM_AUDIT_REPORT-2026-10-16.md`, `BUG_REPORT-2026-10-16.md`, `SUPABASE_AUDIT-2026-10-16.md`, `TEST_COVERAGE_REPORT-2026-10-16.md`.

This is a prioritised roadmap. Each item references a finding ID from the audit. **Nothing here has been implemented** — this is audit output for review.

Ordering principle: security & data integrity → critical functional defects → cross-module consistency → stability → performance → UX → optional.

---

## P0 — Critical (do before next release)

| # | Item | Finding | Why now | Depends on |
| --- | --- | --- | --- | --- |
| P0-1 | Repair or delete the empty migration `20261015140049_monthly_plan_revision_scheduling.sql`; confirm intended DDL exists elsewhere | OPS-01 / SUP-I2 | 0-byte file recorded as applied = repair/replay hazard | none |
| P0-2 | Schedule the 9 pending production migrations behind the preflight/backup gate | OPS-01 / SUP-I3 | Pending set contains live security fixes (PM cross-company injection) | none |
| P0-3 | Stop completion from silently auto-approving the client; record an approval event or keep `Pending` | DBG-01 / BUG-01 | Wrong client-facing approval state + blocked review | none |
| P0-4 | Verify live that `aitask_app_state` anon/authenticated grants are revoked and service-role grants are minimal | SEC-01 / SUP-R1 / SUP-R3 | Cannot be assumed from source | live Supabase access |

---

## P1 — High (broken workflows / correctness)

| # | Item | Finding | Notes | Depends on |
| --- | --- | --- | --- | --- |
| P1-1 | Establish one canonical "awaiting client review" selector; express internal review separately | DBG-02 / BUG-02 | Root cause of dashboard disagreement | P0-3 (approval semantics) |
| P1-2 | Prevent client approval from reopening a `Completed` task | DBG-03 / BUG-03 | Add explicit reopen action if needed | none |
| P1-3 | Validate service-cycle status transitions | DBG-06 / BUG-04 | Requires deliverables satisfied for `Completed` | none |
| P1-4 | Block `Active → Draft` when a plan has non-draft cycles | DBG-07 / BUG-05 | Prevents orphaned cycles | none |
| P1-5 | Hide/flag non-grantable super-admin permissions in the role editor + `sanitizeRolePermissions` | AUTH-01 / BUG-06 | Removes phantom grants | none |
| P1-6 | Root-cause and de-flake `taskStatusControls.test.ts` | SYN-03 / BUG-07 | Try `--no-file-parallelism` / shuffled order | none |
| P1-7 | Add a rate limit to the `aitask-feedback` results branch | SEC-02 / SUP-R2 | Reviewer-only, but unthrottled | none |
| P1-8 | Require client approval before completing client-visible work when approval is opted out | DBG-10 / BUG-11 | Aligns opt-out with client-visibility rules | P0-3 |

---

## P2 — Medium (consistency, reliability, maintainability)

| # | Item | Finding |
| --- | --- | --- |
| P2-1 | Remove `Project.totalTasks/completedTasks` or recompute them | DBG-04 / BUG-08 |
| P2-2 | Clear/recompute `deliverable.primaryTaskId` on task delete/unlink | DBG-05 / BUG-09 |
| P2-3 | De-duplicate revision/status-return notifications to the assignee | DBG-08 / BUG-10 |
| P2-4 | Validate service collections in `parseWorkspaceSnapshot` instead of `as unknown as T[]` | SYN-04 |
| P2-5 | Give the store ownership of optimistic versions, or document the `baseline`-only model; stop guessing versions in `applyCommandVersions` | SYN-02 |
| P2-6 | Delete the unreachable legacy snapshot bridge (`supabaseSnapshot.ts`, `legacySnapshot.ts`) and its tests | SYN-01 |
| P2-7 | Remove dead `src/pages/Projects.tsx`; rename the `Companies`→`Clients.tsx` route mapping for clarity | AUTH-06 / ARC-02 |
| P2-8 | Route `/clients/:clientId` and `/account/password` through the central authz guard (or document why not) | AUTH-02 |
| P2-9 | Fix `getDefaultAccessiblePath` loop for zero-permission roles | AUTH-04 |
| P2-10 | Remove legacy `Videoshooting`/`Editor` from `Department`; unify "Super Admin"/"Boss Koo" labelling | AUTH-05 |
| P2-11 | Consolidate duplicate predicates (`isTaskCompleted`, `isTaskOpen`, `isTaskLinkedToDeliverable`) | ARC-01 / ARC-03 |
| P2-12 | Note (or remove) the dead `completionPercentage` 100/90 branch | DBG-09 |
| P2-13 | Fix the two open Staff UX defects (upload abandonment, midnight-stale dates) | UI-01 / UI-02 / BUG-13 |
| P2-14 | Replace order-sensitive `JSON.stringify` equality with a stable compare | PERF-02 |
| P2-15 | Document the intentional local↔secure pricing divergence | DBG-13 |
| P2-16 | Commit the two independent work streams separately; the hardening doc must account for the commercial-scope stream | Process |

---

## P3 — Low (optional / polish)

- Hide or rework Client default permissions that exceed curated navigation (AUTH-03).
- Reduce `useRecoverableForm` per-render serialization (PERF-03).
- Pause the 15s secure-mode poll when the tab is hidden (PERF-01).
- Align the feedback function CORS allowlist with the DB origin list (Supabase §6).
- Retire the 4-arg command overloads once no legacy clients remain (Supabase §3).

---

## Cross-cutting theme
Most P1/P2 functional defects share one root cause: **derived state is recomputed ad hoc in many places instead of from canonical selectors.** Consolidating selectors (`isAwaitingClientReview`, `isAwaitingInternalReview`, `getClientApprovalDate`, deliverable progress, project counts) would eliminate DBG-01/02/04/09 as a class and reduce future regressions.

## Suggested sequencing
1. **Sprint A (P0):** migration repair + backlog deploy + approval-trail fix (P0-1..P0-4).
2. **Sprint B (P1 functional):** P1-1, P1-2, P1-8, then P1-3, P1-4.
3. **Sprint C (P1 security/quality):** P1-5, P1-6, P1-7.
4. **Sprint D (P2):** consistency + dead-code removal, in the order listed (P2-1..P2-16).
5. **Sprint E (P3):** polish.

## Dependencies / risks
- Many fixes touch `src/store/index.ts` (already 6k lines and currently dirty). Land fixes on a clean branch, one theme per PR, so the in-flight streams don't collide.
- Deploying P0-2 re-exposes the app to the schema-version gate; do it with the documented backup/preflight runbook.
- P1-1 must follow P0-3, otherwise the canonical selector bakes in the wrong approval semantics.
