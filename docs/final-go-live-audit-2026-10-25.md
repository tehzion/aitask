# AiTask final production stabilization and go-live audit

**Assessment date:** 2026-10-25
**Release decision:** **NO-GO**
**Candidate:** `codex/role-project-permissions-release-2026-10-20` at `35f46d62f4c6270bc142468f4e23808a3bd1be40`
**Currently deployed production commit:** `8eeba61ebe3e02825447201b18c6d1b0acfec595`
**Production changes made:** None. No production migration, data, setting, secret, or deployment was changed.

## Executive summary

The latest repository is a clean, committed release candidate, and the retained local evidence for this exact commit is strong: the complete 365-case browser suite passed, disposable database replay and database checks passed, and the frontend build/type/lint/unit/architecture gates passed. This audit did not rerun target-controlled commands because this host does not provide the required isolated, no-egress, empty-environment, read-only-target/toolchain, scratch-only execution controls. The prior run logs were inspected as evidence; they are not represented as a fresh run.

Production is not aligned to this candidate. The hosted database still has 124 migrations and does not include `20261024090000_security_boundary_hardening`. The live application deployment is at the parent commit, not the candidate. The production HOD assignment validator and task guard are older than the local candidate, and the live client-approval merge can reset completion state on an already completed task. Applying the pending migration alone would not reconcile already-applied historical SQL whose repository definitions changed after production recorded aliases.

Production-specific authorization, hosted configuration, backup/restore readiness, migration reconciliation, and explicit release approval remain unverified or failed. Recommendation: do not deploy. No automatic deployment or production rollout was attempted.

## Current baseline and change scope

- Branch: `codex/role-project-permissions-release-2026-10-20`.
- HEAD: `35f46d62f4c6270bc142468f4e23808a3bd1be40`; worktree clean at inspection.
- Production Vercel deployment: READY at `8eeba61ebe3e02825447201b18c6d1b0acfec595`.
- The candidate preserves the completed modular architecture. Prior stabilization changes include the HOD assignment guard/review fixes, completion-state preservation in the pending security migration, corrected test fixtures, and a narrow 390px toolbar overflow fix. This audit made no application or migration changes; this report is the only new repository file.
- The previous full test outputs remain at `/private/tmp/aitask-e2e-release-final.log` and `/private/tmp/aitask-db-final-pass9.log`.

## Database migration resolution

### Root causes

1. **HOD authorization replay failure:** the failing historical patch attempted a formatting-sensitive `pg_get_functiondef()` string replacement against a function whose text had changed earlier in the sequence. The final local version defines the authoritative `aitask_task_assignment_is_valid` function in `20261023120000_pm_hod_staff_assignment_state.sql`; `20261023150000_hod_task_execution_permissions.sql` adds execution-patch checks and HOD route validation. The recorded disposable replay passed. The later migration still contains source-text patches for other functions, so a sanitized production-schema preflight is still required; the replay pass is not proof that every alias-based production starting state matches those anchors.
2. **Repair-manifest mismatch:** the previous verifier selected a manifest by a `_production.json` filename suffix. The newer mutable candidate manifest retained a production-looking filename while correctly declaring itself `manifestKind: aitask-release-candidate`, `immutable: false`, and listing the security migration as pending. The verifier now reads typed manifest metadata and prefers the newest mutable candidate, while reserving immutable applied-production records for baseline evidence. It correctly fails closed on the pending migration rather than treating the candidate manifest as proof of production alignment.

### Current status and safe procedure

| Gate | Result | Evidence |
|---|---|---|
| Complete local migration replay | PASS in retained prior run | 125 repository migrations replayed in the disposable Supabase stack; the final rollout log reports success. |
| Migration consistency | PASS in retained prior run | 125 SQL migrations verified non-empty; migration history comparison passed in the disposable stack. |
| pgTAP and schema checks | PASS in retained prior run | 76 pgTAP files / 1,161 assertions; schema lint had no errors. |
| Production migration alignment | FAIL / BLOCKED | 124 production migration records through `20261023154255_bind_service_command_entity_types`; `20261024090000_security_boundary_hardening` is absent. `pnpm verify:release-db-alignment` previously exited 1 for this exact pending migration. |
| Historical SQL reconciliation | BLOCKED | Production history includes connector-generated aliases. Local historical migration definitions changed after those records were applied; filenames/aliases alone do not prove byte-for-byte SQL equivalence. |
| Production data changes | NONE | Production was inspected read-only. |

