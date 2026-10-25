# AiTask final stabilization and release readiness

**Assessment date:** 2026-10-25  
**Recommendation:** **NO-GO** for production deployment. The disposable stack and application checks pass, but production migration alignment is not complete and the required rollout/reconciliation approval has not occurred.

## Database migration resolution

The complete local migration sequence replays successfully: 125 repository migrations, with migration consistency verification passing. The two reported failures had separate causes:

1. `20261023150000_hod_task_execution_permissions.sql` attempted to edit `private.aitask_task_assignment_is_valid` by matching a precise `pg_get_functiondef()` string. Earlier changes to the function definition made that formatting-sensitive replacement fail during replay. The assignment validator is now defined completely in `20261023120000_pm_hod_staff_assignment_state.sql`; the later migration no longer tries to patch function source text. Its rules retain the project, department, active-membership, staff-assignment, and PM-override checks.
2. The release verifier selected a file by a `_production.json` filename suffix. That allowed a mutable release-candidate manifest to be mistaken for the immutable record of applied production migrations. Selection now requires `manifestKind: aitask-applied-production-release` and `immutable: true`. The candidate manifest continues to identify `20261024090000_security_boundary_hardening` as pending; it was not edited to claim production alignment.

After those corrections, disposable replay, migration consistency, local authenticated checks, and database tests passed. No production database was changed. The local sequence is not evidence that production has received the pending migration. `pnpm verify:release-db-alignment` exits 1 with `Production migrations are still pending: 20261024090000_security_boundary_hardening`; this is the correct gate result.

## Browser regression results

The complete Playwright suite passed **365/365** on the final run (`PLAYWRIGHT_REUSE_SERVER=true pnpm exec playwright test --workers=1`, 21.5 minutes). Existing assertions and timeouts were retained. No failure remained in that run.

Earlier full runs exposed test setup problems and one real responsive defect. The account-report fixture seeded dates before workspace hydration and depended on wall-clock time; it now waits for hydration, fixes the browser timezone, and freezes the test clock. The app-smoke fixture mutated persisted Zustand state through raw localStorage and sometimes remained on the prior route; it now uses the store persistence API and navigates explicitly. Desktop screenshot setup now resets the app's independently scrolling `main` container before capturing. A 390px mobile toolbar did overflow and clip the avatar; the redundant “Menu” label is hidden below `sm`, and a no-overflow assertion covers the header. Focused tests reproduced and verified each correction, followed by the passing full suite.

The only full-suite log warning was from Node: `NO_COLOR` is ignored because `FORCE_COLOR` is set. This is an inherited test-process environment conflict. The browser suite did not report an unresolved application runtime failure. Negative RPC/retry diagnostics printed during disposable fault-injection tests are expected test scenarios, not unhandled production errors.

## Intermediate verification failures and disposition

The failed disposable runs were investigated and are included here rather than omitted from the final green result:

- The Client privacy UAT assertion initially could not see a client-visible task attached to a Draft service cycle. The portal correctly hides Draft-cycle content. The fixture now publishes the cycle before testing client visibility; the full privacy group then passes.
- pgTAP exposed an application defect: approving an already PM-completed task changed its completion fields and timestamp. Migration `20261024090000_security_boundary_hardening` now preserves the previous task status, completion flag, percentage, and `completedAt` while storing the separate client decision. New tests assert each preserved value; all pass in the final replay.
- The Staff workflow test attempted to submit evidence and move directly to `Waiting Approval` from the initial state. The supported workflow requires starting work first. The test now performs the `In Progress` transition before submitting for review; the production guard was not relaxed.
- The HOD status-save helper initially used HOD-as-assignee fixture data, old module import paths, and the pre-refactor full-edit status dropdown. It now models the HOD as department reviewer of Staff-assigned tasks and uses the current store and task-action controls. Authenticated HOD status saves, department/project boundaries, denied actions, refresh, and retry pass in the final run.

