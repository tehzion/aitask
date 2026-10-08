# Version 3 pre-live remediation — 8 October 2026

**Release status: blocked.** The implementation addresses the eleven confirmed
source defects in [the pre-live audit](version-3-prelive-audit-2026-10-08.md).
Protected staging access has supporting code but remains unverified and its
Trusted Sources rules are unsaved at the user's request. Version remains 3.0.0.
The user requested a local Git commit after validation. No push, tag, production
migration, deployment or paid upgrade is included in that authorization.

## Changes and regression evidence

| Audit findings | Implementation | Verification |
| --- | --- | --- |
| 1: lost mixed-save groups | Persist the complete ordered batch before its first RPC, with stable command IDs, original comparison rows, progress and workspace version. Resume remaining groups; clear pending only after all succeed. Upgrade retained single commands and preserve newer edits/account guards. | Real store/adapter tests cover first/later group failure, reload, account fencing, permission changes, concurrent edits and conflict rebase preserving remote contact changes. Existing command tests cover acknowledgement loss and retry. |
| 2–3: onboarding loss and worker type | Service-only operation journal and v3 finalizer atomically record membership, registration approval, worker type and receipt. Auth ownership uses server-controlled metadata. Uncertain results reconcile; prepared logins are retained. Changed payloads conflict and unrelated accounts are refused. Older clients receive a reload instruction while retaining drafts. | Six actual-handler unit cases, 15 new database assertions and real local Auth/REST invitation/finalization tests. The actual handler loses a successful finalizer response, returns the confirmed receipt, replays it and retains a working password login. |
| 4: piped failures hidden | Explicit Bash in all three workflows. | A permanent deliberately failing pipeline test verifies `pipefail` returns failure. |
| 5: protected staging unavailable | Short-lived GitHub OIDC token helper, exact deployment-origin browser routing, no redirected provenance requests and no protection headers on Supabase requests. | Token/origin/redirect regression tests pass. Live Trusted Sources activation and protected hosted access remain outstanding. |
| 6: tagged QA configuration missing | Pass staging API URL/public key to tagged QA; validate API/service credentials, fixture and deployment settings before deployment or seeding. | Workflow regression tests and YAML validation pass; 13 hosted test cases collect successfully. Collection is not hosted execution. |
| 7: credential-bearing artifacts | Disable hosted trace/screenshot/video; scan files and nested ZIPs for configured secrets and credential fields before upload. | Dummy credential archive rejection and safe diagnostic tests pass. Limited historical artifact review found no exposed hosted password or trace ZIP. |
| 8: shared fixture race | PR and tag workflows share `aitask-staging-fixture` with cancellation disabled. | Configuration assertions pass. |
| 9: UTC defaults | Local dates for plans/projects/add-ons, one captured instant for plan start/billing day, stable untouched add-on baseline. | Positive/negative UTC-offset browser cases and midnight regressions pass. |
| 10: seventh Calendar column | Clip task bars to the six rendered days. | Unit assertions and browser grid geometry pass, including Sunday exclusion. |
| 11: stale Delivery tracker | Subscribe summary and overdue filtering to the shared local-day hook. | Midnight and resumed-tab browser regressions pass. |

The new database migration is
`20261007173905_reliable_member_onboarding.sql`. Historical migrations and v2 RPC
compatibility are preserved. Its journal denies direct access even to the service
role; only service-only RPCs and its private Auth trigger access it. No password
is persisted. Foreign-key indexes are included and schema lint has no findings.

## Verification results