Do not edit migration history or mark the pending migration applied. Before any rollout: recover the exact applied SQL from immutable release artifacts, compare its hashes and effective functions/policies to production catalogs, restore historical files only to proven applied contents, move any intended corrections into a uniquely timestamped forward migration, preflight that forward migration against an isolated schema-only production clone, then run the approved migration and verify hosted migration history and object definitions. A failed/partial migration requires inspection and a forward repair, not a blind rerun.

## Complete browser regression results

| Suite | Result | Run evidence |
|---|---|---|
| Playwright browser suite | **365/365 passed** | `PLAYWRIGHT_REUSE_SERVER=true pnpm exec playwright test --workers=1`; one worker; 21.5 minutes; retained log dated 2026-10-25. Assertions/timeouts were preserved. |
| Responsive viewports | PASS locally | Existing cases cover 320, 375, 390, 414, 768, and 1024px; synthetic performance profiles cover 1440×900. The 390px overflow was reproduced and fixed earlier, then asserted. |
| Browser/runtime errors | No unresolved app error in retained suite | Node emitted the inherited `NO_COLOR`/`FORCE_COLOR` warning. Expected negative RPC/retry diagnostics appeared in fault-injection cases. |
| Fresh rerun in this audit | NOT RUN | Project scripts start target-controlled processes and write into the repository; required OS-enforced isolation controls are unavailable on this host. No test was skipped and then counted as passing. |

The full prior run contains no remaining failure. Earlier failures were triaged and resolved in that run: hydration/timezone fixture, app-smoke persistence/navigation fixture, published-cycle client privacy fixture, Staff workflow transition fixture, HOD role/assignment fixture, and a real mobile toolbar overflow. See the prior dated release report for reproductions and dispositions.

## Critical workflow verification matrix

| Workflow | Local/disposable evidence | Production evidence |
|---|---|---|
| Super Admin | PASS: company/project/plan/cycle/task setup and account controls through authenticated UI/RPC. | NOT VERIFIED with a production role account. |
| Project Manager | PASS: assigned-project operations and crafted cross-project denial. | NOT VERIFIED end-to-end. |
| HOD | PASS locally: department/project scope, delegation/review, valid saves, retries and denied forged routes. | NOT VERIFIED; live assignment validator differs from candidate SQL. |
| Staff | PASS locally across two PM projects, with assignment, evidence, submission, revision, resubmission and refresh. | NOT VERIFIED with production identities. |
| Client privacy | PASS locally for published content, private files, review/feedback and separate acceptance. | NOT VERIFIED against deployed client identities/storage. |
| Optional approval and task revisions | PASS locally for opt-out/default approval, revision and resubmission boundaries. | NOT VERIFIED; live workflow guard differs from candidate source. |
| Completed task reopening and client acceptance | PASS in disposable tests for intended candidate behavior. | BLOCKER: live merge definition can overwrite completion fields on client acceptance; pending migration contains the preservation fix. |
| Recurring cycles and renewals | PASS locally: renewal, updated scope/pricing, historical record integrity and dashboard totals. | NOT VERIFIED with hosted data/services. |
| Notifications | PASS locally for recipient visibility, read/unread, pagination and cleanup. | NOT VERIFIED for hosted delivery/email. |
| Dashboard/realtime sync | PASS locally: independent authenticated session sync and network recovery; 902ms in the retained UAT sample. | NOT VERIFIED for hosted behavior or latency. |

Local UAT recorded eight scenario groups and 84 assertions. These results do not substitute for deployed role tests, actual mail delivery, hosted Edge Function ingress, production storage authorization, or production realtime behavior.

## Security verification

| Check | Production result | Interpretation/action |
|---|---|---|
| Supabase security advisor | **ACTION REQUIRED** | 19 WARN findings for authenticated-callable `SECURITY DEFINER` functions; review each function’s callers, grants, and in-function authorization. Empty `search_path` and no `anon` execute grant do not alone establish correct resource authorization. |
| Leaked-password protection | **WARN / BLOCKER** | Disabled per production Auth advisor. Security owner must authorize configuration and verify the resulting advisor state. No setting was changed. |
| RLS tables without policies | 9 INFO findings | Read-only catalog checks found no direct `anon`/`authenticated` table grants on the nine affected tables; this supports deny-by-default but does not replace actual authenticated-role tests. No policies were added. |
| Authenticated role tests | PASS locally / NOT VERIFIED in production | Local disposable checks exercised Super Admin, PM, HOD, Staff, and Client paths, including cross-project and HOD assignment denials. No production user transaction was run. |
| Storage policies | Source/catalog evidence only | Production policies were observed with path and privacy scoping; live user allow/deny behavior was not tested. |
| Edge Functions | Metadata only | `invite-aitask-member` and `provision-aitask-launch-users` require JWT; public feedback submission has JWT verification disabled by design and separate result access checks. Hosted ingress and configured secrets were not tested or exposed. |
| RLS/RPC boundaries | BLOCKED for release | Candidate changes are not fully deployed; production role outcomes remain unverified. Do not weaken policies or treat the 9 INFO findings as a reason to add unnecessary policies. |

