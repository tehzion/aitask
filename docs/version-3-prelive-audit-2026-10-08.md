# Version 3 pre-live audit — 8 October 2026

**Release recommendation: hold the release.** The committed candidate still has
two data-loss paths and release controls that can fail silently or cannot run.
Passing the existing suite does not cover the newly reproduced failure cases.

This audit targets version **3.0.0**, commit
`a88b0b1bd1690c885928197f51a8b2488e7c46d7`. Source was extracted into
`/private/tmp/aitask-v3-prelive-20261008`. The shared workspace's separate edits
to access, company pages and the store were excluded. Source pointers below
refer to the audited commit. No application fix, push, tag, deployment, paid
upgrade or production setting change was performed.

The user story under review is the full operational flow: Boss/Staff/Client
actions → authenticated commands and storage → persisted workspace state →
reports and calendars → a reviewed, verifiable production release.

## Data persistence and onboarding

Implementation follow-up: [version 3 pre-live remediation](version-3-prelive-remediation-2026-10-08.md).
The findings below describe the audited source before these fixes.

1. **P1 — A recovered company rename silently loses service changes.**
   [secureWorkspace.ts:2546](/Users/user/Downloads/aitask-master/src/lib/secureWorkspace.ts:2546)
   exits when the first of multiple command groups fails and retains only that
   group. [store/index.ts:2056](/Users/user/Downloads/aitask-master/src/store/index.ts:2056)
   treats a successful retry as completion of the whole save and reloads canonical
   state. A full real-store/adapter reproduction renamed Old Company to New
   Company, failed the generic RPC, then retried: the client became New Company,
   the service cycle reverted to Old Company, no service RPC was sent, and the
   backend reported Saved with zero pending changes. Only the transport was
   mocked. Preserve and resume the entire ordered save operation, and clear
   pending state only after every group is confirmed.
   [Reproduction log](/private/tmp/aitask-v3-prelive-mixed-save-repro.log).

2. **P1 — A lost invitation acknowledgement can destroy a committed login.**
   [invite-aitask-member/index.ts:361](/Users/user/Downloads/aitask-master/supabase/functions/invite-aitask-member/index.ts:361)
   deletes a newly created Auth user on every finalization RPC error. If the
   database committed and its response was lost, the member remains while its
   Auth FK is cleared by `ON DELETE SET NULL`. The actual handler was executed
   with a modeled committed response loss, confirming the destructive branch.
   Reconcile finalization status before rollback, retain uncertain accounts, and
   resume onboarding through a stable operation identity.

3. **P2 — The advertised worker-type retry cannot succeed.**
   [invite-aitask-member/index.ts:370](/Users/user/Downloads/aitask-master/supabase/functions/invite-aitask-member/index.ts:370)
   asks Boss to retry when member creation succeeds but saving worker type fails.
   The next direct invite is rejected because the Auth account exists
   ([line 325](/Users/user/Downloads/aitask-master/supabase/functions/invite-aitask-member/index.ts:325)).
   An actual-handler reproduction left a requested freelancer as an employee.
   Make worker type part of finalization, or provide a safe authorized resume
   path for the already-created member.
   [Onboarding reproduction log](/private/tmp/aitask-v3-prelive-invitation-repro.log)
   covers findings 2–3 with mocked provider boundaries; no live user was created
   or deleted.

## Release gates and credential handling

4. **P1 — Failing checks piped through `tee` can appear green.**
   All three workflows omit an explicit shell. Examples are
   [ci.yml:62](/Users/user/Downloads/aitask-master/.github/workflows/ci.yml:62)
   and [ci.yml:119](/Users/user/Downloads/aitask-master/.github/workflows/ci.yml:119).
   GitHub's unspecified Linux shell uses `bash -e` without `pipefail`; the
   successful `tee` masks the preceding gate's failure. This affects bundle,
   database, fixture-seed and tagged anonymous security checks. A safe stub
   reproduction continued after `false | tee log` and returned zero; the explicit
   Bash shell with `pipefail` stopped with status 1. Set `defaults.run.shell: bash`
   in each workflow and verify deliberately failing gate stubs fail the job.
   [GitHub shell documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell).

