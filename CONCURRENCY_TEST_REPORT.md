# Concurrency Test Report

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)

## Controls reviewed

| Control | Implementation | Assessment |
| --- | --- | --- |
| Row optimistic locking | `version` on members/entities; expected version checked before write | PASS |
| Workspace optimistic locking | workspace version is locked and checked by command RPCs | PASS |
| Duplicate command retry | `(workspace_id, actor_member_id, command_id)` command receipt | PASS |
| Atomic preflight | all operations in a command are validated before the first write | PASS |
| Client stale-state protection | local mutation epoch/session checks prevent stale pulls overwriting edits | PASS |
| Offline recovery | retained command/batch in session storage; explicit retry/conflict state | PASS |
| Cross-session invalidation | workspace revision Realtime event plus poll/focus/reconnect fallback | PASS in source/tests; live verification pending |
| Notification deduplication | server audience guards and reminder claim key | PASS in database tests |
| History consistency | history trigger is in the same transaction as the row mutation | PASS by design; live database run pending |

## Scenario matrix

| Scenario | Expected result | Evidence/result |
| --- | --- | --- |
| Two users edit same task | first commit succeeds; second receives `CONFLICT` | command RPC and optimistic-lock tests: PASS |
| Two users approve same task | one approval succeeds; the other sees stale version/status | reviewer guards + row versions: source PASS; simultaneous live test NOT RUN |
| Two users reassign task | one wins by version; no silent overwrite | assignment tests and command preflight: PASS |
| Retry after timeout | replay returns existing receipt and does not duplicate rows/notifications | idempotent command tests: PASS |
| Reconnect during pull | current session token and local mutation epoch protect local edits | store sync tests: PASS |
| Realtime event during save | refresh coordinator defers/reconciles after save | cross-role sync tests: PASS |
| Generic + service mutation | derived service rows are re-evaluated after earlier group | command-batch tests/source: PASS mitigation; not fully atomic |
| Failed multi-command batch | cursor retains the unconfirmed group for retry | `secureCommandBatch` source and recovery tests: PASS |
| Delete while another user edits | version/NOT_FOUND conflict; stale route cleanup is transactionally trigger-based | task deletion/database tests: PASS |

## Test execution record

`verify-migrations` passed. The relevant targeted suite completed with 109 passing tests and 4 failures; those failures were pre-existing expectation mismatches caused by unrelated dirty-worktree changes to user-facing error mapping. The broader suite also exposed a resource-sensitive failure in `src/lib/localCredentials.test.ts` and unrelated service-file/user-facing-message expectation failures. `pnpm check` and `pnpm lint` were started but did not complete within this run; no diagnostic output was produced before interruption. No live four-account simultaneous browser/database run was available in this session.

The new database test file is `supabase/tests/database/audit_entity_history.test.sql`. It validates the table, columns, RLS/grants, trigger installation, and append-only guard; it requires the project’s pgTAP database harness.

## Residual concurrency risk

The batch runner can commit a generic RPC and a service RPC separately. It retains and retries the failed group, and database triggers reconcile derived progress, but this is not equivalent to one transaction for arbitrary cross-domain business intents. Treat this as a staging acceptance item for workflows that update multiple domains at once.
