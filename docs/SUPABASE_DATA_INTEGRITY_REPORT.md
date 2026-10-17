# Supabase Data Integrity Report — AiTask

**Date:** 2026-10-17

## 1. Integrity mechanisms

| Mechanism | Status |
| --- | --- |
| PKs / unique constraints | `aitask_members.auth_user_id UNIQUE`; `aitask_entities (ws, type, id)`; `aitask_feedback (campaign, lower(email)) UNIQUE`; partial unique for one-active-plan / one-cycle-per-period |
| CHECK constraints | `role`, `entity_type`, feedback field bounds/JSON types |
| FK constraints | real FKs only on workspace/auth (`CASCADE`/`SET NULL`) |
| Soft references (`parent_id/assigned_to/created_by/client_id/plan_id/cycle_id`) | **no FK** — enforced by `aitask_guard_entity` derivation + app cleanup (SUP-I1) |
| Optimistic concurrency | per-row `expectedVersion` + workspace lock |
| Idempotency | `aitask_command_receipts` + advisory lock |
| Triggers | `guard_member_update` (self-escalation), `guard_entity` (secret-block, rename, denormalization), `guard_service_status`, `guard_task_stage_progress` |

## 2. Known data-integrity risks

| ID | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| SUP-I1 | No FK on soft-reference columns → orphan risk (esp. `primaryTaskId`) | App cleanup (C2 clears `primaryTaskId`; `deleteTask` remaps `taskIds`); triggers backfill `client_id`/`client_key` | Accepted (by design) |
| SUP-I2 | Empty migration (replay hazard) | Repaired (8,899-byte DDL) + `verify:migrations` guard | FIXED |
| SUP-I3 | Pending migrations carry live fixes | Manifest tracks `pendingProductionMigrations` | **2 pending** (deploy-gated) |
| SUP-I4 | `audit_events.actor_member_id` SET NULL on member delete | Attribution degrades, not lost (by design) | Accepted |
| — | Duplicate company names | id-first matching (`matchesOwnedClient`); unique not enforced (business allows dupes) | Accepted (name is not an identity key) |

## 3. Verification evidence

- Manifest `auditP0P1ProductionRollout.liveVerification`: `workItemsWithoutClientId: 0`, `workItemsWithoutClientKey: 0`, business hashes unchanged before/after migration; `clientsOwnerlessAfter: 1` (1 known ownerless legacy client, documented).
- Unit: `duplicateClientDelete.test.ts`, `pmDuplicateClientScope.test.ts`, `pmPortfolioIdScope.test.ts`, `deliveryTaskLinks.test.ts` — all PASS.

## 4. Safe remediation plan (existing anomalies)

- 1 ownerless client record (manifest) — backfill owner via `client_ownership_backfill` was already applied; the remaining one is documented and not a security hole.
- No new orphan/duplicate/anomaly found this pass.

## 5. Verdict

Data integrity is sound; the only outstanding items are deployment-gated (2 pending migrations) and the accepted soft-FK/name-duplicate design choices. No silent deletion or rewrite of business records occurs.