| Check | Actual result |
| --- | --- |
| Typecheck and full ESLint | Passed. |
| Strict translation audit | Passed, zero findings across 130 source files. |
| Full unit suite | 502 tests in 72 files passed. The actual onboarding handler cases also passed after removal of an obsolete lookup. |
| Disposable Supabase rollout | 578 pgTAP assertions in 41 files passed; migration replay, schema lint, advisors and postflight passed. Real local Storage recovery, authenticated frontend Staff/HOD saves and onboarding Auth/REST recovery passed. Disposable containers were stopped and removed. |
| Standard browser suite | All 177 distinct scenarios passed across two runs: 168 passed initially; nine timeout failures passed on a targeted rerun using unchanged limits. Includes five new date regressions. This was not a single uninterrupted green run. |
| PWA browser suite | Three scenarios passed: offline Reports recovery, install flow and service-worker update preserving a dirty form. |
| Production build and static PWA | Passed on an isolated candidate excluding unrelated workspace changes. Build provenance uses the original source commit for local verification only; it does not identify a newly committed release. |
| Bundle budgets | Passed unchanged limits: eager graph 307,158 bytes gzip against 307,200, leaving only 42 bytes. Initial entry about 26.8 KiB gzip; report charts about 113.5 KiB. Recheck after the final commit because build metadata can change size. |
| CI/OIDC/artifact regressions | Passed pipeline failure, shared concurrency, configuration, exact-origin token handling and compressed credential detection. |
| Hosted staging | Not run: staging Supabase access is unauthorized and Vercel Trusted Sources rules remain unsaved. |
| Production database alignment | Correctly failed closed: `20261007173905_reliable_member_onboarding` is still pending. |

Local verification logs are retained under `/private/tmp/aitask-v3-remediation-*`,
including `unit-final.log`, `database-final.log`, `browser.log`,
`browser-retry.log`, `pwa.log`, `check-final.log`, `lint-final.log`,
`i18n-final.log` and `build.log`. These local files are temporary evidence, not
published release artifacts. Permanent regression sources are checked into the
working tree. The original unrelated access, Clients, ClientWorkspace and store
normalization edits remain intact; the isolated candidate excludes their saved
baseline patch.

## Repository and credential configuration

GitHub `master` protection was applied and read back: one approving review,
stale-review dismissal, administrator enforcement, conversation resolution,
strict `verify`, `database` and `verify-staging` checks pinned to GitHub Actions
app ID 15368, with force pushes and deletion prohibited.

The missing isolated HOD email/password secrets were added and their names
verified through GitHub. The password was generated without printing or writing
it into tracked files. Historical review covered metadata for 12 artifacts and
the four available v2.1.1–v2.1.4 release-evidence archives. No hosted password
evidence or trace ZIP was found in those four archives, so no exposed credential
was identified for rotation. This is a limited review, not proof that every past
log or expired artifact is clear. Rotate any subsequently identified exposure
before credential reuse.

## Remaining release blockers and rollout order

1. **Prepared protection rules:** the user explicitly chose “Leave the rules
   prepared.” The unsaved first Vercel form stays open. The second specification
   is in [staging setup](staging-release-setup.md). Activate only the exact
   `tehzion/aitask` repository and its two QA workflows on `aitask-staging`, then
   verify protected access and absence of credential leakage.
2. **Staging access and hosted QA:** the Supabase connector denied staging project
   `dyaxtloducpgjoxuaszk`; CLI project listing returned Unauthorized. Restore
   authorized isolated staging access, verify its credentials, then run the
   authenticated hosted suite. Production credentials must not substitute for it.
3. **Production database support:** the new migration remains in the reviewed
   pending tail. On a separately authorized rollout, apply database support
   before the updated Edge Function, then the frontend; verify production
   alignment and the required backup/read-only security evidence. Do not repair
   history or declare the tail deployed from a local test.
4. **Leaked-password protection:** the organization is on Free and the setting
   requires Pro or above. No paid upgrade or risk exception was authorized. The
   warning remains open, outside the security-advisor allowlist.
5. **Managed database patch:** the earlier read-only audit found production
   PostgreSQL 17.6 with a newer managed security patch available. No upgrade was
   performed. Resolve and verify this item before release.

Keep the release blocked until these gates pass. No risk exception is implied by
passing local tests. When publication is separately requested, rebuild artifacts
from the final reviewed, committed source and verify that exact deployment's
provenance; the current working-tree build is not a release package.
