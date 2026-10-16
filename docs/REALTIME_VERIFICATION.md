# Realtime Verification — AiTask

**Date:** 2026-10-17

## 1. Architecture

| Layer | Mechanism | Purpose |
| --- | --- | --- |
| Authoritative DB | Supabase Postgres (RLS + command RPCs) | persistence + authorization |
| Polling | 15 s `setInterval(pullLatest)` + `focus`/`visibilitychange`/`online` | entity-data reconciliation |
| Realtime | `postgres_changes` channel on `aitask_members` (+ watched custom-role rows) | permission-change refresh only |
| Offline/online | `handleOffline`/`handleOnline` + `pullBackendNow({silent})` | reconnect recovery |

## 2. Realtime specifics (`supabaseClient.ts:29-70`)

| Check | Result |
| --- | --- |
| Correctly scoped | `filter: auth_user_id=eq.${authUserId}` on `aitask_members`; custom-role `entity_id` watch with `entity_type` check |
| No over-subscription | Realtime is deliberately limited to **member-access** changes, not a full entity push (avoids exposure + excess connections) |
| Safe filter values | `isSafeRealtimeFilterValue` regex `^[A-Za-z0-9_-]+$` (≤160 chars) guards against injection/abuse |
| Cleanup on unmount | returns `() => { active = false; supabase.removeChannel(channel); }`; `backendAutoSyncCleanup` calls it |
| Duplicate subscriptions prevented | channel created once in `startBackendAutoSync`; guarded by `accessRealtimeKey`/`backendAutoSyncStarted` |
| Reconnection | Supabase JS client auto-reconnects; polling + `visibilitychange` reconcile missed events |

## 3. Missed-event reconciliation

Even when Realtime disconnects or events are missed (background tab, network drop), the **15 s poll** plus `focus`/`visibilitychange`/`online` listeners re-fetch (`pullLatest`), so all roles eventually converge to the committed state without a manual refresh.

## 4. Security of sync

- Realtime channel is filtered by `auth_user_id`; RLS remains the authorization boundary — Realtime only shortens the cache window after a permission edit, it never grants data.
- No entity-level realtime push, so a user cannot receive another user's rows via subscription.
- Polled reads go through RLS-protected selects (`loadSecureWorkspace` pages `aitask_members`/`aitask_entities`).

## 5. Verification

| Check | Result |
| --- | --- |
| Realtime source reviewed | PASS |
| Subscription cleanup | PASS (source) |
| Safe filters | PASS (source) |
| Reconnect/missed-event reconciliation | PASS (source: polling + focus/visibility/online) |
| Live realtime session test | **NOT VERIFIED** (no live project/browser in this session; manifest records `v230RealtimeRefreshRollout` with `anonymousIsolationPassed:true`) |

## 6. Conclusion

The chosen architecture (polling-first + narrowly-scoped realtime for permission changes) is secure, leak-free, and reliably converges. **Expected update interval for cross-user entity changes: ≤15 s, or immediately on window focus/visibility/online.** This is acceptable for the task-management workflow and is documented in `README.md`/`DEPLOYMENT.md`.
