# Deep audit implementation — 2026-09-30

## Implemented behavior

- Authentication, workspace loads and synchronization share a session generation. Logout and account changes cancel obsolete work, clear private workspace state and cannot restore the previous member. Login restarts automatic synchronization. Mutations become pending independently of subscriptions; acknowledgements identify the submitted command, and retries retain its idempotency key.
- Service-plan drafts track their baseline and changes made during saving. Incoming revisions offer Reload latest or Keep my draft. Keeping a draft performs a three-way merge by service-item ID and field; overlapping changes require explicit Use my value / Use latest value choices before saving. Successful acknowledgement resets the baseline without losing newer typing.
- A shared dirty registry protects router navigation, form dismissal, unload, chunk recovery and PWA updates. Path changes and task-detail query changes are blocked while dirty; harmless filter changes remain available. Profile names, button-driven form choices, attachments and pending saves participate. Unchanged task details no longer produce a false dirty warning.
- Main creation forms and service-plan drafts support account/tab-scoped recovery in browser storage with a 24-hour read expiry. Recovery is explicit, and restored service-plan revisions require reconciliation. Logout/account switch clears that account's recovery. Passwords and file contents are excluded. This is not universal autosave for every edit form.
- Upload tracking is durable and scoped by uploader and submitted command. Only acknowledged files are cleared. Discard retrieves canonical state first and limits cleanup to the discarded command. Settings provides status reconciliation and explicit discard/retry for retained uploads.
- The new reconciliation RPC checks uploader ownership, client scope, command receipts and canonical attachment references. A discarded command receives a persistent rejection receipt, and abandoned file paths cannot be referenced by subsequent commands. Storage deletion requires an abandoned, unreferenced, uploader-owned path. Missing RPCs and failed cleanup retain tracking; no broader storage access is granted.
- Notification pages and read actions reject obsolete query/account responses. Late workflow generation preserves historical cycle starts and original deadlines, with generation metadata explaining overdue tasks. Billing-day changes preview transition dates while preserving existing boundaries.
- Cmd/Ctrl+K opens the palette. Plain-letter shortcuts exclude modifiers, composition, editable fields and dialogs. Role-aware palette navigation includes Tasks and Notifications, directs member management to the members view, announces active results and scrolls keyboard selection. Unknown routes have localized recovery.
- Report and feedback exports share UTF-8/BOM CSV serialization and formula-prefix protection. Report assignees use member names with explicit unavailable/unassigned fallbacks.
- Workspace reads have per-request cancellation/timeouts and a 90-second whole-load deadline. Revision changes trigger at most two consistent-snapshot retries before a recoverable failure. Obsolete requests cannot change canonical baselines.
- Settings exposes a bounded, local-only timing/error diagnostic export without account IDs, form contents or uploaded paths. It records startup, long tasks, route commits and synchronization outcomes; route timings measure router commit, not full lazy-route content readiness.
- The bundle gate measures the complete Vite static import graph alongside existing chunk budgets. Secure production builds omit local demo fixtures. The 300 KiB gzip eager-JavaScript cap remains unchanged.
- Database verification exposed an uninitialized first-task reminder counter. A follow-up migration initializes it per task, and the test fixture now explicitly assigns the intended recipient rather than assuming unrelated staff receive reminders.

## Compatibility and migration order

Public routes and role names remain unchanged. Optional `workflowGeneratedAt` metadata preserves old task compatibility. Existing delegation implementation and migration are preserved and included in local authorization verification.

New migrations:

1. `20260930111033_service_upload_reconciliation`
2. `20260930154013_initialize_deadline_reminder_claim`

Apply the reconciliation migration before releasing attachment cleanup. Older databases fail closed, retaining unresolved uploads. Preserve abandonment receipts/tombstones during application rollback. See [staging release setup](staging-release-setup.md).

## Verification evidence

- Unit suite: **59 files, 368 tests passed**, including session races, acknowledgements, draft merging/recovery, upload integrity, formula prefixes, dirty updates and paged snapshot cancellation/consistency/deadlines.
- Audit/workflow browser gate: **18 passed**, covering drafts, edits during save, notification filter races, independent two-tab recovery, logout/login, shortcuts, recovery routes, client creation and task authorization.
- Final responsive/accessibility/upload gate: **7 passed**, spanning the role/route matrix, narrow and rotated layouts, Chinese/dark mode/reduced motion, permission copy and upload retry state. The first expanded run was interrupted after its first passing test; the complete rerun passed with video recording disabled.
- Production-mode PWA gate: **3 passed**, including an actual service-worker replacement in a hidden tab with a dirty profile form. Draft content survives; refresh becomes available after an acknowledged save.
- Disposable Supabase rollout: **36 test files, 483 checks passed**; database lint, security advisors and postflight checks passed. Delegation checks use authenticated public commands for allowed and denied assignments.
- Real local Auth/REST/Storage integration passed: commit with lost acknowledgement retains its referenced file, another account cannot abandon it, discarded commands cannot replay, and interrupted deletion can safely retry. The harness refuses hosted endpoints and non-validation containers and removes its disposable stack.
- LibreOffice imported actual application CSV exports with formula-leading values as text and preserved quotes, multiline cells and Unicode. Excel is not installed and remains unverified; this is not a claim about every spreadsheet importer.
- TypeScript, ESLint, strict translation coverage, theme coverage and whitespace checks passed. Final secure production build and static PWA checks passed. Eager JavaScript totals **1,015.6 KiB raw / 298.1 KiB gzip** across six static chunks, below the unchanged 300 KiB gzip cap. Chunk budgets passed.

## Startup baseline

Production-mode **local demo** build, Chrome, service workers blocked; two samples per profile. Mobile emulation uses 390×844, 4× CPU slowdown, 150 ms latency and 1.6 Mbps download. The large workspace contains 5,000 synthetic tasks persisted locally. Browser verification ran concurrently, so these are diagnostic samples rather than controlled benchmarks.

| Profile | Login FCP | Login → dashboard heading | 5,000-task reload → dashboard heading | Large-workspace long tasks, cumulative |
|---|---:|---:|---:|---:|
| Desktop 1 | 400 ms | 1,515 ms | 618 ms | 287 ms |
| Desktop 2 | 184 ms | 746 ms | 761 ms | 400 ms |
| Slow mobile 1 | 2,340 ms | 3,043 ms | 2,937 ms | 2,113 ms |
| Slow mobile 2 | 2,420 ms | 3,392 ms | 4,693 ms | 3,277 ms |

These measurements exclude hosted Supabase latency and do not represent physical-device performance. They identify large-workspace rendering/hydration as a profiling target, but do not isolate a specific architectural bottleneck. Repeat `pnpm profile:startup` against a local demo production preview, then profile authenticated hosted staging before choosing further store or chart splitting.

## Remaining release gate

No production writes or deployment were performed. Hosted staging project `dyaxtloducpgjoxuaszk` denies the connected account access. Local database/storage verification is complete; deployed staging policies, migrations and end-to-end hosted behavior remain unverified.

The release alignment manifest records three pending production migrations, including the existing reminder migration and the two new audit migrations. The release alignment gate must remain failing until their actual deployment is verified and the manifest updated through the established process. Verify the deployed delegation migration separately; local passing tests do not establish its hosted presence.

Long-lived storage orphans absent from the browser registry are not automatically deleted. Any future server retention/garbage-collection job must use authoritative references and command fencing. Recovery covers the main creation/service-plan flows, while other dirty forms receive navigation/PWA protection without persistent recovery. Broad visual redesign remains deferred.
