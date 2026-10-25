# AiTask production migration reconciliation and final release gate

**Assessment date:** 2026-10-25
**Decision:** **NO-GO** — do not deploy this candidate.
**Production scope:** Read-only inspection only. No production database, project setting, secret, deployment, or customer data was changed.

## Executive summary

The committed production deployment is identifiable, and local disposable-database and browser evidence is strong. Production release is still blocked by an unapplied security migration, mismatch between the effective production definitions and the current uncommitted historical migration files, actionable production security-advisor warnings, and missing recovery/configuration evidence. A local full replay does not establish that already-applied production migrations match the changed local files.

Production currently records 124 migrations, through `20261023154255_bind_service_command_entity_types`; `20261024090000_security_boundary_hardening` is absent. The current release-alignment verifier correctly exits 1 and reports that migration pending. Several live production functions/policies also differ from current working-tree migration definitions, so simply applying the pending migration would not reconcile all changes.

The active Vercel production deployment is `dpl_EKNFfLYPKczzfED3zXF5GGKG1KoQ`, READY at commit `8eeba61ebe3e02825447201b18c6d1b0acfec595`. The local checkout has 427 tracked changes (including 296 deletions) and 44 untracked files, none staged. It is not a clean, pinned release candidate and must not be deployed as-is.

## Migration reconciliation

### Findings and root causes

| Area | Finding | Disposition |
|---|---|---|
| HOD authorization replay failure | The historical `20261023150000_hod_task_execution_permissions.sql` used a formatting-sensitive `pg_get_functiondef()` text replacement. Earlier edits changed the target function text, so the expected match was absent and disposable replay failed. The current working-tree migration defines the assignment validator in the earlier `20261023120000` migration and removes that brittle patch. | Root cause established for the disposable replay. The repaired local sequence replays, but the changed historical files have already-applied production aliases. Do not replay or repair production history; reconcile source and use a new forward migration for any intended changes. |
| Repair-manifest selection | The verifier previously selected a manifest by `_production.json` filename suffix, allowing a mutable release-candidate manifest to be confused with an immutable applied-production record. Selection now requires `manifestKind: aitask-applied-production-release` and `immutable: true`. | Local verifier selection is corrected. The candidate still correctly records the pending migration. Manifest alias names are not SQL hashes and do not prove historical SQL identity. |
| Applied migration aliases | Production records the four October 23 migrations at aliased timestamps. Current manifest names map to those aliases, but the newer files are modified locally and the manifest does not provide hashes proving the exact applied SQL. | History names align; content provenance does not. Do not mark these files applied again or use `migration repair` to manufacture alignment. |
| Pending security migration | Production does not list `20261024090000_security_boundary_hardening`. A live client-approval merge trigger still clears completion state and timestamp when accepting a PM-completed task; the pending migration contains the preservation fix. | Production behavior defect confirmed by live function definition. Pending migration has not been applied. It has dynamic exact-text patches and is not safe to blindly rerun after partial application. |

### Production versus current local definitions

The following were read from production catalogs and compared to the working-tree SQL. They establish current effective behavior, not the exact historical SQL that was applied:

| Migration/file area | Production observation | Current working-tree difference / concern |
|---|---|---|
| `20261023120000_pm_hod_staff_assignment_state` | `private.aitask_task_assignment_is_valid` has the narrower prior logic; it lacks the current `v_has_eligible_hod` and department/project reviewer logic. It is `VOLATILE`. `private.aitask_can_mutate_entity` is `STABLE`, and `aitask_entities` write policies reference the legacy helper. | Working tree adds eligibility and scope checks, changes helper volatility, grants/rebinds service mutation authorization, and binds policies to the newer helper. These changes are not proven present in production. |
| `20261023150000_hod_task_execution_permissions` | The effective production assignment function does not show the broader expected HOD fallback/scope behavior. | Working-tree version removes the brittle function-source patch. Migration history alone cannot establish whether the original SQL differed, was superseded, or was later changed. |
| `20261023170000_task_workflow_action_guards` | The live task-stage guard lacks the Staff-only UPDATE guard and optional-approval PM completion marker present in the current migration source. | These are behavior differences requiring forward reconciliation and role tests; the catalog comparison alone does not prove an exploit. |
| `20261023180000_bind_service_command_entity_types` | Production history contains alias `20261023154255`; the migration name aligns. | No separate behavior drift was established in the read-only checks. Exact applied SQL hash remains unproven. |
| `20261024090000_security_boundary_hardening` | Not recorded in production history. | Contains the client-completion preservation fix and other security/workflow changes. Requires full isolated production-schema preflight before any approved rollout. |

