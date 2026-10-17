# AiTask Production Readiness Report

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Branch:** `codex/audit-p0p1-2026-10-16`
**Committed baseline:** `c46bbcb`
**Review state:** the worktree changed during this review and contains uncommitted application, migration, test, and report changes. Those changes were reviewed but were not committed or deployed.

## A. Overall assessment

**Decision: NOT READY FOR PRODUCTION.**

The committed application baseline type-checks, lints, builds, passes its PWA and bundle budgets, and the disposable Supabase stack passes all 67 pgTAP files / 1,024 assertions plus anonymous-access security probes. However, the current worktree is not a releasable artifact:

1. The current unit suite has **5 failing tests** after the new user-facing error normalization changes.
2. The new immutable history migration has a confirmed delete regression: its append-only trigger rejects both workspace cascade deletion and the `ON DELETE SET NULL` update caused by member deletion.
3. The release manifest describes 110 migrations while the current tree contains **113**; `pnpm verify:release-db-alignment` fails.
4. The full 324-test browser matrix was started but aborted after repeated failures; it is not a passing release gate.
5. Production and staging state were not independently authenticated in this review. Backups, Auth leaked-password protection, edge-function deployment state, monitoring, and four-role staging QA remain operational acceptance items.

## Verification coverage

| Boundary | Result | Evidence |
| --- | --- | --- |
| TypeScript | Pass | `pnpm check` exit 0 on current dirty tree |
| ESLint | Pass | `pnpm lint` exit 0 on current dirty tree |
| i18n | Pass | 0 findings across 171 source files |
| Migration non-empty guard | Pass | 113 SQL migrations non-empty |
| Unit tests | **Fail** | 107 files; 823 passed, 5 failed |
| Production build | Pass | Vite/PWA build succeeds; warnings only |
| PWA contract | Pass | `node scripts/verify-pwa.mjs` |
| Bundle budgets | Pass with warning | Eager graph 294.5 KiB gzip under 300 KiB cap; `workspaceRuntime` remains 547.63 kB raw |
| Disposable Supabase migrations | Pass | All current migrations applied in order, including three uncommitted migrations |
| Disposable pgTAP | Pass | 67 files / 1,024 assertions |
| Disposable schema lint | Pass | No schema errors |
| Supabase advisors | Pass with informational findings | Unused indexes and intentionally policy-less restricted tables |
| Anonymous security probes | Pass | Protected RPCs/tables unavailable to anonymous callers; secure cutover confirmed |
| Local authenticated smoke helpers | **Regression detected** | Positive Staff/storage paths passed; teardown failed on immutable history FK behavior |
| Browser E2E | **Incomplete/fail** | 324 tests started; broad run aborted after observed accessibility/save-recovery failures |
| Live production/staging | Not verified | No independent authenticated production/staging session was used |

## B. Previous-fix verification summary

| Previous issue/fix | Result | Evidence |
| --- | --- | --- |
| PM portfolio/client scope and department visibility migrations | **Verified Fixed in disposable DB; live state unable to verify** | Relevant pgTAP cases pass in the 1,024-assertion local run; production manifest is stale relative to current tree |
| Client-visible completion/approval ordering | Verified Fixed under signed-off policy | Store/DB tests and pgTAP pass; current policy allows PM completion before later client acceptance |
| Service-cycle and client-plan transition guards | Verified in pgTAP | Transition pgTAP cases pass; the new narrow service-cycle RPC migration is uncommitted and needs a focused test |
| Notification audience, unread state, and deletion cleanup | Verified in pgTAP/source tests | Notification and cleanup suites pass in disposable DB; live Realtime delivery is not verified |
| Secure cutover / anonymous direct access | Verified in disposable DB; live state not independently verified | Anonymous RPC/table probes pass against local migrated stack |
| UI feedback and recovery improvements | Partially verified | Build/type/lint pass; current unit expectations fail after safe error normalization; browser save-recovery tests did not reach their intended harness |
| Workspace Realtime invalidation | Partially fixed | Source/unit coverage and migration application pass locally; live subscription delivery and deployed publication are not verified |
| Immutable audit history | **Regression Detected** | New migration captures history, but append-only trigger rejects workspace cascades and member `ON DELETE SET NULL` cleanup |

## C. Remaining defects and gaps

