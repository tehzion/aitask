# Refactoring batches and cleanup record

The work was performed as successive extraction and relocation batches in one working tree. No commits, deployment, dependency upgrades, production database changes, or new migrations were made by this refactor. The [relocation map](relocations.json) records original and final source/test paths; extraction boundaries are summarized below.

## Batch ledger

| Batch | Behavior recorded and protected | Structural change | Verification / reversal boundary |
| --- | --- | --- | --- |
| Baseline | Local/hosted modes, one workspace store, RLS/RPC boundaries, existing routes and workflow tests | Inventory and untouched temporary source/browser snapshot | Type/lint/build/bundle/unit baseline captured before edits |
| Shared foundations | UI tokens, localization registration side effects, date/form utilities, account-aware hooks | Shared primitives/rules/types; app ownership for store-aware hooks and shell components | Imports updated atomically with paths; no style or markup redesign |
| Notifications | Recipients, receipts, unread counts, local reminders, cursor feed, popups/sounds, rollback | Typed notification actions/rules; secure notification transport moved to infrastructure | Existing notification unit/store tests retained; explicit public leaf entry points |
| Feature state | Existing role, project, task, approval, client, service, and recurring rules | Seven private feature action factories plus a local-demo action factory; one original guarded setter/getter | Full unit suite passed after initial extraction; no persistence/schema/API migration |
| Domain ownership | Existing pages, hooks, components, domain helpers, and tests | Authentication/users, projects/clients, tasks, services, dashboard/reports/calendar, settings/feedback/help colocated | Caller imports, lazy routes, browser fixtures, test mocks, source-inspection targets, and Vite chunk paths updated |
| Backend | Versions, command batching, retained retries, session binding, partial-save recovery, projections | Independent contracts, request transport, serialization, runtime dependency contracts; app-owned warning presentation | Existing secure workspace/transport/permission tests retained; runtime and type-inclusive cycles checked |
| Page responsibilities | Existing task and user-administration JSX and event behavior | Private orchestration hooks; registration review component; shared view options within each module | JSX comparison: Tasks 274/274 and Approvals 533/533 nodes identical |
| Boundaries and cleanup | Lazy-loading and existing integrations/background operations | Explicit entry-point manifest, tested dependency checker, CI gate, unused notification barrel removed | Nine checker tests; no private import violations or runtime/type-inclusive cycles |

Each batch can be reversed through the recorded moves and corresponding import updates. State, storage, routes, and RPC shapes remain compatible, so these source-only reversals require no data rollback. Revert a move together with its callers, tests, and tooling references; do not restore a compatibility file while leaving two runtime store implementations.

## State extraction details

- The composition root retains backend boot/load/save/retry/discard operations, persistent middleware, subscription lifecycle, and cross-domain save coordination.
- Authentication receives lifecycle callbacks instead of importing the composed store. Feature factories receive typed `set`/`get` and preserve the original action signatures.
- Live remote-snapshot/notification-read flags and mutation epochs remain shared objects. Passing their primitive values by copy would have broken mutation bookkeeping and was avoided.
- Service progress derivation receives the current state explicitly at the same call point where the original implementation read the store.
- Backend row serialization receives the current canonical baseline explicitly; it remains version-aware and preserves client task field allowlists and frozen pricing projections.
- Lazy runtime helper contracts are independent types rather than `ReturnType` imports back into their coordinator, eliminating type-inclusive dependency cycles.

## Browser fixture readiness

Differential browser verification exposed fixtures that wrote directly into the store before lazy app boot completed, plus a responsive helper that cleared the previous account after navigating to Login. Added a test-only rendered-main readiness helper to the affected fixtures and corrected that clearing order. No workflow assertion, expected result, timeout, or production behavior was changed. Original full-run failures remain documented separately from isolated reruns.

## Cleanup decisions

Removed the unreferenced `modules/notifications/index.ts` barrel after checking source, tests, scripts, and build references. It mixed UI, hooks, and services and had no remaining consumers. Imports now use the explicit leaf interfaces.

Removed obsolete empty `pages`, `components`, `hooks`, `lib`, `store`, and `types` directories after relocating their contents. Removed extraction compatibility re-exports after moving all callers to their owning contracts/helpers. Type-only imports/exports are explicit, so erased type dependencies do not create runtime edges.

No package dependency was removed: no dependency was conclusively proven unnecessary across application imports, tooling, service-worker configuration, and test/build paths. The lockfile and package versions are unchanged. No database routine, dynamic import, background action, cron job, SQL policy, Edge Function, or storage operation was removed. No speculative consolidation of similar business rules was performed.

## Concurrent work preserved

Other work modified account email confirmation, Settings, two Edge Functions, staging workflow restrictions, database authorization tests, and added a security migration and boundary tests while this refactor ran. Those changes were preserved. The action-body comparison found the concurrent email-confirmation response update as the only non-structural difference among the 77 extracted feature actions compared to the initial snapshot.

These changes are not claimed as refactoring fixes, and their migration/manifest state is reported separately. Existing unrelated reports, output files, and workspace artifacts were left in place.
