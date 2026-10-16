# AiTask — System Audit Report

**Date:** 2026-10-16
**Version audited:** `3.0.0` (`package.json`), branch `codex/delivery-review-blindspots`, HEAD `d35e2a1`, **with an uncommitted working tree**
**Auditor role:** Senior Software Architect / Full-Stack / QA / Security / Supabase specialist
**Method:** Static analysis + local verification. No live Supabase/staging access; runtime-dependent conclusions are marked *Unverified*.
**Mode:** Audit-only. No source, schema, or data was modified.

Companion reports: `BUG_REPORT-2026-10-16.md`, `SUPABASE_AUDIT-2026-10-16.md`, `IMPROVEMENT_PLAN-2026-10-16.md`, `TEST_COVERAGE_REPORT-2026-10-16.md`.

---

## A. Executive summary

AiTask is a mature, well-engineered multi-role task-management SPA for a marketing agency. It is **architecture-sound and, on the whole, production-grade**: the Supabase backend is genuinely hardened (RLS on every table, SECURITY DEFINER command RPCs with per-entity authorization, optimistic concurrency, idempotency receipts), the local verification gate is green, and the codebase is disciplined about fail-closed behaviour.

However, the audit found a **small number of real functional defects in cross-module business logic**, a **significant deployment/process risk** (a backlog of production migrations including an empty one), **accumulated dead code from the legacy snapshot era**, and **localized permission-model inconsistencies**.

**Overall health: GOOD, with a short list of High-priority defects and one process risk that should be closed before the next release.**

### Verification baseline (this machine)
| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `pnpm check` | PASS (exit 0) |
| Lint | `pnpm lint` | PASS (exit 0) |
| i18n coverage | `pnpm verify:i18n` | PASS (0 findings / 172 files) |
| Unit tests | `pnpm test` | 756 passed — **but one intermittent (flaky) failure observed** (see SYN-03) |
| Production build | `pnpm build` | PASS (exit 0) |

### Critical risks (act first)
1. **OPS-01 — Production migration backlog + empty migration.** 9 migrations are listed as `pendingProductionMigrations`, including `20261015140049_monthly_plan_revision_scheduling.sql`, which is **0 bytes**. A migration chain that records an empty file as "applied" is a repair/replay hazard, and the pending set carries already-fixed vulnerabilities (e.g. PM cross-company task injection) that remain live in production until deployed.
2. **DBG-01 — Client-approval state is set without an audit trail.** Completing a task auto-sets `clientApprovalStatus = 'Approved'` with **no** `approvalHistory` event, so `getClientApprovalDate()` returns `null` for those tasks and the client loses the ability to review. This is a data-consistency defect visible to users.
3. **DBG-02 — "Awaiting client review" is computed three different, incompatible ways** across `pmDashboard.ts`, `ServiceRoleDashboard.tsx`, and `deliveryTracker.ts`. Dashboards report different numbers for the same tasks.

### Production-readiness assessment
- **Backend security:** strong (see `SUPABASE_AUDIT-2026-10-16.md`). No service-role key in the browser; no `USING (true)` policies; writes revoked from `authenticated` in favour of RPCs.
- **Frontend authz:** centralized in `src/lib/access.ts`, but three routes bypass the `RoleRoute` guard and super-admin capability is expressed three different ways.
- **Functional correctness:** core flows work, but several cross-module derived fields are stale or divergent (DBG-01…DBG-08).
- **Deployment hygiene:** the working tree mixes **two undocumented work streams** and the repo carries a **9-migration production backlog**. This is the largest process risk.

### Recommended priority order
P0: OPS-01, DBG-01. P1: DBG-02, DBG-03, DBG-06, DBG-07, AUTH-01, SYN-03. P2: DBG-04, DBG-05, DBG-08, AUTH-02/04/05, ARC-*, PERF-*. P3: UI polish and legacy cleanup. Full detail in `IMPROVEMENT_PLAN-2026-10-16.md`.

---

## B. System map

