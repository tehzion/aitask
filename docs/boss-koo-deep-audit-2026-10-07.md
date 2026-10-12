# Boss Koo administration audit — 7 October 2026

This audit reviewed the current workspace, including the earlier company fixes and existing Staff work. It traced registration review, bulk decisions, temporary passwords, custom-role persistence, member role assignment, company actions, task authorization, service editing and recovery. Reproductions use synthetic local records and injected persistence responses. No production business records were changed.

## Confirmed issues and fixes

| Priority | Issue | Before | After |
| --- | --- | --- | --- |
| P1, local backend | Bulk approval assigns a different role from its confirmation | The confirmation says Staff, but the local handler uses the applicant's requested role, including Project Manager. A Client applicant can also become a Client without a company. | Both backend branches approve as Staff. Applicants without a valid staff department stay pending for individual review. |
| P2 | Generated temporary passwords fail the app's policy | The generator draws nine bytes although legacy approvals require at least twelve characters. It uses modulo 55 against a 54-character alphabet, so some bytes contribute no character. | Generate sixteen characters using the actual alphabet length and rejection sampling. Unit checks cover the policy and the old invalid remainder. |
| P2 | Restored registration reviews initialize the wrong access | Opening a Client registration URL or reloading starts the form with Staff and empty departments. | URL-based restoration uses the same requested role and department initialization as opening from the queue. |
| P2 | Failed approval loses its review | Optimistic approval removes the applicant from the pending list, triggering the URL-selection effect to close the review before persistence resolves. A rejection restores the row but loses its selected review and inline error. | Keep the selected review through submission. Failure restores the data while preserving the review, form and error. Close controls are disabled during saving. |
| P2, local backend | Bulk approval reports skipped applicants as approved | The handler ignores individual store results and announces the batch size even when a duplicate or invalid applicant stays pending. Unknown departments silently become Designer. | Count individual results, persist successful changes, report partial failures accurately, and retain failed selections. Unknown departments require individual review. |
| P2 | Role edits and repeat submissions remain available during saving | While a role commit is delayed, the form accepts further edits or another submission. Completion resets the form and loses intervening edits. | Disable the role editor and competing role controls during saving, show saving feedback, and guard the submission handler. |
| P2 | Failed role creation cannot be retried cleanly | The optimistic role already exists. Submitting Create Role again hits the duplicate-name validator instead of retrying persistence. | Keep the failed submission pending and provide Retry save. Retry commits the existing local change or uses the secure mutation retry API, without recreating the role. |
| P2 | Failed Client role assignment discards its company choice | The assignment handler closes the company selector and clears its value even when the member-role action returns an error. | Keep the selected member and company until the action succeeds, allowing correction or retry. |
| P2 | Mobile registration labels target hidden desktop inputs | The hidden desktop review and visible mobile sheet both render with the same input IDs. On mobile, Client company resolves to a hidden input rather than the visible field. | Render the desktop review only in the desktop viewport, leaving one review and one set of associated field IDs. |

The implementation is confined to `src/pages/Approvals.tsx` and the new temporary-password helper. It uses existing store and secure retry APIs; it adds no migration or Edge Function change. Existing unrelated workspace edits were preserved.

## Verification

- New browser regressions: `e2e/boss-admin-recovery.spec.ts`, covering restored reviews and failed approval on desktop/mobile, bulk role/count behavior, delayed role saves, role-creation retry, and failed company assignment.
- Password checks: `src/lib/temporaryPassword.test.ts`.
- Full unit suite: **425 tests passed across 63 files**.
- TypeScript, scoped ESLint, translation coverage and production build: **passed**.
- Browser verification: **48 distinct workflow checks passed** across the broad run and targeted replay. The broad run passed 45 checks and exposed the two mobile review failures plus an intermittent task Escape/logout timeout. After fixing the duplicate mobile review, all 15 approval/admin/task checks passed on replay.
- The strengthened partial-approval case uses a valid Staff department and a duplicate member, so it exercises a failed store action rather than only department prevalidation. Its final bundled-Chromium run passed. Two Chrome attempts timed out, first while checking an expiring toast and then while waiting for a checkbox to stabilize; the fixture now captures the emitted message while retaining normal toast rendering.

## Limits

Browser failures were simulated locally. This verifies frontend recovery and local store outcomes, rather than authenticated production Edge Function or RLS behavior. The password requirement was checked against the existing approval form and store validation. No database, deployment, API key, or user account was changed.

The initial regression run reproduced the wrong restored role, vanished approval review, misleading bulk results, bulk Client assignment, editable role-save form, and missing role retry. The original Client-assignment browser selector needed correction before that case could run; its failure behavior was established by the handler and the subsequent test. A later fixture hit an execution-context navigation race during setup, before any role action; waiting for the login input stabilized initialization.

One existing task-authorization check timed out after Escape because the task dialog remained open. The full task-authorization replay passed without task-code changes from this audit. Its root cause remains unverified; it should be treated as intermittent rather than counted as a confirmed task fix.
