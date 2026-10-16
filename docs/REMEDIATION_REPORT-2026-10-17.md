# Remediation Report — AiTask (2026-10-17)

**Scope:** System remediation following the 2026-10-16 audit chain. This phase implemented fixes, verified previously-landed fixes against the current tree, and re-ran the full gate.
**Branch:** `codex/audit-p0p1-2026-10-16` (HEAD `7ac0b25`).
**Environment:** local development. No production data, schema, RLS, or deployment was modified.

---

## A. Fix Summary

| Issue | Root Cause | Fix Implemented | Verification | Status |
| --- | --- | --- | --- | --- |
| **AUTH-04** — `getDefaultAccessiblePath` infinite redirect loop for a zero-permission role | Terminal fallback returned `'/'` (dashboard), which `RoleRoute` denies for a role with no `viewDashboard`; `AccessDenied` then links back to `'/'`, looping forever | Final fallback now returns `'/notifications'` (the always-accessible, unguarded notification centre) instead of `'/'` | New test `access.test.ts` ("falls back to the notification centre for a role with no accessible pages"); full suite 812 tests green | **Fixed** |
| **UI-01** — Staff output upload abandoned on task-sheet close | `TaskOutputFiles` owned upload state; `StaffTaskFocus` exit/navigation guards omitted it | (Landed in prior commits `e02d929`/`fca797f`) `TaskOutputFiles.onUploadStateChange` → `StaffTaskFocus` `outputUpload` state wired into `requestExit`, `confirmExit`, `closeDisabled`, full-editor switch, `mutationLocked`, and `useUnsavedChanges` | Source-verified: `TaskOutputFiles.tsx:36-39`, `StaffTaskFocus.tsx:76,96,159,197-227,272,310`; `SideSheet.tsx:24,27` honours `closeDisabled` | **Verified fixed (pre-existing)** |
| **UI-02** — Staff "All work" urgency/relative dates stale across midnight | `StaffAllWork` used render-only `getTodayInputDate()` with no date subscription | (Landed in `85d3efb`/`fca797f`) `StaffAllWork` now derives `today` from `useLocalToday()` (midnight timer + focus/visibility refresh) | Source-verified: `StaffAllWork.tsx:102` + `useLocalToday.ts` | **Verified fixed (pre-existing)** |
| **Staff defect #3** — review-update request missed the HOD task contact | Recipient resolver excluded a HOD assigner | (Landed in `41075c2`/hardening) `resolveTaskUpdateRecipientIds` now adds the task contact when it can view the task | Source-verified: `store/index.ts:668-671` | **Verified fixed (pre-existing)** |

**All P0/P1 functional/security defects from the audit (A1, A2, B1–B7, GAP-D1–D5, PM-role remediation) were re-verified as fixed in source during the prior phase and remain green.** The only code defect actually requiring a change this phase was AUTH-04.

## B. Supabase Changes

None authored this phase. The two database changes already written but **not applied to production** remain the sole backend gap:

- `20261016160000_pm_client_scope_and_ownership` (P1 — closes a PM cross-company rename/edit/delete/re-own hole in the SECURITY DEFINER service RPC; adds a `BEFORE UPDATE/DELETE` ownership-freezing trigger).
- `20261016170000_department_scoped_visibility_cleanup` (strips `viewAllTasks`/`viewAllClients` from department-scoped roles/members).

Both are recorded in `supabase/preflight/migration_repair_manifest.review.json` `pendingProductionMigrations`. **Deployment requires explicit approval + the documented preflight/backup gate and is not performed here.**

## C. Regression Testing

| Check | Result |
| --- | --- |
| `pnpm check` (tsc) | PASS |
| `pnpm lint` | PASS |
| `pnpm verify:i18n` | PASS — 0 findings / 170 files |
| `pnpm verify:migrations` | PASS — 109 non-empty |
| `pnpm test` | PASS — **105 files / 812 tests** (+1 new AUTH-04 test) |
| `pnpm build` | PASS — production build + PWA precache |

**Not run (blocked):** pgTAP DB suite, Playwright e2e, `verify:supabase*` (no linked Postgres/browsers/live credentials), Deno edge-function type-check.

**Coverage gaps:** component-level tests for the two Staff UX fixes (UI-01/UI-02) are not present (no jsdom/`@testing-library` infra); their guarantees are currently enforced only in source. `useLocalToday` is exercised indirectly via `deliveryReview.test.tsx` mock.

## D. Remaining Issues

| Priority | Issue | Why not fixed here |
| --- | --- | --- |
| P1 | 2 pending production migrations (`pm_client_scope_and_ownership`, `department_scoped_visibility_cleanup`) | Requires deployment approval + backup gate; SQL already authored |
| P1 | Client-approval ordering policy reversal (`fca797f` — PM completes before client acceptance) | Deliberate business-rule change; needs product-owner sign-off, not a code change |
| P1 | 3 local commits not pushed to origin | Git operation; not performed without owner instruction |
| P2 | AUTH-02 (`/clients/:id`, `/account/password` bypass central `RoleRoute`), SYN-02 (module-global optimistic `baseline`), ARC-01/03 (store monolith, duplicate predicates) | Architectural/deferred; no confirmed runtime defect |
| P3 | AUTH-03/05, DBG-09/13, PERF-01/02/03 | Cosmetic/data-compat risk; explicitly non-blocking in prior audits |
| Ops | Supabase Free plan: no scheduled backups; leaked-password protection disabled | Platform limitation; documented in manifest |

## E. Production Readiness

### CONDITIONALLY READY

**Rationale.** The source tree is green and stable: every P0 and P1 *code* defect from the audit is fixed and verified (812 passing tests, clean typecheck/lint/build), and this phase additionally closed the last real code bug (AUTH-04). No known release-blocking *code* defect remains.

The conditionality is deployment/verification, not code:

1. **Apply the 2 pending migrations** (one is a P1 security fix) behind the preflight/backup gate, and run their pgTAP tests.
2. **Product-owner sign-off** on the client-approval ordering policy.
3. **Push the 3 local commits + open a PR**, then run pgTAP/e2e in the deploy gate.

Until those three are done, the application is **NOT READY** for a *responsible* production release, because a P1 security fix remains unapplied and the newest DB-layer tests are unrun.