Production advisor also reported one unindexed foreign key and eight unused indexes. No index was changed; unused status is workload-dependent. The local disposable advisor had 25 INFO and no WARN, which does not supersede the live production advisor.

## API, realtime, and performance

Retained local tests exercised save/retry/idempotency, network interruption/recovery, concurrent edits, refresh, and independent-session synchronization. The production request/query/realtime-subscription counts and hosted latency are not instrumented in the available evidence.

The latest comparable local synthetic profile used a demo build, a 5,000-task workspace, service workers blocked, desktop 1440×900 and mobile 390×844 under 4× CPU throttling, 150ms latency and 1.6Mbps download. Values are two-sample medians and are directional only:

| Metric | Before refactor | After refactor | Final local recheck |
|---|---:|---:|---:|
| Desktop login FCP (ms) | 426 | 312 | 150 |
| Desktop dashboard ready (ms) | 2,256 | 1,490.5 | 1,596.5 |
| Desktop dashboard with 5,000 tasks (ms) | 949 | 1,072.5 | 432.5 |
| Slow-mobile dashboard ready (ms) | 16,082 | 16,551 | 3,978 |
| Slow-mobile dashboard with 5,000 tasks (ms) | 17,359 | 18,222.5 | 2,978 |

These numbers do not establish production performance or a statistically stable gain. API calls, database query counts, subscriptions, and hosted service latency remain NOT VERIFIED.

## Build, warnings, and runtime review

Prior retained evidence: production build and bundle budget PASS; TypeScript, lint, 121 unit-test files / 927 tests, architecture verification (226 source files, zero runtime/type-inclusive cycles), localization AST audit (zero findings), and bundle verification passed. These were not rerun in this audit.

- Eager JS was 1,020.6 KiB / 294.4 KiB gzip, within the 300 KiB gzip budget. Initial JS was 13.0 kB / 5.4 kB gzip.
- Vite still warns that `workspaceRuntime` is 573.12 kB raw (164.25 kB gzip), above its 500 kB raw advisory threshold. No change was justified by the passing bundle budget and lack of a measured user impact.
- Browserslist stale-data warning was not present in the retained build. Supabase CLI reports an update available; dependency/tool upgrade was not warranted for this release.
- Playwright logs show only the inherited `NO_COLOR`/`FORCE_COLOR` Node warning apart from expected fault-injection output.
- Vercel reported no runtime errors in the queried seven-day window. Its Hobby log-retention limit prevented a complete seven-day log query; the available 30-minute aggregate showed no error/fatal/warning events. This is limited telemetry, not a clean end-to-end production console/network assertion.

## Production configuration and recovery

| Gate | Result |
|---|---|
| Vercel production deployment identity | Verified: READY deployment is at the parent SHA `8eeba61…`, not candidate `35f46d6…`. |
| Vercel environment metadata | NOT VERIFIED: project metadata endpoint returned 403; no env values were retrieved. |
| Supabase Auth/redirect/SMTP configuration | NOT VERIFIED. |
| Edge secrets and deployed ingress behavior | NOT VERIFIED; secret values were not read. |
| Hosted storage/realtime behavior | NOT VERIFIED end-to-end. |
| Current database backup/PITR point and restore | NOT VERIFIED. Available immutable baseline/backup evidence is dated 2026-10-21 and predates later migrations; no restore drill was performed. |
| Frontend rollback | Vercel has a prior READY deployment, but rollback was not exercised and does not restore database state. |
| Database rollback/forward repair | NOT READY: no current recovery point or tested migration-specific restore/forward-repair procedure was provided. |
| Release approval | NOT APPROVED. No owner approval was observed. |