The current applied migration suffix is: `20261020030644`, `20261020030745`, `20261020131544`, `20261021110000`, `20261023040256`, `20261023063131`, `20261023063344`, `20261023154255`. The first two correspond to older aliases in the immutable baseline; the October 23 alias mappings are in the candidate manifest. The latter mappings are name-based only.

### Migration verification results

- **Local disposable migration replay:** PASS, 125 repository migrations, as recorded in the prior dated release-readiness report. This is local evidence only.
- **Local release-alignment verifier:** FAIL-CLOSED as expected; `pnpm verify:release-db-alignment` exits 1: `Production migrations are still pending: 20261024090000_security_boundary_hardening`.
- **Live production migration list:** 124 rows, latest `20261023154255_bind_service_command_entity_types`; pending migration absent.
- **Production-schema clone/replay:** NOT VERIFIED. No sanitized schema-only production clone was available. Production was not used as a replay target.
- **Migration history repair:** NOT PERFORMED. No history rows were modified.
- **Production data:** NOT MODIFIED.

### Safe reconciliation plan

1. Freeze and preserve the current dirty checkout. Do not deploy it.
2. Recover the exact original migration SQL from the immutable release artifact/commit that was applied, compare it with the production function/policy catalog definitions, and record hashes. Do not infer equivalence from timestamps or names.
3. Restore historical migration files only to proven applied contents where needed. Put intended corrections in a new, uniquely timestamped forward migration. Do not reapply aliased migrations or alter migration history to silence the verifier.
4. Build a sanitized schema-only clone from the production schema (no production rows), test the pending migration’s every dynamic precondition and postcondition, and replay the complete forward sequence. If a migration partially applies, inspect actual state and prepare a forward repair; do not rerun blindly.
5. Run pgTAP, authenticated role tests, HOD assignment denials, cross-project denials, and security advisors on that isolated clone. Then follow the reviewed/approved database rollout and independently verify live migration alignment.

## Browser and local application regression evidence

The prior release-readiness report records the complete Playwright run as **365/365 passing** with existing assertions and timeouts retained (single worker, 21.5 minutes). Fixture issues and a reproduced 390px toolbar overflow were corrected and the complete suite rerun. No unresolved application browser failure remained in that run. No source or E2E files were modified after that run according to the prior verification record.

Other recorded local evidence: **76 pgTAP files / 1,161 assertions**, **8 UAT groups / 84 assertions**, and unit tests **121 files / 927 tests** passed. These were run against disposable/local state, not production credentials or production data. See [the earlier release-readiness report](release-readiness-2026-10-25.md), [browser log](/private/tmp/aitask-e2e-release-final.log), and [database rollout log](/private/tmp/aitask-db-final-pass9.log).

There was an inherited Node warning that `NO_COLOR` is ignored while `FORCE_COLOR` is set. The prior report records no unresolved app runtime/browser console error. Fault-injection RPC diagnostics were expected negative-test output. The complete suite evidence does not substitute for a clean commit/pinned artifact or hosted production-path checks.

## Critical workflow verification matrix