### B.1 Purpose & users
Marketing-agency delivery management: companies/clients → service plans → monthly service cycles → deliverables → tasks, plus internal review and client approval.
Roles: **Project Manager, HOD, Staff, Client** (`src/types/index.ts:1`), plus **custom roles** (`CustomRole`, `:60`) and a **super-admin flag** `isSuperAdmin` ("Boss Koo", `:90`).

### B.2 Stack
React 18 + TypeScript + Vite 6 + Tailwind 3 + Zustand 5 + react-router 7 + `@supabase/supabase-js` 2.117. PWA via `vite-plugin-pwa`. Fonts Geist/Geist Mono. No component library (hand-rolled `components/ui.tsx`).

### B.3 Frontend structure
- `src/App.tsx` — router, `PrivateRoute`, `RoleRoute`, auth-state listener, auto-sync boot.
- `src/store/index.ts` — **6,095 lines**, single Zustand store holding the whole workspace (users, tasks, projects, clients, plans, cycles, deliverables, notifications, templates, pricing). Persisted to `localStorage` (`market-task-storage`) only in local mode.
- `src/lib/access.ts` (773 lines) — the single authorization core (`getEffectivePermissions` → `hasPermission` → `canAccessPath` + `can*` helpers).
- `src/lib/secureWorkspace.ts` (1,944 lines) — Supabase load/save, entity→row mapping, optimistic baseline.
- `src/pages/*` — 17 pages; `src/components/*` — 55 components.

### B.4 Backend structure
- `supabase/secure-auth-schema.sql` — primary schema: `aitask_workspaces`, `aitask_members`, polymorphic `aitask_entities` (discriminated by `entity_type`), `aitask_feedback_submissions`.
- `supabase/migrations/` — **~90 migrations, ~20k LOC**; versioned command RPCs (`aitask_execute_command`, `aitask_execute_service_command`), row + workspace-level optimistic locks, idempotency receipts, audit events, notification centre, storage policies.
- `supabase/functions/` — `invite-aitask-member` (JWT-verified, super-admin gated) and `aitask-feedback` (public, rate-limited submit + reviewer-gated results).
- `supabase/tests/database/*.sql` — pgTAP suite (~6.5k LOC).

### B.5 Data flow (summary)
`local` mode: everything in Zustand + `localStorage`, with a pending-command queue mutated optimistically.
`supabase` (secure) mode: `loadSecureWorkspace` pages `aitask_members` + `aitask_entities` (500 rows/page) into a canonical state; saves diff current state against a module-level `baseline` map and emit versioned operations through `aitask_execute_command`. A workspace-level optimistic lock (`p_expected_workspace_version`) guards the transaction. Auto-sync polls every 15s plus focus/visibility/online events; **secure mode requires explicit save** (no silent auto-commit). If the backend schema version is unsupported, the app **fails closed into read-only** (`upgradeRequired`).

---

## C. Findings index

Status legend: **Confirmed** (verified in code/run), **Potential** (code-supported, not reproduced), **Unverified** (needs live environment).