An upcoming Supabase Data API default change is scheduled for 2026-10-30. Supabase states that existing projects will require explicit grants for newly created `public` tables to be exposed through the Data API. Whether AiTask has affected clients or relies on old defaults is NOT VERIFIED; the project owner should review its exposure/grants before that date. [Official Supabase changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## Remaining issue register

| Severity | Component | Evidence and risk | Recommended action | Blocks deployment? |
|---|---|---|---|---|
| BLOCKER | Production database migration | Security migration `20261024090000_security_boundary_hardening` is absent; live client acceptance can reset completed-task fields. | Reconcile historical SQL, preflight on an isolated production-like schema, then perform an explicitly approved forward migration and verify it live. | Yes |
| BLOCKER | Historical migration integrity | Aliased applied migration history does not prove current repo SQL matches applied SQL. | Recover immutable applied SQL and hashes; correct history only from evidence and use a new forward migration for intended changes. | Yes |
| BLOCKER | Production authorization | HOD validator/task guard differ from candidate; production authenticated role outcomes and 19 SECURITY DEFINER functions lack completed review. | Review all flagged RPCs and run approved staging allow/deny matrix with real authenticated role contexts. | Yes |
| BLOCKER | Supabase Auth security | Leaked-password protection is disabled per live advisor. | Security owner to decide, configure through approved procedure, and verify. | Yes |
| BLOCKER | Recovery readiness | Current backup/PITR, restore viability, and database forward-repair path unverified. | Confirm a current recoverable point and run/record a non-production restore and forward-repair exercise. | Yes |
| BLOCKER | Hosted configuration and workflows | Vercel env metadata inaccessible; Auth/SMTP/Edge/storage/realtime and full production workflows unverified. | Project owner read-only configuration review plus isolated staging run with dedicated synthetic roles and mailbox. | Yes |
| BLOCKER | Release provenance/approval | Candidate is not deployed; no release-owner approval or production artifact provenance. | Run protected release pipeline against pinned candidate after all blockers close; require explicit owner approval. | Yes |
| FOLLOW-UP | Preview Supabase branch | A non-persistent preview branch reports `MIGRATIONS_FAILED`; it was not used. | Owner to confirm it is disposable and no longer needed before repair/removal. | No, unless shared with release process |
| FOLLOW-UP | Upcoming Supabase Data API defaults | 2026-10-30 change may affect newly created public tables if implicit exposure was relied on; project dependence is unknown. | Review explicit API grants/exposure and test a newly created table in staging. | Potentially; assess before 2026-10-30 |
| FOLLOW-UP | Production performance telemetry | API/query/subscription counts and hosted latency not captured. | Capture repeatable staging measurements before capacity claims. | No absent a defined SLO gate |
| INFORMATIONAL | Vite bundle warning | `workspaceRuntime` raw chunk 573.12 kB, while gzip budget passes and no measured defect is shown. | Revisit only if production field metrics show impact. | No |
| INFORMATIONAL | Test runner environment | `NO_COLOR` conflicts with `FORCE_COLOR`. | Align CI environment without masking other warnings. | No |

## Final release gate

| Category | Status |
|---|---|
| Application build | PASS (retained prior evidence; not rerun in this audit) |
| TypeScript and lint | PASS (retained prior evidence; not rerun in this audit) |
| Unit tests | PASS: 927 (retained prior evidence; not rerun in this audit) |
| Browser regression | PASS: 365/365 (retained prior evidence; not rerun in this audit) |
| Disposable DB replay / pgTAP | PASS: 125 migrations / 1,161 assertions (retained prior evidence) |
| Local role and workflow authorization | PASS in disposable environment; production NOT VERIFIED |
| Client privacy | PASS locally; production NOT VERIFIED |
| Production migration reconciliation/alignment | FAIL / BLOCKED |
| Hosted configuration and production role verification | NOT VERIFIED |
| Recovery readiness | NOT VERIFIED / BLOCKED |
| Release approval | NOT APPROVED |

**NO-GO.** Mandatory migration, authorization, recovery, hosted-configuration, production workflow, and explicit approval gates remain open. Do not deploy this candidate or apply migrations to production until an authorized owner approves the reconciled rollout plan. No deployment was attempted.

## Deployment checklist after blockers close

1. Pin candidate commit and build artifact; prove protected release workflow provenance.
2. Reconcile aliases to immutable applied SQL and effective catalog definitions.
3. Complete isolated production-schema migration preflight and role-based allow/deny tests.
4. Verify all 19 flagged `SECURITY DEFINER` RPCs and resolve/accept every advisor warning through the security owner; enable and verify leaked-password protection as approved.
5. Verify current backup/PITR and perform a non-production restore plus migration forward-repair drill.
6. Complete staging workflow tests for Super Admin, PM, HOD, Staff, Client, optional approvals, task revisions/reopening, recurring cycles, notifications, dashboard sync, private files, and mobile widths.
7. Verify Auth redirects/email, Edge Function ingress, storage, realtime, and explicit Data API grants without exposing secrets.
8. Obtain explicit release-owner approval, run the protected release pipeline, then perform the documented post-deploy checks. Stop and execute the approved frontend rollback or database forward-repair decision if any critical check fails.