| Workflow | Local disposable evidence | Production evidence/status |
|---|---|---|
| Super Admin setup | PASS — company, project, assignments, plan/cycle/tasks via authenticated UI/RPCs. | NOT VERIFIED with a production role account. |
| Project Manager project scope | PASS — scoped work succeeds; crafted cross-project assignment denied. | NOT VERIFIED end-to-end; production catalog shows authenticated RLS and RPC boundaries, but no real-account transaction was run. |
| HOD assignment and department limits | PASS locally — status-save/retry, department/project boundaries, delegation/review and forged assignment denials. | NOT VERIFIED; live assignment-validator definition is narrower than current local source. This is a release blocker pending reconciliation and authenticated role tests. |
| Staff participation across projects | PASS — one Staff account works under two PMs; save/reload tested. | NOT VERIFIED with production account. |
| Optional approval | PASS — opt-out/default approval, role boundaries and completion behavior. | NOT VERIFIED; live stage guard lacks current local optional-approval marker. |
| Revisions/resubmission | PASS locally. | NOT VERIFIED. |
| Completed-task reopening | PASS locally. | NOT VERIFIED; pending migration fixes a confirmed production client-acceptance merge that currently resets completion fields. |
| Recurring cycles/renewals | PASS locally — renewal, scope/pricing changes, immutable monthly history, dashboard totals. | NOT VERIFIED against production data/services. |
| Notifications | PASS locally — recipient visibility, read/unread, pagination and cleanup. | NOT VERIFIED for hosted delivery/email. |
| Dashboard/realtime synchronization | PASS locally — second authenticated session sync and network recovery measured at 902 ms. | NOT VERIFIED for production realtime behavior or hosted latency. |
| Client privacy | PASS locally — published-cycle visibility and privacy/acceptance boundaries. | NOT VERIFIED against production storage/client accounts. |

Production behavior is not marked PASS based on local tests. A dedicated, approved staging tenant and role-account run is still required after migration/source reconciliation.

## Production security verification

Read-only Supabase project inspection identified project `ohjhwyiffgzyatcmmdql` (`AiTask`, `ACTIVE_HEALTHY`, ap-southeast-1, PostgreSQL 17.6.1.121).

| Check | Result |
|---|---|
| Production security advisor | **FAIL / ACTION REQUIRED:** 19 WARN findings for authenticated-executable `SECURITY DEFINER` functions and one WARN that leaked-password protection is disabled. Each RPC needs an intended-caller/auth-boundary review; warnings were not classified as harmless. No production setting was changed. |
| `SECURITY DEFINER` catalog | All 19 observed functions have empty `search_path` and are not executable by `anon`; authenticated execution remains granted. This reduces search-path risk but does not replace per-function authorization review. No real-user exploit or safe-path test was performed. |
| RLS/no-policy advisor | 9 INFO findings. Catalog/privilege checks found the affected internal tables have no direct anon/authenticated grants (and intended server-only access is deny-by-default). `service_role` has normal Supabase RLS bypass. No policy was weakened or added. |
| Storage | Four production object policies were observed with path scoping, privacy/read predicate, uploader ownership and HOD/PM scope. No live user file-access test was performed. |
| Role-based authenticated access | Local dummy-role tests PASS. Production end-to-end Super Admin/PM/HOD/Staff/Client authorization is **NOT VERIFIED**. Role catalog shape is standard; catalog data alone does not prove application-level outcomes. |
| Auth password setting | Leaked-password protection is disabled per production advisor. **BLOCKER** pending authorized security-owner disposition/configuration and verification. |
| Edge Functions | `invite-aitask-member` active v38, `verify_jwt=true`; `aitask-feedback` active v24, `verify_jwt=false`; `provision-aitask-launch-users` active v5, `verify_jwt=true`. Names/metadata only inspected; secrets and ingress behavior were not tested. |
| Realtime | Production publication contains `aitask_entities`, `aitask_members`, `aitask_workspaces`. End-to-end production subscription/authorization not tested. |
| Other advisor findings | 1 unindexed-FK INFO and 8 unused-index INFO findings. No index was changed; unused status is workload-dependent. |

The live production Supabase advisor is the source for this assessment and supersedes the earlier local disposable advisor result of 25 INFO / zero WARN. The production warnings are actionable until reviewed and explicitly resolved or accepted by the security owner.

## Production configuration, deployment and recovery