| ID | Sev | Module | Issue | Status |
| --- | --- | --- | --- | --- |
| OPS-01 | Critical | Deploy/DB | 9 pending production migrations; one is an empty 0-byte file | Confirmed |
| DBG-01 | High | Tasks/Client | Completion auto-approves client without `approvalHistory` | Confirmed |
| DBG-02 | High | Dashboards | "Awaiting client review" defined 3 incompatible ways | Confirmed |
| DBG-03 | High | Client portal | Client approving a `Completed` task reopens it | Confirmed |
| DBG-06 | High | Service cycles | `setServiceCycleStatus` accepts any status (impossible states) | Confirmed |
| DBG-07 | High | Client plans | `setClientPlanStatus` allows `Active → Draft`, orphaning cycles | Confirmed |
| AUTH-01 | High | Permissions | Super-admin expressed 3 ways; ungrantable "super-admin-only" checkboxes exposed | Confirmed |
| SYN-03 | High | Tests | Flaky unit test (`taskStatusControls.test.ts`), 1 of 4 full runs failed | Confirmed |
| DBG-04 | Medium | Projects | `Project.totalTasks/completedTasks` never recomputed (permanent 0) | Confirmed |
| DBG-05 | Medium | Deliverables | `deleteTask` leaves `deliverable.primaryTaskId` dangling | Confirmed |
| DBG-08 | Medium | Notifications | Revision + status-return path can double-notify the assignee | Confirmed |
| DBG-10 | Medium | Workflow | `requiresInternalApproval:false` + client-visible can skip client review | Confirmed |
| DBG-13 | Medium | Backend | Local demo pricing stripped before secure save (local↔prod divergence) | Confirmed |
| SYN-01 | Medium | Data layer | ~550 LOC legacy snapshot bridge is unreachable dead code | Confirmed |
| SYN-02 | Medium | Sync | Optimistic version truth lives only in module-level `baseline` | Confirmed |
| SYN-04 | Medium | Validation | Service collections accepted unvalidated from snapshots | Confirmed |
| AUTH-02 | Medium | Routing | 3 routes bypass `RoleRoute` (`/notifications`, `/clients/:id`, `/account/password`) | Confirmed |
| AUTH-04 | Medium | Access | `getDefaultAccessiblePath` can loop for zero-permission roles | Confirmed |
| AUTH-05 | Medium | i18n/labels | Legacy role/dept strings (`Videoshooting`, `Editor`, `Super Admin`) | Confirmed |
| SEC-02 | Medium | Edge fn | `aitask-feedback` runs with service-role; results branch unthrottled | Confirmed |
| SEC-01 | Medium | Legacy DB | `aitask_app_state` anon grants depend on cutover migrations | Potential |
| ARC-01 | Medium | Store | 6,095-line store monolith; 24 near-duplicate domain helpers | Confirmed |
| ARC-06 | Medium | Migrations | Empty migration file in the validated tail | Confirmed |
| PERF-01 | Medium | Startup | Eager bundle near the 300 KiB gzip cap; heavy initial workspace load | Confirmed |
| PERF-02 | Low | Sync | Order-sensitive `JSON.stringify` deep equality | Confirmed |
| UI-01 | Medium | Staff | Relative dates stay stale across midnight | Confirmed (prior audit) |
| UI-02 | Medium | Staff | Closing task sheet mid-upload abandons the attachment | Confirmed (prior audit) |
| AUTH-03 | Low | Access | Client default permissions exceed curated navigation | Confirmed |
| PERF-03 | Low | Forms | `useRecoverableForm` stringifies whole form every render | Confirmed |
| DBG-09 | Low | Tasks | `completionPercentage` 100/90 branch is dead (overwritten) | Confirmed |

---

## D. Detailed findings

### D.1 Critical

**OPS-01 — Production migration backlog + empty migration.** *Confirmed.*
- Evidence: `supabase/preflight/migration_repair_manifest.review.json` lists 9 `pendingProductionMigrations`, ending with `20261016120000_task_role_assignment_and_contact_notification_hardening`.
- `supabase/migrations/20261015140049_monthly_plan_revision_scheduling.sql` is **0 bytes** (`wc -c` = 0) yet appears in both `validatedMigrationTail` and `pendingProductionMigrations`.
- Impact: an empty migration recorded as "applied" can break migration repair/replay and hides the intended monthly-plan-revision-scheduling DDL; the pending set includes security fixes (e.g. `20261015014716_pm_task_company_boundaries`) that remain live exploits until deployed.
- Fix: confirm intent of the empty file (drop it or restore DDL), then schedule the backlog with the documented preflight/backup gate (`docs/production-rpc-mismatch-recovery.md`).

### D.2 High

