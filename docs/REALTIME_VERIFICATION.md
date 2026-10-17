# Realtime Verification

**Date:** 2026-10-17

## Implemented architecture

| Layer | Mechanism | Purpose | Result |
| --- | --- | --- | --- |
| Authoritative DB | Supabase Postgres + RLS + guarded RPCs | commit and authorization | PASS |
| Invalidation Realtime | `postgres_changes` on `public.aitask_workspaces`, filtered to `id=eq.aitask-main` | notify active sessions that the snapshot revision changed | FIXED & VERIFIED |
| Access Realtime | member auth row plus watched custom-role rows | shorten permission/role cache window | PASS |
| Snapshot reload | `loadSecureWorkspace` + notification feed/portal RPC | deliver only current authorized data | PASS |
| Fallback reconciliation | 15-second poll, focus, visibility, online listeners | recover missed events/background tabs | PASS |
| Concurrency gate | `createAccessRefreshCoordinator` | coalesce events and wait through save/pull/conflict | PASS |

The revision channel is deliberately an invalidation signal. It does not broadcast task, project, notification, comment, attachment, or member business payloads. Each session reads its own permitted snapshot under RLS.

## Subscription checks

- Workspace identifier is restricted to safe filter characters before constructing the Realtime filter.
- The filter is `id=eq.aitask-main` on `public.aitask_workspaces` UPDATE events.
- The migration adds `aitask_workspaces` to `supabase_realtime` idempotently.
- The workspace row is already RLS-enabled and selectable by authenticated workspace members.
- Access and revision subscriptions are cleaned up on session change and auto-sync stop.
- Only one auto-sync lifecycle can be active in a browser; repeated starts are ignored.
- Events received while saving or with a pending conflict are queued, not applied over local work.
- Realtime loss does not block convergence: polling/focus/visibility/online reconciliation remains active.

## Automated verification

| Check | Result | Evidence |
| --- | --- | --- |
| Workspace filter shape | PASS | `src/lib/supabaseRealtime.test.ts` |
| Unsafe filter rejection | PASS | `src/lib/supabaseRealtime.test.ts` |
| Cleanup suppresses delayed callbacks | PASS | `src/lib/supabaseRealtime.test.ts` |
| Store wiring triggers authorized reload | PASS | `src/store/hodCrossRoleSync.test.ts` |
| Publication is declared | PASS | `supabase/tests/database/security_cutover.test.sql` |
| Missed-event recovery | PASS | existing auto-sync and access-refresh tests + source review |
| TypeScript/migration gates | PASS | `pnpm check`, `pnpm verify:migrations` |
| Live Realtime delivery | NOT VERIFIED | requires authenticated staging sessions/browser run |

## Expected behavior

When Realtime is connected, affected active sessions begin a snapshot reconciliation immediately after the committed revision update. When a connection is delayed or missed, the next 15-second interval or focus/visibility/online event reconciles the session. A live four-role staging run is still required to measure end-to-end latency and verify actual notification delivery with separate accounts.
