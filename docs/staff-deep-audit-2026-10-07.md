# Staff deep audit and fixes — 7 October 2026

## Scope

Follow-up to the 6 October Staff save-recovery release. Traced Staff scheduling from Calendar date controls through `updateTask` and the `task.update` commit/retry API, and Full edit task details through submission, acknowledgement and retry. Reviewed the task/comment/file session guards and deployed task/service authorization.

Six initial browser regressions failed before implementation. All six passed after the first fixes. Additional recovery cases were added to cover successful retry, discarded commands, reload failures and desktop/mobile discard confirmation.

## Confirmed problems and corrections

| Problem | Correction |
|---|---|
| Calendar date drafts were absent from the unsaved-work registry. Escape and Cancel could silently discard them. | Register draft/saving/pending work and ask before discarding an unsent date range. Open task navigation respects the same guard. |
| Date controls remained editable while an earlier range was saving. Completion could close the editor and hide later input. | Lock dates, clear-date controls and task navigation during save; reject another concurrent Calendar save. |
| Calendar commit, retry and reload promise exceptions could leave saving controls stuck. | Catch failures, retain the attempted range and release controls in guarded `finally` blocks. |
| A late failed Calendar save overwrote newer pulled dates, including after session invalidation. | Bind the operation to its actor/session/generation; restore only the matching optimistic date revision. Ignore stale completions. |
| Full edit closed its details form after an earlier save even when Staff had entered a newer title or details. | Retain submitted and canonical field snapshots. Acknowledge the submitted revision and preserve newer editable fields. |
| Full edit detail saves used an unguarded async path, and Cancel Edit could hide a dirty draft. | Use the guarded commit/retry path; protect cancellation and restore the confirmed edit baseline after an explicit discard. |

Recovery verification also exposed a native form default-action edge case: when the Retry button changed into Save during the click, the browser could submit again. Retry/reload clicks now prevent that default action. Calendar and Full edit also check whether the retained command actually applied before treating the draft as acknowledged.

## Supabase checks

Read-only production checks, performed in transactions followed by rollback:

- Four ordinary Staff accounts × 185 tasks = **740 account/task combinations**: zero view-scope or edit-scope mismatches.
- Four ordinary Staff accounts × 83 companies = **332 account/company combinations**: zero service-access mismatches.
- Zero effective grants of global task editing, member administration or registration approval for these accounts. HOD accounts were excluded using the deployed HOD helper.
- The service-file bucket is private, with a 104,857,600-byte limit and PDF/JPEG/PNG/WebP/GIF MIME restrictions. Its read, insert, update and delete policies check workspace/service context; owner checks protect replacement/deletion.
- All public `aitask_*` tables have RLS enabled.

These are deployed-helper, policy and metadata checks. They do not constitute an authenticated production Staff browser session or a new real Storage upload. No production business records, permissions or files were changed. No database migration or Edge Function deployment is required.

## Verification

- **423 unit tests passed across 62 files.** The final run used one worker and a 30-second harness timeout; password-hashing settings and all assertions were retained.
- **56 browser scenarios passed in the final combined run**, including **13 new Staff regressions**. Coverage includes desktop/mobile date discard guards, save locking, commit/retry/reload exceptions, newer pulled records, invalidated sessions, newer Full edit drafts, discarded commands, existing comment/file recovery, Chinese/dark mode, accessibility and role authorization.
- TypeScript, scoped ESLint, translation coverage (zero findings across 124 source files), production/PWA build and release/database migration alignment passed.
- The tested snapshot used committed baseline `fdb5ec3` plus the Staff source changes. SHA-256 comparisons confirmed the four changed source/test files matched the workspace before commit.

The new cases are in `e2e/staff-deep-recovery.spec.ts`; original reproduction outcomes are preserved in `docs/staff-deep-audit-evidence-2026-10-07.json`.

Earlier combined runs encountered timing failures and a shared Vite dependency cache through the snapshot's dependency symlink. The final browser run used its own cache and passed all 56 scenarios. The final unit run passed all 423 tests after restricting workers. No test assertions were skipped or removed.

Verification uses a disposable snapshot to keep concurrent workspace changes from triggering browser reloads. Other ongoing workspace work is preserved.