These issues were closed by reproducing each failure, correcting either the application behavior or invalid test setup as appropriate, and rerunning the complete disposable validation. The final rollout reports 76 pgTAP files / 1,161 passing assertions and all 8 UAT groups / 84 assertions passing.

## Critical workflow verification matrix

| Workflow | Result | Evidence |
|---|---|---|
| Super Admin setup | PASS, local | Phase 5 UAT created a company, projects, assignments, plan, cycle, and tasks through the app and authenticated RPCs. |
| Project Manager scope | PASS, local | UAT and database tests accept scoped work and deny a crafted cross-project assignment. |
| HOD and department boundaries | PASS, local | pgTAP, authenticated HOD status-save/retry, delegation, review, department revocation, and assignment checks pass. Out-of-project and forged assignment fields are denied. |
| Staff participation across projects | PASS, local | Phase 5 UAT used one Staff account with work under two PMs; local REST/store save and reload checks pass. |
| Optional internal approval | PASS, local | Database tests verify PM opt-out, default approval, immutable role boundaries, and direct completion semantics. |
| Revisions and resubmission | PASS, local | Phase 5 UAT verifies revision, resubmission, and approval; workflow gate tests verify signatures and reopening behavior. |
| Completed work reopening | PASS, local | Phase 5 UAT verifies project closure/reopening; task/review tests verify authorized reopening after changes. |
| Recurring cycles and renewals | PASS, local | Phase 5 UAT verifies manual renewal, changed scope/pricing, immutable monthly history, and dashboard totals. Migration tests include duplicate-prevention/integrity cases. |
| Notifications | PASS, local | Browser cases cover recipient visibility, popup/read/unread behavior, pagination, and user flows; pgTAP covers RLS, unread mutations, recipient guards, and deletion cleanup. |
| Dashboard and independent-session synchronization | PASS, local | UAT verifies dashboard totals and a second authenticated browser session synchronized in 902 ms, including recovery after network interruption. |
| Client privacy | PASS, local | UAT and browser/database cases verify client-visible data boundaries, separate feedback/acceptance, and review privacy. |

The UAT is local and disposable; it does not validate deployed Auth settings, real email delivery, hosted Edge Function ingress, production data, or production realtime behavior.

## Security and database checks

- pgTAP: **76 files / 1,161 assertions passed**.
- Schema lint: **no schema errors**.
- Security advisors: **25 INFO findings; no WARN or ERROR findings**. They comprise one unindexed foreign key, 15 indexes unused by the disposable test workload, and nine RLS-enabled tables with no policies. The nine tables remain deny-by-default; their intended server-only access and production role behavior still need production-context review. Disposable advisor usage is not a representative production workload, so unused-index findings are not deletion recommendations.
- Authenticated local role checks exercised Super Admin, Project Manager, HOD, Staff, and Client operations. HOD assignment scope and crafted cross-project restrictions passed. Seven command RPCs were verified with an empty `search_path`, executable by `authenticated` and `service_role`, and not executable by `anon`.
- Local storage tests verified private file download authorization, denial for unrelated files, immutable output, command-forgery rejection, and access revocation.
- Two bounded security-audit leads passed against local dummy users/data. Hosted Edge ingress, real mailbox delivery, production Auth configuration, and production storage authorization remain unverified.
- Backend PostgreSQL server version remains unverified.

## Performance comparison

The profiler used a local demo build, blocked service workers, a 5,000-task synthetic persisted workspace, desktop at 1440×900, and mobile at 390×844 with 4× CPU throttling, 150 ms latency, and 1.6 Mbps download. Each profile has two samples; values below are medians in milliseconds. These are synthetic client-side timings and do not include hosted database latency.