**DBG-01 — Completion auto-approves client with no audit trail.** *Confirmed.*
- Evidence: `src/store/index.ts:2550-2554` sets `clientApprovalStatus: 'Approved'` when completing; no `TaskApprovalEvent` is appended. `reviewClientApproval` (`:3131-3151`) is the only path that records history.
- Consequence: `getClientApprovalDate` (`src/lib/clientPortal.ts:155-161`) returns `null`; `canReviewTaskAsClient` (`src/lib/access.ts:596`) then blocks the client because `clientApprovalStatus === 'Approved'`.
- Fix: either record a synthetic approval event on PM completion, or keep `clientApprovalStatus='Pending'` when visibility is `client-visible`.

**DBG-02 — "Awaiting client review" computed three ways.** *Confirmed.*
- `src/lib/pmDashboard.ts:9` → `visibility !== 'internal' && getClientTaskStage(task) === 'awaiting_review'` (i.e. `Approved`+pending, or `Completed`).
- `src/components/ServiceRoleDashboard.tsx:127` → `status === 'Waiting Approval' && visibility === 'client-visible'` (actually internal review).
- `src/lib/deliveryTracker.ts:185` → client view `getClientTaskStage === 'awaiting_review'`; staff view `status === 'Waiting Approval'`.
- Impact: the same task is counted as client review in one dashboard and internal review in another; PM/HOD/Boss counters disagree.
- Fix: single canonical selector (e.g. reuse `getClientTaskStage`) used by all three.

**DBG-03 — Client approval reopens a completed task.** *Confirmed.*
- `src/lib/access.ts:590-597` allows a client to review when `task.isCompleted || status === 'Completed'`.
- `src/store/index.ts:3147-3149` unconditionally sets `isCompleted:false`, `completedAt:undefined`, `completionPercentage: 80` on approve.
- Impact: a PM-completed, client-visible task can be pulled back from 100% to 80%.
- Fix: reject approval review on already-`Completed` tasks, or require an explicit reopen action.

**DBG-06 — `setServiceCycleStatus` accepts any status.** *Confirmed.*
- `src/store/index.ts:4325-4335` only checks permission + scope, then writes the passed status. A cycle can be `Completed` with zero `Delivered` deliverables, or moved `Completed → Draft`.
- Fix: validate the transition against `deriveServiceProgress`.

**DBG-07 — `setClientPlanStatus` allows `Active → Draft`.** *Confirmed.*
- `src/store/index.ts:4311-4322` blocks only `Active` (must use Activate) and reopening `Ended`; it does not block moving an `Active` plan with published cycles back to `Draft`.
- Impact: orphaning cycles/deliverables.
- Fix: block `Active → Draft` when the plan has non-draft cycles.

**AUTH-01 — Super-admin capability expressed three ways; phantom checkboxes.** *Confirmed.*
- Flag: `access.ts:239` `isBossKoo = isSuperAdmin`.
- Hardcoded id/name: `src/store/index.ts:5600` (`user.id === 'u-boss' || user.name === 'Boss Koo'`, mock sync only).
- Permission list: `access.ts:115-122` `nonSuperAdminOnlyPermissionKeys` includes `manageUsers`, `approveRegistrations`, `deleteUsers`, `viewApprovals`.
- Impact: role editors expose those as editable checkboxes (`access.ts:66-104`) but `sanitizeRolePermissions` silently strips them for non-super-admins, so a Boss Koo can "grant" permissions that never take effect; `/approvals` is effectively super-admin-only while looking grantable.
- Fix: hide non-grantable keys from the editor, or model super-admin as a role.

**SYN-03 — Flaky unit test.** *Confirmed.*
- First `pnpm test` run: `src/lib/taskStatusControls.test.ts:40` failed (`expected {...} to be undefined`). Subsequent runs (2 full suites + 5 isolated) passed.
- Impact: nondeterministic CI; a real regression could hide behind a re-run. Investigate shared/module state or worker parallelism.

### D.3 Medium

**DBG-04 — Project task totals are permanent zeros.** *Confirmed.* `Project.totalTasks`/`completedTasks` are set to `0` at creation (`store/index.ts:3433-3434`) and only ever sanitized (`security.ts:321-322`); task create/complete/delete never update them. Consumers should derive counts (as `Dashboard.tsx:239` does) or the field should be removed.

