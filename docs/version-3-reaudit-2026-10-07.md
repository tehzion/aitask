# AiTask version 3.0.0 re-audit — 7 October 2026

Audited release commit: `206eec984c6fd08baa40d0f353fda277c431757d`.
Source version: **3.0.0**. Package: `AiTask-v3.0.0-206eec9.zip`.
This is an audit of the committed release candidate, excluding the other
uncommitted permission, company and store changes in the shared workspace.

## Result

The compiled package is internally consistent, but version 3 is not ready to
pass the complete release gate. Two Calendar data inconsistencies were reproduced,
six committed browser cases have stale expectations or fixtures, the saved Staff
mobile baseline is stale, an intermittent keyboard check needs stabilization, and the startup
bundle remains over budget. Deployment documentation also conflicts with the
workflow. An existing Auth security warning remains unresolved.

## Findings

| Priority | Finding | Evidence | Recommended correction |
| --- | --- | --- | --- |
| P1 | Complete browser gate is red: 8 failures in 169 cases. | Six cases have old light/dark colour, Staff labels or Chinese cycle/progress expectations. One Staff screenshot differs from the saved baseline by 7% in both bundled Chromium and installed Chrome. A Boss keyboard-tab failure passes on unchanged replay. | Align six semantic/fixture assertions with the current interface, review and regenerate outdated pixel references, investigate the keyboard timing failure, then rerun the complete suite. |
| P1 | Startup JavaScript exceeds the release cap. | The final packaged eager graph is **307,242 bytes gzip** versus a **307,200-byte cap**: **42 bytes over**. Initial index and report-chart chunk budgets pass. | Reduce shipped eager code with meaningful headroom, retaining the cap. Rebuild at the final commit and rerun bundle/PWA checks. |
| P2 | Impossible date-only deadlines are silently shifted by Calendar. | `parseDateOnlyLocal('2026-02-31')` produces 3 March. Calendar counts the task as overdue and gives its range that new end date; `parseOptionalDate` rejects the same value and the dashboard overdue helper excludes it. | Use validated ISO local-date parsing rather than a rolling numeric Date constructor. Cover impossible days/months, leap years, valid dates and range/filter/label parity. |
| P2 | Calendar date-dependent filters remain stale across midnight. | A frozen-clock browser probe changes the local day from 7 to 8 October. Due today remains 1 until another render; toggling holidays updates the count to 2 but the selected filter still shows yesterday’s one task. Independent recomputation returns the two tasks due on 8 October. | Subscribe Calendar to the shared local-day hook and pass its value to overview and filtering calculations, including the filter memo dependencies. Verify midnight and suspended-tab resume without changing the selected calendar period. |
| P2 | Deployment instructions contradict the release workflow. | README says production promotion is tag-only. The release workflow waits for an automatic master deployment, and the staging setup says reviewed master changes deploy automatically. | Align README with the actual reviewed-merge, automatic-deployment and tag-verification process; confirm hosted settings before publishing operational instructions. |
| P2 | Leaked-password protection remains disabled. | Live Supabase security advisor reports `auth_leaked_password_protection`. The existing production manifest already records it; it is not introduced by version 3. | Resolve the Auth setting through the applicable plan/settings, or record an explicit reviewed exception and compensating control under the existing security review policy. |

Code and test references:

