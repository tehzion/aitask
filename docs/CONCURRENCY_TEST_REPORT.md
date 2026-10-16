# Concurrency Test Report — AiTask

**Date:** 2026-10-17

## 1. Concurrency controls (source-verified)

| Control | Mechanism | Location |
| --- | --- | --- |
| Optimistic concurrency | Per-row `expectedVersion` preflight → `CONFLICT` + `actualVersion` | `reliable_workspace_commands.sql` |
| Workspace-level lock | 5-arg RPC overload `p_expected_workspace_version` | `workspace_optimistic_lock.sql` |
| Idempotency | advisory xact lock + `aitask_command_receipts` replay; duplicate command IDs are no-ops | `reliable_workspace_commands.sql` |
| Duplicate-submit guard (UI) | `useSaveAction` `owner` token; buttons/fieldsets disabled while busy | `useSaveAction.ts` |
| Duplicate approval guard | `canApproveTaskInternally` (requires `Waiting Approval`), `canReviewTaskAsClient` (requires `isAwaitingClientReview`) | `access.ts`, `taskWorkflowAccess.ts` |
| Duplicate notification guard | `resolveTaskUpdateRecipientIds` uses `Set`; `makeNotification` one-audience invariant; revision dedup | `store/index.ts` |

## 2. Scenario coverage

| Scenario | Handling | Evidence |
| --- | --- | --- |
| Two users edit same record | Optimistic `expectedVersion` → last-writer conflict surfaced, not silent overwrite | `workspace_optimistic_lock.sql` |
| Simultaneous assignment | Versioned command + conflict feedback | `store`, `secureWorkspace` |
| Concurrent approvals | Status precondition blocks second approval | `canApproveTaskInternally` |
| Rapid status changes | `useSaveAction` owner token rejects concurrent runs; UI disabled while busy | `useSaveAction.ts` |
| Stale record overwrite | `CONFLICT` + `actualVersion` prevents stale write | `reliable_workspace_commands.sql` |
| Role change during session | `onAuthStateChange` + `subscribeToCurrentMemberAccessChanges` + session invalidation | `App.tsx`, `supabaseClient.ts` |
| Realtime disconnect / reconnect | 15 s poll + `focus`/`visibilitychange`/`online` reconcile missed events | `store/index.ts:5992-5996` |
| Network failure / retry | Idempotent retry (receipts); `discardMutation`/`retryPendingSave`; no blind non-idempotent retry | `store`, `secureWorkspace` |

## 3. Test evidence

- Unit suites covering conflicts/save recovery: `secureWorkspace.test.ts`, `sessionIntegrity.test.ts`, `planSaveCommit.test.ts`, `mixedSaveRecovery.test.ts`, `actionRollback.test.ts`, `chunkRecovery.test.ts`, `notificationRecipients.test.ts` — all PASS in the 814-test gate.
- Prior live rollout recorded `completePgTapSuitePassed: 208` and business-hash-unchanged verification.

## 4. Verdict

Conflicting updates are detected, duplicate submissions/approvals prevented, stale writes rejected via versioning, and retries are idempotent. **No concurrency defect found.** Live simultaneous multi-user browser sessions were not run in this offline environment (CI `e2e/` covers role flows).
