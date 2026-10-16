# Supabase Realtime Verification — AiTask

**Date:** 2026-10-17

## 1. Realtime configuration

- Publication tables: `aitask_entities`, `aitask_members` (manifest `v230RealtimeRefreshRollout`).
- Client subscription: `subscribeToCurrentMemberAccessChanges` (`supabaseClient.ts:29`) — a `postgres_changes` channel filtered by `auth_user_id=eq.${authUserId}` on `aitask_members`, plus watched custom-role `entity_id` rows. **Deliberately narrow** (permission changes only).

## 2. Data consistency model (not realtime-only)

| Mechanism | Purpose |
| --- | --- |
| 15 s `setInterval(pullLatest)` + `focus`/`visibilitychange`/`online` | entity-data reconciliation across roles/tabs |
| Realtime member-access channel | shortens the cache window after a permission/role change |
| `handleOffline`/`handleOnline` + `pullBackendNow` | reconnect recovery |

**Expected cross-user entity update interval: ≤15 s, or immediate on focus/visibility/online.** Documented and acceptable for a task-management workflow.

## 3. Security of realtime

- Channel filter is `auth_user_id`-scoped; RLS remains the authorization boundary (realtime only triggers a refetch, it never delivers rows).
- No entity-level realtime push → a user cannot receive another user's rows via subscription.
- Safe filter value guard `^[A-Za-z0-9_-]+$` (≤160 chars) prevents injection.

## 4. Subscription hygiene

| Check | Result |
| --- | --- |
| Cleanup on unmount | PASS (`removeChannel` in cleanup; `backendAutoSyncCleanup`) |
| Duplicate subscriptions | PASS (single channel guarded by `accessRealtimeKey`/`backendAutoSyncStarted`) |
| Reconnection / missed events | PASS (client auto-reconnect + polling reconciliation) |
| Multiple tabs | PASS (polling + focus/visibility converge; session-scoped) |

## 5. Cross-role flow (Staff updates task)

1. Staff save → versioned command commits to Supabase.
2. Staff sees optimistic update immediately + `pullLatest` confirms.
3. PM/HOD/Boss see the change ≤15 s (or on focus/visibility) via `loadSecureWorkspace` reconciliation — no manual refresh required.

## 6. Verdict

Realtime is correctly scoped and leak-free; consistency is guaranteed by polling + reconciliation rather than relying on realtime alone. **Live simultaneous 4-role session not re-run in this offline environment** (CI `e2e/` covers role flows). No realtime defect found.