**DBG-05 — `deleteTask` leaves `deliverable.primaryTaskId` dangling.** *Confirmed.* `deleteTask` (`store/index.ts:3093-3095`) removes the id from `deliverables[].taskIds` but never clears `primaryTaskId`; `linkTaskToDeliverable` never sets it either. `primaryTaskId` is read by `deliveryTracker.ts:152,177`.

**DBG-08 — Double notification on revision.** *Confirmed.* `requestRevision` emits a `Revision Requested` notice to the assignee (`store/index.ts:3231-3237`) and the status-return path can emit a second `Task Status Updated` to the same assignee (`:2596-2605`); notifications are not deduped (only action feedback is, `lib/actionFeedback.ts:19`).

**DBG-10 — Opt-out can skip client review for client-visible work.** *Confirmed.* `taskTransitionError` (`lib/taskWorkflowAccess.ts:35-39`) permits PM completion from `Waiting Approval` when `requiresInternalApproval === false`, and completion auto-approves the client (DBG-01); for a `client-visible` task this bypasses `reviewClientApproval`.

**DBG-13 — Local demo pricing never round-trips.** *Confirmed.* `secureWorkspace.ts:786-802` (`stripServiceItemPrices`, `discountValue:0`, `taxRateBps:0`) zeroes money before save; prices live in separate `service_pricing_snapshot` rows gated by `viewServicePrices`. Local demo fixtures carry real prices (`mock/localServiceDemo.ts:138-148`), so local mode shows prices the secure backend intentionally does not store inline. Document this as an intentional divergence or align the fixtures.

**SYN-01 — Legacy snapshot bridge is dead code.** *Confirmed.* `supabaseClient.ts:18` defines `shouldUseSecureSupabase = () => shouldUseSupabase()`, so all `else` branches guarded by `if (shouldUseSupabase())` at `store/index.ts:1049/1052/1126`, `:1193/1225/1298`, `:1391/1407/1531` can never take the legacy path. `lib/supabaseSnapshot.ts` + `lib/legacySnapshot.ts` (~550 LOC) and their tests remain.

**SYN-02 — Optimistic version truth is module-global.** *Confirmed.* `secureWorkspace.ts:303-315` keeps `baseline`/`retryableCommand`/`retryableBatch` as module singletons; store entities never bump their `version` on local mutation (`addTask` `store/index.ts:3321+`, `updateTaskStatus`). Drift between local state and `baseline` is possible; `applyCommandVersions` guesses versions when the server omits a row (`secureWorkspace.ts:1081`).

**SYN-04 — Service collections parsed unvalidated.** *Confirmed.* `parseWorkspaceSnapshot` (`security.ts:493-521`) validates users/clients/projects/tasks/notifications/registrations per field but casts `servicePackages`, `clientPlans`, `serviceCycles`, `deliverables`, `cycleComments`, `addons`, `rolePermissions`, `serviceWorkflowTemplates`, `servicePricingSnapshots` straight through as `unknown as T[]`.

**AUTH-02 — Routes bypassing `RoleRoute`.** *Confirmed.* `App.tsx:191-197`: `/clients/:clientId` (self-gates), `/notifications` (unguarded by design), `/account/password`. Security relies on per-page checks rather than the central guard.

**AUTH-04 — Potential navigation/redirect loop.** *Confirmed (latent).* `getDefaultAccessiblePath` (`access.ts:655-662`) returns `'/'` when no nav is visible and `/settings` is denied; `AccessDenied` links "Go to workspace" to `'/'`, which `RoleRoute` denies again for a zero-permission custom role.

**AUTH-05 — Legacy role/department strings & label split.** *Confirmed.* `types/index.ts:10-20` retains `'Videoshooting'` and `'Editor'` (handled in `Tasks.tsx:176-179`, `Calendar.tsx:651-669`); `localeLabels.ts:7-8` mixes `Boss Koo`/`Super Admin`, `Account`/`Finance`; `feedback.ts:2` uses `'Super Admin'` while `access.ts:323` returns `'Boss Koo'`.

