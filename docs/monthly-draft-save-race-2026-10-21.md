# Monthly draft save / background refresh race

## Evidence

The reported screenshot is the `DraftServicePlanEditor` footer: an enabled
Save draft button, disabled Review changes, retained unsaved changes and
"The change has not been saved yet."

A regression test reproduced that exact result with `isPulling: true`:
`commitPendingMutation('client_plan.manage')` returned immediately without
calling `saveSecureWorkspace`. The lower-level sync intentionally skips work
while a refresh or save is running, but the confirmation caller did not wait.
This is distinct from the previously fixed refresh query timeout.

The revision-only refresh path also incorrectly labelled a local edit arriving
during its request as `retry_required`, even though no write had failed.

## Changes

- Wait for in-flight synchronization before confirming a staged mutation.
  Preserve its typed command while waiting and recheck the session afterwards.
- If the bounded wait expires, keep the local change and return an explicit
  retryable busy result. Do not report successful persistence before an ACK.
- Wait for queued follow-on writes before reporting the workspace confirmed.
- Keep an edit arriving during the revision check in `saving`, not a fabricated
  failed-save state. Genuine RPC failures still retain their retry/conflict state.
- If a full refresh is superseded by a local mutation, leave both the local
  state and the command baseline untouched. Original row versions must still
  detect concurrent changes; an abandoned refresh must not rebase stale rows.
- Offer Retry saved change for pending plan submissions even if the global
  backend is not in a failure state. Reserve Review service fields for field
  validation errors rather than synchronization errors.

No database migration, RLS change, historical rewrite, or production business
data change is needed. Existing idempotent service commands remain unchanged.

## Verification scope

Tests cover the reproduced race, revision-check interleaving, bounded waiting,
retry, two confirmation callers sharing a single write, and preservation of
original row versions. The service command integration test checks the draft
scope plus the separate pricing snapshot in the RPC payload. Browser tests
exercise the exact editor, RM9,180 pricing retention, disabled review before
confirmation, retry without a second local mutation, and English/Chinese
contract-date flows. RPC responses in these automated tests are mocked; they
are not a claim of a live authenticated customer save.

The screenshot alone does not establish which account, company, time or
interleaving occurred in production. Those details are needed to correlate
the customer's incident; the reproduced code defect is independently verified.

## Local release checks

- `pnpm check`, `pnpm lint`, `pnpm verify:i18n`, `pnpm test` (117 files,
  898 tests), and `pnpm build`: passed.
- Targeted editor browser suite: 11 passed, including the retained RM9,180
  submission, recovery/conflict flows and English/Chinese date handling.
- Production dependency audit: no known vulnerabilities. Public Supabase
  authorization/cutover probes: passed. Migration-file integrity (120 files),
  recorded production migration alignment and PWA output checks: passed.
- Extra bundle-budget check: failed its 300 KiB eager-gzip limit at 305.4 KiB.
  A read-only measurement of the currently served production build found the
  same four-chunk graph at 305.845 KiB, so this is a pre-existing performance
  gate failure, not a regression introduced by this hotfix. The budget was not
  raised and no unrelated bundling refactor was included. This hotfix must not
  be described as passing every repository release gate.
