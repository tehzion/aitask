# Version 3 re-audit remediation — 7 October 2026

The local candidate keeps version **3.0.0** and applies corrections on top of
release-preparation commit `206eec9`. Changes are not committed or deployed.
The candidate excludes the separate permission, company and store edits already
present in the shared workspace.

## Corrections

- Date-only deadlines now use validated ISO parsing in local time. Impossible days
  and months remain undated instead of rolling forward; leap days and years below
  100 are covered. Calendar ranges, counters, filters and due labels agree with
  the dashboard overdue rule on invalid dates.
- Calendar subscribes to the shared local-day hook. Its overview, selected filter
  and day summary use the same day value. Midnight and resumed tabs refresh the
  task set without changing the selected calendar period.
- Deferred navigation focus no longer steals a control the user has already
  selected inside the new page. A delayed-frame regression fails against the
  original source and passes after the guard. The original Boss/Staff keyboard
  scenario and the delayed-frame regression each passed five repeated runs.
- Browser expectations reflect the current light/dark canvas, Staff queue and
  unavailable-dependency behavior. The Chinese portal clock is pinned inside its
  published cycle and checks the current translated progress format. Existing
  task actions, privacy, authored text, overflow and accessibility checks remain.
- Reviewed Chrome visual references were refreshed for the current interface.
  Visual-only scenarios request reduced motion and apply a test-only stylesheet
  through Playwright’s supported `stylePath` option, so references capture the
  completed page-entry position. The stylesheet is not shipped in the application. Pixel tolerances
  were not widened. Other browser cases continue exercising ordinary motion.
- Startup state and localization share a chunk because both are always loaded.
  This removes one eager request and reduces compression overhead. The unchanged
  300 KiB cap now passes: **306,727 bytes gzip**, with **473 bytes headroom**.
  Initial index and report-chart budgets also pass.
- README now describes staging-first review, automatic production deployment of
  approved master changes and subsequent matching-tag verification, consistent
  with the checked-in workflow and staging setup.

## Verification

- **486 unit tests across 69 files passed**, including seven new date regressions.
- TypeScript, full source ESLint and strict translations passed. The copied
  workspace's generated Vite dependency cache was excluded from ESLint; no
  application source was excluded.
- Production build, bundle budgets and static PWA contracts passed.
- All **three PWA browser checks passed** with the updated source/chunking:
  installation/offline shell, first-time offline Reports and service-worker
  replacement preserving dirty work.
- Started the installed local Docker engine and ran the existing disposable
  Supabase rollout gate. **563 database tests across 40 files passed**, alongside
  migration replay, authorization checks, Auth/REST/Storage reconciliation,
  frontend action persistence, lost-confirmation retry and postflight checks.
  The script stopped and removed its temporary validation setup; production was
  not used for writes.
- **All 175 distinct browser flows were verified**: 172 standard cases plus
  three PWA cases. The complete standard run passed 171 cases and exposed the
  remaining reference-timing case; after its final correction, that last route/
  theme/Chinese/accessibility scenario passed twice without reference updates.
  These are combined scenario results, not a claim of a single untouched green
  172-case run.
- Staff visual scenarios passed twice in normal comparison mode. The final
  Calendar midnight/resume regressions also passed again after their test cleanup.
- Root workspace TypeScript and full ESLint passed; whitespace checks are clean.
- Each packaged implementation and test file matches the verified isolated
  candidate byte-for-byte. Unrelated shared-workspace source was excluded.

The first complete browser rerun exposed a two-pixel Settings entry-animation
frame difference against its generated reference. The visual scenarios were
stabilized with a test-only settled-entry stylesheet and references regenerated.
The demo-login helper now waits for navigation before handling account setup. The remaining source
and semantic tests were preserved; this timing failure is recorded rather than
counted as a passing original run.

## Hosting limits

The configured Supabase organization reports **Free**. Official documentation
makes leaked-password protection available on **Pro and above**:
[password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
No plan upgrade or hosting risk exception is authorized by this code-fix request.
The warning remains open in the security review document; it has not been silently
allowlisted or represented as fixed. Enabling the feature requires the project
owner to provision the required plan and then enable/verify the Auth setting.

The local database gate is now complete. Authenticated hosted staging verification
and production deployment/role rendering remain outside this local correction.
Existing read-only production grant and migration checks are recorded in the
[re-audit](version-3-reaudit-2026-10-07.md).

## Candidate packaging

The rebuilt local package contains baseline committed source plus only these
corrections, reviewed visual references, reports, a binary source patch and
verification evidence. It excludes unrelated uncommitted source and environment
secrets. Its application build identifier is marked `.dev` because these fixes
are not yet committed. Build-info's Git SHA identifies the baseline; the package
records hashes of the actual candidate source to distinguish the corrected code.
The original compiled package remains a historical artifact of `206eec9`.

[Corrected local version 3 package](/private/tmp/AiTask-v3.0.0-fixed-local.zip).
The leaked-password setting still requires the Pro hosting entitlement and hosted
staging remains unverified. Neither limitation was marked fixed by local tests.
