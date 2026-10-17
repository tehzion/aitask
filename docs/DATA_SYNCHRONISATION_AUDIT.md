# Data Synchronisation Audit

**Date:** 2026-10-17
**Scope:** Supabase secure workspace path, React/Zustand state, dashboards, notifications, RLS, Realtime, offline recovery, and cross-role mutation flows.

## Executive result

Supabase remains the authoritative source for persistent business data. Every secure mutation is committed through a guarded, versioned RPC; the browser keeps an optimistic projection and reconciles it against an RLS-filtered snapshot.

One synchronization gap was confirmed and fixed in this pass: ordinary workspace mutations previously depended on a 15-second poll because Realtime only watched member-access rows. The app now subscribes to the non-sensitive `aitask_workspaces.version` update as an invalidation signal. The client then reloads its own authorized snapshot. Polling, focus/visibility, and online-reconnect reconciliation remain as missed-event fallbacks.

## Single source of truth

| Concern | Canonical source/rule | Result |
| --- | --- | --- |
| Persistent business data | Supabase Postgres tables and guarded command/service RPCs | PASS |
| Frontend state | Optimistic projection of the last confirmed Supabase snapshot; retained commands are replayable/idempotent | PASS |
| Concurrency | Workspace revision plus per-row versions and command receipts | PASS |
| Task progress | `getTaskProgress` and `deriveServiceProgress` | PASS |
| Deliverable/cycle status | `resolveDeliverableStatus` and guarded transition rules | PASS |
| Review queues | `isAwaitingClientReview` / `isAwaitingInternalReview` | PASS |
| Project totals | Derived from visible tasks; no stale stored `totalTasks`/`completedTasks` authority | PASS |
| Notification reads | Server notification feed/read RPCs; browser updates optimistically and reconciles | PASS |
| Access | Database RLS and command authorization; client checks are UX only | PASS |

## Synchronization path

```text
Authorised action
  → guarded transactional RPC
  → Supabase commit + workspace version increment
  → Realtime workspace-revision event
  → RLS-filtered snapshot reload for each affected session
  → canonical selectors recalculate dashboards
  → committed notification feed is refreshed
```

The Realtime event carries no business entity payload. It only invalidates the cache. This avoids using the polymorphic entity table as a broad broadcast channel and keeps authorization at the snapshot query/RLS boundary.

## Confirmed fixes in this pass

| Finding | Root cause | Fix | Verification |
| --- | --- | --- | --- |
| Cross-role entity changes waited for polling | No ordinary workspace Realtime invalidation subscription | Added `subscribeToWorkspaceRevisionChanges` and `aitask_workspaces` publication migration | `supabaseRealtime.test.ts`, `hodCrossRoleSync.test.ts`, TypeScript check |
| Realtime publication did not include the revision row | Only member/entity publication entries existed | Added idempotent `20261017091031_workspace_revision_realtime.sql` | `security_cutover.test.sql`, migration gate |
| Existing access subscription could be mistaken for data sync | It only covered member/custom-role changes | Documented separate revision invalidation and retained access subscription for authorization refresh | Source review + regression tests |

## Reliability and security checks

- Direct authenticated writes to secure tables remain revoked; writes use guarded RPCs.
- RLS protects workspace, member, entity, notification, and storage access.
- Realtime publishes the workspace revision row only for invalidation; the subsequent snapshot is still filtered by RLS.
- Duplicate Realtime subscriptions are prevented by the auto-sync lifecycle and cleaned up on session change/unmount.
- A coordinator coalesces events and waits while a save, pull, conflict, or retained mutation is active.
- A local edit arriving during a pull cannot be overwritten because `localMutationEpoch` is checked before applying the remote snapshot.
- Command receipts make retries idempotent; optimistic concurrency returns a conflict instead of overwriting newer data.
- Polling every 15 seconds plus focus, visibility, and online listeners reconciles missed or delayed events.

## Residual verification limits

The focused Realtime/store suite, full Vitest suite (107 files / 828 tests), TypeScript check, migration gate, lint, i18n audit, and production build passed. A simultaneous four-account live browser run was not available in this session, so live cross-role cells remain `NOT VERIFIED` until a staging project with separate credentials is exercised. No production data was modified or deployed.
