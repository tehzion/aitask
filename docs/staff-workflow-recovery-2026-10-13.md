# Staff workflow and recovery fixes — 13 October 2026

Implemented locally. Production deployment and migration application have not been performed.

## Behavior

- Deliverable-linked tasks require an HTTPS output link or a matching deliverable file before a new transition to review/completion. Both direct and reverse task links are checked. Ordinary administrative tasks remain flexible. Existing completed records can receive unrelated edits without fabricated historical evidence. The database checks actual Storage objects for uploaded-file evidence.
- Staff can accept their current assignment, request help/handover or a review update, and clear blockers. Requests notify the existing task team. Reassignment resets acceptance and inherited blockers. Starting work records the current assignee's acceptance.
- The task sheet shows the task contact, review submission time, and attributed changes to task fields. The contact comes from the assigner/creator relationship; it is not a newly appointed reviewer. New history starts with these changes and retains the latest 50 entries; the existing protected database audit is unchanged.
- Notes/help drafts and Full edit drafts use the existing account/task/tab-scoped device recovery storage, which expires after 24 hours. Restore/discard is explicit. Full edit restoration merges untouched newer fields and asks before replacing overlapping edits. Recovery avoids offering an already-staged comment as a duplicate submission. File binaries and credentials are not stored in drafts.
- Help and unconfirmed-assignment filters expose outstanding work. The inbox can show open work regardless of whether its notification was read. Its copy explains that the filter covers loaded updates and that older history requires Load more.
- Operational metadata is stamped by the authenticated actor in the database and omitted from client projections. Client approval can omit internal assignment fields and revision counters only inside an already-validated approval command. The server preserves the canonical revision counter and records completion time.

## Reported “new version” wording

The Calendar screenshot showed a rejected date save with a permission error. “Use latest” meant discard the attempted change and reload saved data. Its Chinese translation, “使用最新版本”, misleadingly suggested a software update.

The date action now says **Restore saved dates / 恢复已保存日期**. The recovery description says retry *attempts* a save; permission rejections explain that the task owner must check access before retrying. Shared Chinese recovery copy now refers to saved data, and the workspace freshness badge identifies new saved data. The permission error is translated. Software/PWA update notices keep their separate behavior.

This wording correction does not establish the cause of the pictured account's authorization denial or change its permissions.

## Verification

- The independently exported staff-only staged commit passed TypeScript and **557 unit tests across 78 files**, with separate client-delivery and HOD changes excluded.

- Full unit suite: **562 tests in 78 files passed** for the staff implementation. The subsequent recovery-copy checks passed **24 translation/message tests**.
- Staff browser coverage: **60 distinct scenarios verified** across dashboard accuracy, task workspace, deep recovery, save recovery and new workflow gaps. The combined run passed 59; one service-activity startup timed out while builds shared CPU, then passed its focused rerun without weakening assertions.
- Calendar follow-up: **all 15 scenarios passed**, including two new English/Chinese permission-rejection and saved-date restoration cases.
- Database: **623 assertions across 44 files passed**, plus database lint/advisors and actual authenticated local staff saves, client approval, Auth recovery and private Storage recovery. Disposable stacks were cleaned up.
- TypeScript, full ESLint, strict translation audit, production build, static PWA checks and bundle budgets passed. Startup JavaScript is **293.0 KiB gzip**, below the unchanged 300 KiB cap. A read-only Chrome startup check of the minified production bundle rendered login without JavaScript errors.
- Four intended Staff visual baselines were updated; desktop/mobile and Chinese dark-mode layouts were reviewed.

Browser recovery tests use controlled transport responses; the separate backend gate uses real disposable local Auth/REST/Storage. No authenticated hosted Staff session or production write is claimed.

## Rollout

Apply `20261013035142_staff_workflow_recovery` with its preceding pending migrations before deploying the corresponding frontend. The release manifest records it as pending production work. Complete hosted authenticated Staff/Client QA before promoting the release.

The build pins the already-cached Terser 5.48.0 minifier to stay within the existing startup budget; optional staff copy is registered with its lazy routes. Other ongoing workspace changes were preserved.