5. **P1 — Hosted staging verification lacks deployment-protection access.**
   Read-only Vercel inspection confirms `aitask-staging` enables SSO protection.
   Its generated deployment `/build-info.json` returned 302, then a 200 HTML
   login page. The exact provenance verifier rejected the saved response as
   invalid JSON. Neither
   [verify-release-provenance.mjs:45](/Users/user/Downloads/aitask-master/scripts/verify-release-provenance.mjs:45)
   nor [playwright.staging.config.ts:13](/Users/user/Downloads/aitask-master/playwright.staging.config.ts:13)
   attaches accepted protection authentication. Configure authenticated CI access
   restricted to the deployment origin, preserving protection and keeping
   credentials out of Supabase requests.
   [Vercel automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

6. **P1 — Tagged authenticated QA omits its API configuration.**
   [release.yml:190](/Users/user/Downloads/aitask-master/.github/workflows/release.yml:190)
   does not pass `STAGING_SUPABASE_URL` or
   `STAGING_SUPABASE_PUBLISHABLE_KEY`, although the PR workflow does. Earlier
   step environments do not persist into this step. The unchanged `stagingApi`
   helper reproduced the missing-URL exception. Pass both values to tagged QA
   and validate the complete test configuration before deployment or seeding.

7. **P1 — Hosted failure traces preserve reusable QA credentials.**
   [playwright.staging.config.ts:17](/Users/user/Downloads/aitask-master/playwright.staging.config.ts:17)
   retains full traces on failure; both workflows upload `test-results`. Live
   GitHub metadata confirms the repository is public.
   A dummy-only trace preserved a fake password in action parameters and an Auth
   POST resource. Persistent QA secrets are reused when accounts are recreated,
   so cleanup does not remove this future exposure. Disable full tracing for
   secret-bearing hosted tests or verify comprehensive artifact sanitization.
   Keep non-secret diagnostics.
   [Fake-credential trace](/private/tmp/aitask-v3-staging-trace-audit.zip).
   No real credential was inspected or exposed by this audit.

8. **P2 — PR and tag jobs can delete each other's fixture.**
   [staging.yml:10](/Users/user/Downloads/aitask-master/.github/workflows/staging.yml:10)
   and [release.yml:11](/Users/user/Downloads/aitask-master/.github/workflows/release.yml:11)
   use different concurrency groups but reset and clean the same workspace and
   seven accounts. This conflict was confirmed from configuration; destructive
   concurrent hosted runs were not performed. Share a fixture lock with
   cancellation disabled, or isolate each run's accounts and workspace.

## Date and reporting accuracy

9. **P2 — Early-morning defaults can backdate new business records.**
   [CreateClientPlanModal.tsx:37](/Users/user/Downloads/aitask-master/src/components/CreateClientPlanModal.tsx:37)
   uses UTC for the start date but local time for billing day. Chrome at Jakarta
   8 October, 00:30 showed a 7 October start with billing day 8. The real cycle
   helper produced a one-day first cycle ending 7 October rather than the expected
   8 October–7 November period. Project start and add-on effective-date defaults
   share the UTC pattern. Use the existing local `getTodayInputDate` consistently.
   [Browser evidence](/private/tmp/aitask-v3-data-audit-20261008/browser-midnight-plan-reproductions.log).

10. **P2 — Calendar task bars create an invisible seventh day.**
    [calendarRanges.ts:141](/Users/user/Downloads/aitask-master/src/lib/calendarRanges.ts:141)
    clips a Monday-based week through Sunday, while the page renders Monday
    through Saturday. Unit assertions and Chrome geometry confirmed a Sunday-only
    task in CSS column 7 and a full-week bar spanning 7 columns. The implicit track
    compresses the visible tracks and misaligns task bars with date cells. Share
    the six-day boundary with the view and update the old Sunday-based tests.
    [Browser evidence](/private/tmp/aitask-v3-data-audit-20261008/browser-sunday-reproduction.log).

11. **P2 — Delivery tracker overdue totals remain stale across midnight.**
    [DeliveryTracker.tsx:121](/Users/user/Downloads/aitask-master/src/pages/DeliveryTracker.tsx:121)
    memoizes summaries without a day dependency and has no `useLocalToday`.
    Chrome kept `0 Overdue` for a task due 7 October after crossing into 8 October
    and dispatching focus. Pass the shared day hook into the summary builder and
    memo dependencies, preserving intentionally selected historical periods.
    [Browser evidence](/private/tmp/aitask-v3-data-audit-20261008/browser-midnight-plan-reproductions.log).

## Hosted configuration and health

- **Required release controls are unenforced.** GitHub's live `master` response
  reports `protected: false`, enforcement off and no required checks. The
  effective rules endpoint also returns an empty list. Configure
  reviewed PRs and the actual quality, database and authenticated staging check
  names before production merge.
  [Read-only branch evidence](/private/tmp/aitask-v3-master-20261008.json).
- **Two QA secrets are absent.** Repository secret-name inspection found
  `STAGING_QA_HOD_EMAIL` and `STAGING_QA_HOD_PASSWORD` missing. Both workflows
  require them and fail their preflight. No secret values were read. Supply the
  intended isolated QA account configuration.
- **Database patch review remains open.** Production reports PostgreSQL 17.6.
  Supabase announced a 17.11 rollout containing security fixes. The read-only
  checks found no affected ltree indexes, GiST float indexes or custom operators;
  no application pgcrypto encryption path was found. Review the managed upgrade
  and backup/maintenance plan before shipping. This audit did not establish
  exploitability or change the database version.
  [Supabase patch announcement](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
- **The known leaked-password protection warning remains open.** The latest
  security advisor still reports it disabled; the previously inspected
  organization is Free and the feature requires Pro or above. No upgrade or
  risk exception was authorized.
  [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The live migration tail matches the repository's approved alias map through
  `20261002164513_universal_notification_audience_guard`.
- Production aggregate checks found no orphan task/project, client, service-cycle
  or deliverable references and no invalid values in the six surveyed operating
  date fields. Four application cron jobs are active with zero recorded
  failures in the preceding 24 hours. These aggregates do not prove every
  business record is correct.
- Production anonymous RPC, secure-table and retired snapshot/helper denial
  checks passed. Security advisors show the documented seven deny-by-default
  table notices and eighteen intentionally authenticated definer RPC notices,
  plus the open password warning. Performance advisors show four unused-index
  informational notices; removing those indexes is not warranted by this audit.
- The Supabase connector could not inspect the staging project because its
  current access was denied. Authenticated hosted staging was not run.
  Production deployment metadata identifies an older commit, not this v3
  candidate.

## Verification and next steps

- Fresh candidate unit suite: **486 tests across 69 files passed**.
- TypeScript, source ESLint and strict translations passed. Only the generated
  temporary Vite cache was excluded from isolated lint.
- Production build, bundle caps and static PWA output passed. Eager JavaScript
  remains close to its unchanged 300 KiB gzip limit.
- Current production dependency audit reports no known vulnerabilities.
- Focused session/recovery/permission tests: **93 tests across 9 files passed**;
  these overlap the full suite and are not added to its count.
- The new regression harnesses deliberately expose defects in current source:
  three expected-behavior unit assertions and three Chrome scenarios fail; the
  store and Edge-handler bug demonstrations confirm the harmful branches.
  These are separate from the existing regression suite.
- A fresh complete standard browser run passed **all 172 cases in one run**
  with no retries in 13.3 minutes. Log:
  `/private/tmp/aitask-v3-prelive-browser-20261008.log`. The new failure probes
  above are outside that existing suite, explaining why it can remain green.
- The 7 October remediation already verified 563 database tests and three PWA
  browser cases on these same implementation changes. They were not rerun as
  fresh results in this audit. Hosted policy state still needs its own evidence.

Fix save/onboarding recovery and the release gates first, then date/reporting
regressions. Configure branch enforcement, staging access and QA identities.
After reviewing those changes, run the new regressions, complete local gates and
authenticated isolated staging against the exact release commit. Merge, tag and
verify production provenance only after that evidence is green.

Additional provider-dependent member deletion behavior when a user owns Storage
objects was identified for integration follow-up, but was not reproduced and is
not counted as a confirmed defect above.
