# HOD cross-role data sync audit — 7 October 2026

## Scope

Checked how changes originating from Boss, Project Manager, Staff, and Client reach HOD's task workspace. Reviewed secure snapshot loading, revision polling, permission subscriptions, queued access refreshes, pending changes, account switching, and role-scoped database reads. Production checks were read-only; no task, company, account, permission, or notification was changed.

## Production evidence

At workspace revision 1390, production contained 185 tasks. Evaluating the deployed HOD visibility predicate against the frontend ownership/assignment/normalized-department rule found **zero mismatches** across those tasks. A second check using the authenticated database role and the HOD authentication context returned the same **123 visible tasks**.

| Task creator role | Total tasks | Visible and editable by HOD |
| --- | ---: | ---: |
| Project Manager | 105 | 86 |
| Staff | 69 | 27 |
| HOD | 10 | 10 |
| Boss | 1 | 0 |

Visibility depends on task scope, not creator role. The single Boss-created task is excluded by the current HOD scope. No Client-created tasks exist in this snapshot; Client feedback/revision propagation was exercised with simulated canonical responses rather than a production Client write.

The HOD account has Video Shooting and Video Editor departments. Authenticated row-security reads also returned 40 companies, 62 projects, 5 plans, 7 service cycles, 13 deliverables, 1 add-on, 4 role templates, 5 task statuses, and 111 notification entity records. Notification entity count is not an unread count or a guarantee that all notifications are loaded in the first feed page. These counts describe RLS-accessible rows; individual UI lists can apply narrower filters. The HOD default template is readable. Members and entities are included in the production Realtime publication.

## Local fixes

- Access refreshes now wait while a local change is pending, offline, or in conflict. This prevents a forced permission refresh from replacing unresolved local edits. After save/retry/discard resolves the change, the queued refresh resumes. Database permissions continue to govern whether the pending write is accepted; the UI access snapshot can remain stale until resolution.
- A queued access refresh rechecks save/pull/pending state immediately before running, closing the microtask scheduling race.
- Reset invalidates scheduled refreshes, and subscription cleanup ignores late callbacks from the former account/channel.
- Role-template subscriptions use one server-side entity ID filter and verify the entity type in the callback. This is compatibility hardening. Current upstream Realtime supports compound filters, so the previous compound filter was not established as a live production failure.

## Update timing

Normal workspace changes use a 15-second interval while the tab is visible and the store is idle, plus checks on focus and visibility changes. Effective-access changes also request a forced refresh through Realtime. This is not a guarantee that every task change appears instantly. Offline state and unresolved local changes defer refreshes.

## Verification and limits

The full unit suite passed with 441 tests before the final autosync fixture was strengthened. The final targeted run passed all 20 tests across the autosync-active HOD store, access-refresh coordinator, and Realtime subscription suites. These mocked integration/unit checks cover cross-role canonical updates reaching HOD without a save echo, removal of formerly visible tasks after department changes, preservation of pending edits, stale HOD responses after Client account switching, consistent/cancellable paging, channel cleanup, and access-refresh lifecycle behavior.

These tests exercise frontend logic with simulated backend responses. Production evidence verifies read access and installed publication membership; no live multi-account write or websocket delivery test was performed. TypeScript, lint, strict translation coverage, the production build, whitespace checks, and bundle budgets passed. The eager JavaScript graph remains within the 300 KiB gzip cap. Local fixes have not been deployed.

The initial browser run timed out on login navigation while several validation jobs were running concurrently; it was interrupted and replaced with an isolated run. All 15 HOD and task-authorization browser scenarios passed in that isolated run. Other work in this shared checkout was preserved.

Sources used to check Realtime filter behavior: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and [current upstream subscription parser](https://github.com/supabase/realtime/blob/master/lib/extensions/postgres_cdc_rls/subscriptions.ex).
