# Remaining Gaps — AiTask

**Date:** 2026-10-17 · Branch `codex/audit-p0p1-2026-10-16` (HEAD `7ac0b25`)
All items below are current as of this review. Priorities follow the P0–P3 scale from `IMPROVEMENT_PLAN-2026-10-16.md`.

---

## P0 — none open (source-level). All original P0 findings are fixed in source and the corresponding migrations are applied to production (verified through `service_transition_guard`).

## P1

| ID | Module | Gap | Impact | Evidence | Recommended action |
| --- | --- | --- | --- | --- | --- |
| SUP-I3 (residual) | DB / deploy | **2 pending production migrations**: `20261016160000_pm_client_scope_and_ownership`, `20261016170000_department_scoped_visibility_cleanup` | `pm_client_scope_and_ownership` closes a PM cross-company rename/edit/delete/re-own hole in the SECURITY DEFINER service RPC — **live exploit until deployed** | `migration_repair_manifest.review.json` `pendingProductionMigrations` | Apply behind the documented preflight/backup gate (`docs/production-rpc-mismatch-recovery.md`); run both pgTAP files |
| — | Workflow | **Policy reversal not product-approved**: PM may complete client-visible work before client acceptance (B6/DBG-10/DA-01 reverted in `fca797f`) | Ordering of client acceptance changed; internally consistent (frontend+DB), but deviates from audit P1 recommendation | `taskWorkflowAccess.ts:40-50`; `taskStatusControls.test.ts:62-70` | Product owner sign-off, or restore approval-before-completion |
| — | Deploy | **3 local commits not pushed** (`7ac0b25`, `415fc4f`, `fca797f`) | Fixes not in origin/PR | `git status` ahead by 3 | Push + open PR (see handoff v2) |

## P2

| ID | Gap | Impact | Action |
| --- | --- | --- | --- |
| AUTH-02 | `/clients/:clientId`, `/account/password`, `/notifications` bypass central `RoleRoute` (self-gated) | Defence-in-depth only | Route through guard or document explicitly |
| SYN-02 | Optimistic version truth lives in module-level `baseline`, not store entities | Latent drift in `applyCommandVersions` | Architectural; accept or refactor |
| ARC-01 / ARC-03 | ~6k-line `store/index.ts`; duplicate predicates (`isTaskCompleted`, `isTaskOpen`, `isTaskLinkedToDeliverable`) | Maintainability | Deferred refactor |
| DBG-13 | Local demo shows prices the secure backend zeroes inline | Divergence | Add doc note (or align fixtures) |
| AUTH-05 | Legacy dept/role strings (`Videoshooting`, `Editor`, `Super Admin` label split) | Cosmetic/data-compat | Normalize labels |
| SEC-02 (residual) | Edge function CORS allowlist vs DB origin list differ | Narrower in function (safe), but inconsistent | Align |

> **Resolved since the 2026-10-16 audit:** UI-01/UI-02 (Staff upload abandonment, midnight-stale dates) are **fixed** in the current tree (`StaffTaskFocus.tsx` outputUpload guard, `StaffAllWork.tsx:102` `useLocalToday`). AUTH-04 (`getDefaultAccessiblePath` loop) is **fixed** in this remediation (`access.ts` fallback → `/notifications`).

## P3

- AUTH-03 (client default permissions exceed curated nav), DBG-09 (dead `completionPercentage` ternary), PERF-01 (pause poll when hidden), PERF-02 (order-sensitive `JSON.stringify` equality), PERF-03 (per-render form serialization).

## Operational gaps

| Gap | Detail |
| --- | --- |
| Scheduled backups | Supabase **Free plan has no scheduled backups** (manifest `backup`, `backupRestoreEvidence.platformBackupClaimed:false`). Manual logical backup last verified 2026-09-04. |
| Leaked-password protection | Disabled (plan limitation) — manifest `leakedPasswordProtectionEnabled:false`. |
| Live RLS re-verification | Recommend independent `pg_policies`/grants re-check at next deploy rather than trusting manifest alone. |
| pgTAP / e2e for newest migrations | Unrun in any environment (see REGRESSION_TEST_REPORT §4). |

## Security gaps (residual)

- `service_role` retains `SELECT, UPDATE` on `aitask_members` (documented least-privilege; write capability on directory table — SUP-R3).
- 4-arg command RPC overloads retained for legacy clients and bypass the workspace-level version precondition (weakened concurrency surface — SUP §3). Retire once no old clients remain.
- `aitask_entities` has no `FORCE ROW LEVEL SECURITY` on the base table (added only on the client-ownership trigger) — accepted for SECURITY DEFINER design, noted for defence-in-depth (SUP-R4).