| Profile and metric | Before refactor | After refactor | Final recheck |
|---|---:|---:|---:|
| Desktop login FCP | 426 | 312 | 150 |
| Desktop dashboard ready | 2,256 | 1,490.5 | 1,596.5 |
| Desktop dashboard with 5,000 tasks | 949 | 1,072.5 | 432.5 |
| Desktop login long-task time | 456.5 | 416 | 202.5 |
| Desktop 5,000-task long-task time | 430 | 611 | 114.5 |
| Slow-mobile login FCP | 21,786 | 21,216 | 2,148 |
| Slow-mobile dashboard ready | 16,082 | 16,551 | 3,978 |
| Slow-mobile dashboard with 5,000 tasks | 17,359 | 18,222.5 | 2,978 |
| Slow-mobile login long-task time | 946.5 | 1,223 | 175.5 |
| Slow-mobile 5,000-task long-task time | 1,507 | 2,115.5 | 661.5 |

The final sample is faster for most measured values, while ordinary desktop dashboard readiness is slightly above the previous two-run median. The historical mobile samples were much slower than the final run. Treat these small-sample local measurements as directional; rerun with more samples before claiming a stable performance gain. API request counts, database query counts, hosted latency, and realtime subscription counts were not instrumented and remain unverified.

## Build, warnings, and quality gates

- TypeScript check, lint, unit tests (**121 files / 927 tests**), architecture verification (**226 source files; zero runtime or type-inclusive cycles**), and i18n AST audit (**zero findings**) passed.
- Normal production build and `pnpm verify:bundle` passed. Initial JS is 13.0 kB raw / 5.4 kB gzip; report charts are 381.8 kB / 107.4 kB; eager JS is 1,020.6 KiB / 294.4 KiB against a 300 KiB gzip cap.
- Vite still warns that `workspaceRuntime` is 573.12 kB raw (164.25 kB gzip), above its 500 kB raw warning threshold. Bundle budgets pass, so no speculative chunk split was made.
- Browserslist data produced no stale-data warning. The pinned Supabase CLI is 2.117.0; it reports 2.122.0 available. No dependency upgrade was made.
- Full-suite Node environment warning: `NO_COLOR` conflicts with `FORCE_COLOR`; fix the runner environment when convenient.

## Remaining issue register and rollback readiness

| Severity | Issue | Release effect / required action |
|---|---|---|
| BLOCKER | `20261024090000_security_boundary_hardening` is pending in production. | Complete only through the approved migration rollout and verify migration alignment afterward. Do not bypass the gate. |
| BLOCKER | The repository changes function definitions in migration files whose production history is recorded as already applied under timestamp aliases. | Before rollout, reconcile the local corrected migration history with the immutable production baseline through the existing release procedure. A fresh disposable replay does not reconcile already-applied production SQL. |
| BLOCKER | No deployment-specific validation or release approval was performed. | Verify hosted Auth/Edge/storage/realtime behavior and approve a pinned release artifact after migration reconciliation. |
| FOLLOW-UP | Nine no-policy RLS advisor findings; production role paths are not inspected here. | Confirm intended server-only access and deny behavior in production context; no policies were added or weakened. |
| FOLLOW-UP | API/query/realtime request counts and hosted latency are unavailable. | Capture repeatable telemetry under representative production-like conditions before making capacity/performance claims. |
| INFO | `workspaceRuntime` raw chunk warning exceeds Vite's 500 kB advisory threshold. | Bundle gzip budgets and build pass; investigate only if field measurements show a real cost. |
| INFO | Node test environment sets both `NO_COLOR` and `FORCE_COLOR`. | Align CI/local runner environment; application behavior is unaffected. |
| INFO | Supabase CLI update notice. | Version remains pinned; no unnecessary upgrade was performed. |

No production data or deployment was changed, so no production rollback was needed or exercised. The release candidate is not deployment-approved, and a production rollback drill has not been performed. Before release, pin the deployable artifact and document the approved database backup/restore or forward-repair procedure, especially for the pending security migration and aliased historical migrations. Existing working-tree changes and unrelated untracked files were preserved.

## Release decision

**NO-GO.** Application and disposable-database verification passed, but production migration alignment intentionally fails because `20261024090000_security_boundary_hardening` is pending, historical migration reconciliation is still required, and production-specific security/runtime checks and release approval have not been completed. Do not deploy from this candidate. No automatic deployment was attempted.
