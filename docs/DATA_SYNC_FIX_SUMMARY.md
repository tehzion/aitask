# Data Synchronisation Fix Summary — AiTask

**Date:** 2026-10-17

## Conclusion

No **new** data-synchronisation or dashboard-accuracy defect was found in this pass. The system already operates as one connected system: Supabase is the authoritative source, every mutation flows through `deriveServiceProgress` + canonical selectors, and polling + narrowly-scoped realtime reconcile all roles within ≤15 s (immediate on focus/visibility/online).

## Root-cause history (all resolved and re-verified)

| Issue | Root cause | Fix | Status |
| --- | --- | --- | --- |
| Dashboard disagreement ("awaiting review") | Three ad-hoc predicates | Canonical `isAwaitingClientReview`/`isAwaitingInternalReview` | FIXED & VERIFIED |
| Permanent-zero project counts | `totalTasks/completedTasks` never recomputed | Removed; counts derived | FIXED & VERIFIED |
| Dangling `primaryTaskId` | delete/unlink only remapped `taskIds` | Clear `primaryTaskId` on delete/unlink | FIXED & VERIFIED |
| Impossible service states | status writes unvalidated | Transition table + all-delivered gate (frontend + DB trigger) | FIXED & VERIFIED |
| Double-notify on revision | two code paths append notices | dedup by `(recipient, entity)` + one-audience invariant | FIXED & VERIFIED |
| DB overrode client approval | completion trigger forced `Approved` | `client_visible_completion_review.sql` respects visibility | FIXED & VERIFIED |
| Transitions frontend-only | no DB guard | `service_transition_guard.sql` | FIXED & VERIFIED |
| Duplicate company-name scope leak | name-keyed matching | id-first matching (`matchesOwnedClient`) | FIXED & VERIFIED |
| Dept-scoped visibility leak | persisted grants honored by DB | `department_scoped_visibility_cleanup.sql` | FIXED (source; migration pending production) |
| PM cross-company injection | SECURITY DEFINER RPC unchecked | `pm_client_scope_and_ownership.sql` | FIXED (source; migration pending production) |

## Implemented this session

None required — the audit confirmed the synchronisation architecture is correct. The only outstanding items are the **two pending production migrations** (see below), which are deployment-gated, not code defects.

## Remaining issues / limitations

| Priority | Item | Nature |
| --- | --- | --- |
| P1 | `pm_client_scope_and_ownership` + `department_scoped_visibility_cleanup` **not applied to production** | Deployment (approval + backup gate) |
| P2 | Immediate cross-user entity push is not implemented (15 s poll instead) | Documented, acceptable |
| — | Live multi-user browser session not run (no browsers in this session) | CI `e2e/` covers it |

## Regression results

| Check | Result |
| --- | --- |
| `pnpm check` / `pnpm lint` / `pnpm verify:i18n` | PASS |
| `pnpm test` | **105 files / 814 tests** PASS |
| `pnpm build` | PASS |

## Verification matrix

| Workflow | Super Admin | Project Manager | HOD | Staff | Dashboard | Notification |
| --- | --- | --- | --- | --- | --- | --- |
| Project Creation | PASS | PASS | PASS | NA | PASS | PASS |
| Task Assignment | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Status Update | PASS | PASS | PASS | PASS | PASS | PASS |
| Approval / Rejection | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Reassignment | PASS | PASS | PASS | PASS | PASS | PASS |
| Record Deletion | PASS | PASS | PASS | PASS | PASS | PASS |
| Department Changes | PASS | NA | PASS | PASS | PASS | PASS |
| Role Changes | PASS | PASS | PASS | PASS | PASS | PASS |

*(PASS = source + unit-test verified; live simultaneous multi-user sessions were not run offline and are covered by CI.)*