**SEC-02 — Feedback edge function.** *Confirmed (code).* `aitask-feedback` is `verify_jwt=false` (`config.toml:4-5`) and uses `SUPABASE_SERVICE_ROLE_KEY`; the `submit` branch is origin-allowlisted, size-capped (256 KB), honeypot-protected and IP-rate-limited, but the `results` branch (`index.ts:167-190`) has **no rate limit** (only reviewer/Boss gating).

**SEC-01 — Legacy snapshot grants.** *Potential.* `schema.sql`/`legacy_snapshot_baseline.sql` grant `select,insert,update` to `anon, authenticated` on `aitask_app_state`, gated by the spoofable `Origin` header (documented as "not an authorization boundary"). Later cutover migrations (`reliable_workspace_command_cutover.sql:7-11`, `harden_legacy_access_privileges.sql`, `secure-cutover.sql`) revoke them — **verify they are applied live** (cannot be assumed from source).

**ARC-01 — Store monolith & duplicated predicates.** *Confirmed.* `store/index.ts` is 6,095 lines; near-duplicate helpers: `isTaskCompleted` (`lib/taskCompletion.ts:5` vs `deliveryTracker.ts:58`), open-task predicates (`taskReporting.ts:94`, `calendarMetrics.ts:24`, `deliveryTracker.ts:59`), and `isTaskLinkedToDeliverable` (`staffWorkflow.ts:8` vs `deliveryLinks.ts:3`).

**PERF-01 — Startup cost.** *Confirmed.* Initial workspace load pages all entities (500/page) and the eager bundle sits near the 300 KiB gzip budget (prior audits: 283–299.9 KiB). 15s polling multiplies requests on long sessions.

**UI-01 / UI-02 — Staff UX defects.** *Confirmed via prior audit* (`docs/staff-latest-deep-audit-2026-10-15.md`), **still open**: (1) closing the task sheet mid-upload abandons the attachment; (2) All-work urgency/relative dates stay stale across midnight.

### D.4 Low
- **AUTH-03** Client default permissions include `viewTasks/calendar/projects/reports/settings` while navigation hides them; pages self-handle, so cosmetic.
- **DBG-09** `completionPercentage` 100/90 branch (`store/index.ts:2543-2547`) is overwritten at `:2566` by `getTaskProgress`.
- **PERF-02** `workspaceStatesEqual` uses order-sensitive `JSON.stringify` (`store/index.ts:823-825`).
- **PERF-03** `useRecoverableForm` serializes the whole form every render for dirty detection.

---

## E. Cross-module & process findings

1. **Two work streams in one uncommitted tree.** The working tree contains the documented "task role assignment & contact notification hardening" tail **plus** an undocumented stream (`getOwnedPortfolioClientKeys` commercial scoping in `access.ts`/`ServiceRoleDashboard.tsx`, `getAgencyPulseMetrics` "Due" semantics in `taskReporting.ts`, workflow-reopen progress re-derivation in `workflowReview.ts`, and `OperationsGlance.tsx` column changes). The hardening doc only accounts for the former.
2. **Authz is centralized but with escape hatches** (AUTH-01/02/03), so "can this user reach this page" has more than one answer.
3. **Derived data is repeatedly recomputed ad hoc** instead of from canonical selectors (DBG-02, DBG-04, DBG-09), which is the root cause of most dashboard disagreements.

## F. What could not be verified
- Live RLS policy state, actual production grants, and whether cutover migrations are applied (`SEC-01`) — **Unverified** (no live environment).
- pgTAP DB suite and Playwright e2e were not run (no linked Postgres/browsers provisioned for this audit).
- Production data integrity (duplicate company names, orphaned `primaryTaskId`, historical approval histories) — **Unverified**.
- Migration replay/repair behaviour of the empty migration on a real project — **Unverified**.