- [Date parser](../src/lib/utils.ts), [Calendar metrics](../src/lib/calendarMetrics.ts), [Calendar ranges](../src/lib/calendarRanges.ts), [Calendar page](../src/pages/Calendar.tsx), [dashboard overdue predicate](../src/lib/taskReporting.ts).
- [Accessibility test](../e2e/accessibility.spec.ts), [application smoke test](../e2e/app-smoke.spec.ts), [Chinese portal test](../e2e/i18n.spec.ts), [theme route test](../e2e/calm-ui.spec.ts), [Staff visual tests](../e2e/staff-workspace-v2.spec.ts), [keyboard test](../e2e/role-ux-stabilization.spec.ts), [canvas token](../src/index.css).
- [README deployment claim](../README.md), [tagged workflow](../.github/workflows/release.yml), [staging release setup](staging-release-setup.md).
- [Auth warning remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [security review policy](supabase-security-advisor-allowlist.md).

## Package and source verification

- SHA-256 checksum and ZIP integrity passed.
- Every packaged source file matches the exact release commit byte-for-byte; the package has exactly that commit's tracked source inventory.
- The 292 pre-preparation commits are listed exactly once, with no missing hashes. The subsequent version-preparation commit is explicitly outside that inventory.
- Package version, changelog and client-note headings agree on 3.0.0; compiled provenance identifies the exact release commit.
- The production project and publishable key match tracked production configuration. Demo login and password-reset bypass are disabled.
- No complete Supabase secret-key or OpenAI secret-key patterns were found in packaged source or compiled assets. The Supabase SDK's literal key-prefix validation is not an embedded secret.
- Current production dependency audit found no known vulnerabilities.
- The candidate's prior source checks passed all 479 unit tests across 69 files, TypeScript, full ESLint and strict translations. No application source has changed since those checks.

## Browser and diagnostic evidence

All **169 committed standard browser cases were exercised** in two sequential
runs against the isolated snapshot:

- First run: 108 passed, 5 failed and 56 not run after its configured failure limit.
- Continuation: the remaining 56 cases yielded 53 passed and 3 failed.
- Combined: **161 passed and 8 failed**, with none left unrun. The first run's
  additional runner error only records the configured early-stop condition.
- Failures: accessibility canvas expectation; application smoke Staff label;
  calm-theme canvas expectation; Chinese portal fixture/progress expectation;
  Boss keyboard tabs; Staff desktop label; Staff mobile screenshot; Staff Chinese label.

The standard suite used bundled Chromium. The Staff mobile screenshot failure
was also replayed with installed Chrome and still differed by **21,394 pixels
(7%)**. Visual inspection shows intentional interface changes absent from the
old reference: warm canvas colour, the attention label and explicit assignee.
This is evidence to review/update the baseline; this audit does not automatically
accept a new baseline or claim that every screenshot has been reviewed.

All **three PWA browser tests passed**: offline login shell, first-time offline
Reports deep link, and real service-worker replacement preserving a dirty form.

Temporary diagnostic copies of the accessibility and application smoke tests
passed after updating only their obsolete design/Staff-queue expectations.
The calm route/theme/overflow/accessibility diagnostic also passed with current
colours and pixel comparisons excluded from that semantic diagnostic.
The Boss keyboard-tab scenario passed on unchanged replay; its intermittent
root cause is not established and the initial failure remains in the result.
The Chinese portal diagnostic needed both a clock within its August cycle and
the current translated `0/1` progress format. Diagnostic changes do not make
the committed suite green and are not included in the release package.

A separate one-test diagnostic reproduced the malformed-date discrepancy by
asserting the observed behavior: Calendar overdue = 1, no-due-date = 0,
dashboard overdue = false, and range end = 2026-03-03 for a 2026-02-31 deadline.
This confirms the bug; it is not a regression test of a corrected implementation.

The midnight Calendar browser diagnostic likewise passed by asserting the
observed incorrect count/filter behavior described in the findings. Neither
diagnostic changes application code or supplies a fix.

## Live backend checks and remaining gates

Read-only production migration inspection confirmed the recorded tail through
`20261002164513_universal_notification_audience_guard`; the checked-in alignment
verifier also passed its connector-alias mapping.

Anonymous verification passed for protected command/capability RPCs, secure
workspace tables, retired helpers and the legacy state table. Live catalog
queries found no public AiTask SECURITY DEFINER function with anonymous execution
or an unsafe search path; no public AiTask table with disabled RLS or unintended
browser access to a deny-by-default table; and no public AiTask storage bucket.
These are specific grant/configuration checks, not a complete proof of all
function-body authorization paths or authenticated role behavior.

The advisor returned seven informational deny-by-default RLS findings and 18
warnings for authenticated SECURITY DEFINER RPCs. Their categories are already
reviewed in the security allowlist; the catalog checks above confirm the expected
anonymous/search-path/table boundaries. The separate leaked-password warning
remains actionable as described above.

The disposable migration/pgTAP/Auth/REST/Storage gate could not run because the
local Docker daemon is not running. Hosted authenticated staging and production
role rendering were not exercised. No production records or settings were
changed. No application fix, Git commit, push, tag or deployment was performed
by this re-audit; only this audit report was added to the shared repository.

## Evidence retained locally

The re-audit evidence archive contains standard-suite and continuation logs,
PWA and dependency logs, anonymous-security output, diagnostic test sources,
selected screenshot references/actuals and the original package release evidence.
It is separate from the compiled version 3 package, whose checksum remains valid.

[Download re-audit evidence](/private/tmp/AiTask-v3.0.0-reaudit-evidence.zip).

## Subsequent authorized corrections

The user authorized fixes after this audit. Calendar date validation/refresh,
deferred navigation focus, browser expectations and visual references, bundle
chunking and release instructions have been corrected locally. The disposable
Docker database gate now passes. The Free-plan Auth limitation remains open.
See [remediation and updated verification](version-3-remediation-2026-10-07.md).
The original findings/results above remain the audit history of `206eec9`.