| Priority | ID | Area | Impact | Evidence | Smallest reliable action |
| --- | --- | --- | --- | --- | --- |
| P1 | HIST-001 | `aitask_entity_history` | Workspace deletion and member deletion can fail because FK maintenance is an UPDATE/DELETE rejected by the immutable trigger | Local smoke output: `Entity history is append-only` during workspace cascade and member `ON DELETE SET NULL` | Decide retention semantics, then remove the conflicting FK action or make only trusted referential cleanup exempt while preserving user DML immutability; add pgTAP delete tests |
| P1 | REL-002 | Release manifest | 113 migrations exist but the committed manifest validates only 110; release-alignment gate fails | `pnpm verify:release-db-alignment` | Update the manifest only after migration ownership, ordering, pgTAP, and intended production rollout are approved |
| P1 | TEST-003 | Error presentation | The current implementation and unit expectations disagree; five tests fail | `secureWorkspace.test.ts` (4 failures) and `serviceFileIntegrity.test.ts` (1 failure) | Update tests or adjust the normalization contract, then rerun the full unit suite |
| P1 | UX-004 | Browser bootstrap/accessibility | Password-setup/demo fixture assumptions prevent several E2E scenarios; mobile focus and save-recovery contracts are not green | `accessibility.spec.ts` missing `Continue for now`; `action-save-gaps.spec.ts` missing `window.finishActionSave`; broad run aborted | Make auth fixture setup deterministic, then rerun the complete browser matrix and fix any product-level focus/overlay defects |
| P1 | CFG-005 | Hosted password bypass | Explicit `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=true` is accepted by runtime code on hosted origins; production build validation does not reject it | `src/lib/auth.ts:78-86`, `vite.config.ts:43-69` | Fail production builds when the bypass flag is enabled, or force it off outside local development |
| P1 | OPS-006 | Production operations | Scheduled backups, leaked-password protection, staging access, and independent live RLS verification remain unconfirmed or unavailable | Existing operational reports and no live authenticated session in this review | Restore staging access, verify production settings read-only, establish backup/recovery ownership, and resolve plan/provider limitations |
| P2 | REL-007 | Edge-function reliability | Auth email/member changes are compensating multi-step operations; full Auth-user scans can scale to 100,000 users | `invite-aitask-member/index.ts` | Add durable reconciliation and indexed/direct uniqueness lookup |
| P2 | PERF-008 | Bundle/startup | Eager workspace runtime is 547.63 kB raw / 159.54 kB gzip and triggers Vite’s large-chunk warning | Current `pnpm build` output | Split eager state/runtime dependencies and budget authenticated startup separately |
| P2 | LIFE-009 | Lifecycle policy | Member/client/project hard deletion removes ordinary operational history; no first-class deactivation/archive model exists | Current lifecycle and historical-data audits | Obtain explicit retention/deletion policy approval before exposing historical archive behavior |

## D. Production readiness scorecard

| Category | Score | Status | Key finding |
| --- | ---: | --- | --- |
| Core functionality | 7/10 | Conditional | Source/unit coverage is broad, but full browser journeys are not green |
| Supabase integration | 8/10 | Conditional | Disposable migrations, pgTAP, lint, and anonymous probes pass; live deployment not verified |
| Database integrity | 6/10 | Blocked | History migration introduces delete/FK trigger conflict; polymorphic soft references remain |
| Security | 7/10 | Conditional | RLS architecture is strong; hosted bypass guard and live state remain open |
| Authentication & permissions | 7/10 | Conditional | Server-side/RLS controls pass locally; staging and token lifecycle scenarios are unverified |
| Performance | 6/10 | Partial | Bundle passes cap but eager runtime is large; live-scale profiling not run |
| UI/UX consistency | 6/10 | Blocked | Accessibility/save-recovery E2E failures prevent a clean release claim |
| Error handling | 6/10 | Blocked | Safe normalization is directionally correct but five unit expectations fail |
| Test coverage | 7/10 | Blocked | pgTAP is strong; unit and browser gates are not green |
| Deployment readiness | 4/10 | Blocked | Manifest drift and live/staging verification gaps remain |
| Operational reliability | 4/10 | Blocked | Backup, monitoring, Auth settings, and recovery ownership are not fully evidenced |

## E. Release decision

**NOT READY FOR PRODUCTION.**

The release cannot responsibly proceed until the history migration delete semantics are corrected and tested, the migration manifest is reconciled, the five unit failures are resolved, and the browser/authentication fixtures and four-role staging paths complete successfully. The existing committed baseline may be suitable for controlled staging review, but the current dirty tree is not an approved release artifact.
