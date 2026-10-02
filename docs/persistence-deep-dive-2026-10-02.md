# Save, session and concurrent-edit audit — 2 October 2026

Six additional defects were reproduced and corrected locally. This work does not add assignment approvals or change Mabel's delegation allowance. Production business records were not modified during this audit.

## Corrections

| Finding | Correction and evidence |
| --- | --- |
| A workspace-conflict retry loaded fresh rows and rebuilt the pending write against their new versions, bypassing the original row conflict. | Refresh only the workspace revision and retry the retained command with its original row versions. A newer task row now produces a record conflict rather than an automatic overwrite. Limit automatic workspace retry to one attempt. The regression previously returned success and now preserves the conflict and pending change. |
| A newer service-plan revision arriving during save could become the baseline for text typed during that save. A subsequent save could overwrite newer fields without reconciliation. | Keep the submitted draft as the baseline for subsequent typing. If canonical fields changed, require the existing conflict choices. The browser regression verifies that local typing survives, saving remains blocked, and reconciliation preserves the remote tax change. |
| Delayed retry continuations could resume after logout/account switching, report success, or refresh a different account. | Check the session generation after waiting, compatibility checks, member/workspace writes and refreshes. Guard queued synchronization and grouped saves against obsolete sessions. Two failing retry regressions now pass. |
| An expired-token refresh could stall indefinitely even though ordinary save requests had timeouts. | Apply the existing bounded request timeout to refresh. Retain the original command and idempotency key for retry. A simulated stalled refresh previously never settled; it now returns a recoverable failure. |
| A populated upload registry ignored another tab's submission and acknowledgement. Aggregate persistence could rewrite stale command ownership. | Refresh individual durable records on registry operations; persist only changed files. Observe acknowledged removals without resurrecting stale entries. Preserve in-memory/tab fallback when durable storage is unavailable. The two-tab browser regression previously saw an undefined command owner and now sees the current owner and removal. |
| A delayed private download could trigger after the originating account had signed out. | Check its original session before initiating the browser download. The regression verifies that no download is triggered after invalidation. This was a client response race, not a server authorization bypass. |

The existing uncertain-save and attachment protections were also exercised: lost confirmation after server commit, reference protection, cross-account denial, discard fencing, interrupted cleanup and retry. Concurrent Staff-audit changes in the workspace were preserved. The new authenticated action harness needed its account-switch fixture cleared before loading a fresh baseline; that fixture correction is included.

## Validation

- Unit suite: **62 files, 400 tests passed**.
- Database suite: **38 files, 544 checks passed** in a disposable local stack.
- Real local Auth/REST/Storage checks passed, including frontend action persistence, reload and lost-confirmation retry.
- Browser audit suite: **14 tests passed**; the two new draft/upload cases were repeated after the final guards.
- TypeScript, lint, strict translation coverage, build, bundle and static PWA checks passed. Eager JavaScript remains within the unchanged 300 KiB gzip cap.

These are local and isolated-stack results. They do not establish hosted staging or production browser behavior.

## Release status

Read-only production inspection confirmed that `aitask_reconcile_service_upload` and `aitask_guard_abandoned_service_refs` are absent. The release alignment check fails closed on these three pending repository migrations:

1. `20260928140058_server_reminders_and_feedback_rate_limit`
2. `20260930111033_service_upload_reconciliation`
3. `20260930154013_initialize_deadline_reminder_claim`

Production still serves commit `4f5a23f11eb07a1559ba5d52a65fdb54d69542ca`; the last local commit before this work is `b9c5daa0d606f864fc695c901c48bb27c42b41f5`. The production provenance check correctly reports that mismatch.

Hosted staging project `dyaxtloducpgjoxuaszk` returned a connector permission error. Restore staging access, run the hosted authenticated/Storage checks, verify and apply the ordered pending production migrations, then release through the existing reviewed staging-first workflow. Preserve the deployed HOD migration aliases; do not repair or replay their timestamps. The release guards were not suppressed, and this audit made no production schema or application deployment changes.