- **Vercel deployment:** Production deployment is READY at the identified commit and aliases include `aitask-virid.vercel.app`. Vercel reported no runtime errors in its selected last-seven-days query; this does not cover Supabase, browser clients, email, or database logs.
- **Candidate integrity:** Local HEAD is the deployed SHA, but the worktree is heavily modified and uncommitted. The repository release workflow requires a release tag matching `package.json` and `origin/master == GITHUB_SHA`, then build, disposable DB rollout, alignment gate, staging deployment and authenticated staging QA. This checkout is not demonstrated to satisfy that protected release path.
- **Production environment-variable metadata:** BLOCKED — Vercel returned 403 for project environment-variable listing. No values were retrieved. Vercel CLI is unavailable in this workspace, and no alternative access was used.
- **Supabase project configuration:** Only exposed read-only project/branch/function/catalog/advisor information was inspected. Auth/SMTP details, complete secret metadata and all deployment settings were not available through the connected read-only tools. **NOT VERIFIED.**
- **Preview branch:** one non-persistent preview branch reports `MIGRATIONS_FAILED` and `with_data=false`. It was not used as a test clone; owner review/cleanup is needed.
- **Backup/recovery:** the recorded immutable baseline contains a backup/restore record dated 2026-10-21, which predates the October 23 migrations and is not evidence of a current recovery point. Current backup/PITR status, restore viability and a database rollback/forward-repair runbook are **NOT VERIFIED**. Vercel app rollback candidate metadata does not prove database recoverability. No restore drill was run.

Before approval, a project owner must verify a current recoverable database backup/PITR point and a tested restore/forward-repair plan, confirm production configuration without exposing secret values, and record who has authority to approve the migration window and rollback decision.

## Performance, build and warnings

Repeatable synthetic local browser profiles used a demo build, service workers blocked, a 5,000-task synthetic workspace, desktop 1440×900, and mobile 390×844 with 4× CPU throttling, 150 ms latency and 1.6 Mbps download. Each value is the median of two samples; these are client-side timings, not hosted service measurements.

| Metric (ms) | Before refactor | After refactor | Final recheck |
|---|---:|---:|---:|
| Desktop login FCP | 426 | 312 | 150 |
| Desktop dashboard ready | 2,256 | 1,490.5 | 1,596.5 |
| Desktop dashboard / 5,000 tasks | 949 | 1,072.5 | 432.5 |
| Desktop login long-task time | 456.5 | 416 | 202.5 |
| Desktop 5,000-task long-task time | 430 | 611 | 114.5 |
| Slow-mobile login FCP | 21,786 | 21,216 | 2,148 |
| Slow-mobile dashboard ready | 16,082 | 16,551 | 3,978 |
| Slow-mobile dashboard / 5,000 tasks | 17,359 | 18,222.5 | 2,978 |
| Slow-mobile login long-task time | 946.5 | 1,223 | 175.5 |
| Slow-mobile 5,000-task long-task time | 1,507 | 2,115.5 | 661.5 |

The final sample is lower on most metrics, with desktop dashboard readiness slightly above the prior two-sample median. Sample count is too small to claim a stable gain. API request counts, database query counts, hosted latency, and production realtime subscription counts were not instrumented.

Recorded local quality gates: production build, TypeScript, lint, architecture check (226 source files; zero runtime/type-inclusive cycles), i18n audit, bundle verification, unit tests, and disposable DB/browser suites passed. Build output includes a Vite advisory: `workspaceRuntime` is 573.12 kB raw (164.25 kB gzip), above the 500 kB raw warning threshold; the 300 KiB gzip budget passes, so no speculative chunk split was made. Browserslist data produced no stale-data warning. Supabase CLI update notice was not acted on. The inherited `NO_COLOR`/`FORCE_COLOR` warning remains a runner-environment cleanup item.

## Remaining issue register

| Severity | Issue | Required evidence/action before GO |
|---|---|---|
| BLOCKER | Pending `20261024090000_security_boundary_hardening`; confirmed production client-acceptance completion-state defect. | Isolated production-schema preflight and approved forward migration; verify live migration history and behavior afterward. |
| BLOCKER | Current local historical migration definitions diverge from effective production definitions under already-recorded aliases. | Prove applied SQL from immutable artifacts and catalog, reconcile historical sources, and place intended corrections in a new forward migration. |
| BLOCKER | Production HOD assignment validator and task workflow guard differ from current local security/workflow logic. | Reconcile via forward migration and verify authenticated allowed/denied cases, including cross-project and department boundaries. |
| BLOCKER | 19 authenticated `SECURITY DEFINER` advisor warnings have not had per-RPC authorization review. | Review callers, grants, checks, and negative cases for every function; remediate or record explicit authorized risk acceptance. |
| BLOCKER | Production leaked-password protection disabled. | Authorized security owner decision/configuration, then verify the resulting production advisor state. |
| BLOCKER | Current backup/PITR and database recovery path are unverified. | Confirm current recoverable point and tested restore/forward-repair procedure without touching customer data. |
| BLOCKER | Production project environment metadata and full Auth/SMTP/storage/realtime config unavailable. | Project-owner read-only verification; never expose secret values in report/logs. |
| BLOCKER | Production authenticated workflow verification not performed; local UAT does not exercise deployed services. | Dedicated staging project/tenant with Super Admin, PM, HOD, Staff and Client accounts; complete smoke matrix and capture evidence. |
| BLOCKER | Dirty, uncommitted checkout is not an approved release artifact. | Clean, pinned protected-master commit, build artifact provenance, staging QA, release approval and rollback plan. |
| FOLLOW-UP | Preview Supabase branch reports `MIGRATIONS_FAILED`. | Owner to inspect and remove/repair only after confirming it is disposable and no longer needed. |
| FOLLOW-UP | Request/query/realtime counts and hosted latency not measured; performance profiles have two samples. | Instrument repeatable staging/production-like measurements before capacity claims. |
| INFO | `workspaceRuntime` raw chunk exceeds Vite advisory; bundle gzip cap passes. | No change absent measured user impact. |
| INFO | Node test runner has conflicting color environment variables. | Align runner env without masking other warnings. |

## Staging smoke checklist for the next approved verification window

Use an isolated staging Supabase/Vercel environment and dedicated synthetic accounts/data. Do not use customer records. Capture build SHA, migration IDs, role, request/result, denial result, browser console, server logs, and cleanup status for each case.

1. Login/logout, session refresh and password recovery; verify Auth policy and controlled mailbox delivery.
2. Super Admin creates scoped project and cycle; verify assignments and dashboard totals.
3. PM creates tasks in own project, attempts cross-project assignment, configures optional approval, revises/resubmits, and reopens eligible completed work. Assert unauthorized cross-project actions are denied.
4. HOD reviews only department/project-eligible Staff work; attempt forged assignee, department, project, and reviewer fields and assert denial. Verify allowed status saves and refresh/retry behavior.
5. Staff works across two authorized projects, submits evidence, follows status transitions, receives revision, resubmits, and completes review. Verify direct completion restrictions.
6. Run recurring cycle renewal and pricing/scope change; verify immutable historical month and dashboard aggregates.
7. Verify client sees only published/client-visible content, acceptance does not erase internal completion, and private files are inaccessible to unrelated users.
8. Verify notification recipients, unread/read state, deletion cleanup, dashboard synchronization across sessions, reconnect recovery, and realtime authorization.
9. Verify mobile layout at 390×844 and large-task-list behavior under fixed network/CPU conditions. Record API/query/subscription counts and timings without changing thresholds or assertions.
10. Confirm cleanup of synthetic users/data and preserve all failures, console errors, warnings and logs for triage.

## Final release recommendation

**NO-GO.** Mandatory gates remain open: production migration/source reconciliation; pending security migration and confirmed production behavior defect; production authorization/security-advisor review; password-protection configuration; backup/recovery evidence; deployed staging workflow verification; and clean pinned release provenance. Local replay, local role tests, and 365/365 browser tests are positive evidence but do not close these production gates.

No production migration, repair, configuration change, secret read, data change, or deployment was performed. Reassess only after the evidence above is collected and an authorized owner explicitly approves the production rollout. Do not deploy automatically or deploy the current dirty checkout.
