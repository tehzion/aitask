# Supabase Verification Report — AiTask

**Date:** 2026-10-17 · **Scope:** secure production backend (`VITE_AITASK_BACKEND=supabase`)
**Method:** static review of `supabase/` (schema, migrations, RLS, RPCs, edge functions, preflight manifest) + local gate. **No live project access during this review** — runtime items are verified only via the committed `migration_repair_manifest.review.json` evidence.

---

## 1. Database integrity

| Area | State | Evidence |
| --- | --- | --- |
| Polymorphic entity model | Sound | `aitask_workspaces` / `aitask_members` / `aitask_entities` (discriminated by `entity_type`); `entity_type` CHECK constraint |
| Real FK chains | Minimal but correct | `members→workspaces` CASCADE, `entities→workspaces` CASCADE, `auth.users` SET NULL, receipts/audit/onboarding FKs |
| Soft referential integrity (`parent_id/assigned_to/created_by/client_id/plan_id/cycle_id`) | **No FK constraints** — enforced by triggers/backfills only (SUP-I1) | `secure-auth-schema.sql`; index set on hot paths present |
| Partial unique indexes | Present | one-active-plan / one-cycle-per-period (`client_service_management.sql:95-101`) |
| Optimistic concurrency | Present | per-row `expectedVersion` preflight + workspace-level lock (5-arg overload) |
| Idempotency | Present | `aitask_command_receipts` + advisory xact lock |
| Migration chain | 109 non-empty files; empty-file hazard resolved (A1) | `pnpm verify:migrations` green |

**Open risk:** SUP-I1 (no FK on entity reference columns) remains by design — orphan prevention depends on application-side cleanup (now strengthened by C2 primaryTaskId clearing and duplicate-name-aware scoping). No new orphan paths were introduced by the verified fixes.

## 2. Migration / deployment state

| Item | Status |
| --- | --- |
| Production verified through | `20261016150000_service_transition_guard` (prod alias `20261016153759`) — manifest `status` + `auditP0P1ProductionRollout.appliedAt 2026-10-16` |
| **Pending production migrations** | **2** — `20261016160000_pm_client_scope_and_ownership`, `20261016170000_department_scoped_visibility_cleanup` |
| Security weight of pending set | `pm_client_scope_and_ownership` closes a **P1 cross-company injection** (PM rename/edit/delete any company via SECURITY DEFINER RPC). **Live exploit remains until deployed.** |
| Live verification (prior rollout) | `tasks:174, projects:71, clients:79, serviceEntities:226`, `workItemsWithoutClientId:0`, `workItemsWithoutClientKey:0`, business hashes unchanged before/after |

## 3. Row Level Security

| Check | Result |
| --- | --- |
| RLS enabled on all app tables | Confirmed (no `USING (true)` / `WITH CHECK (true)` anywhere) |
| Writes revoked from `authenticated`; all writes via RPC | Confirmed (`reliable_workspace_command_cutover.sql`) |
| `anon` policies on secure tables | None (only legacy `aitask_app_state`, revoked by cutover migrations) |
| `FORCE ROW LEVEL SECURITY` | Added on `aitask_entities` client-ownership trigger in the new `pm_client_scope_and_ownership` migration (defence-in-depth for the SECURITY DEFINER path) |
| Storage policies | 4 policies on `client-service-files` guarded by `aitask_can_read_service_file` |
| RPC authorization inside function | Confirmed — `private.aitask_can_mutate_entity`, per-entity checks; no RPC relies on RLS alone |

**Residual:** SUP-R1 (legacy `aitask_app_state` grants) is source-correct (revoked by cutover) and corroborated by manifest `anonymousDirectTableAccess:false`, but an independent live `pg_policies`/`pg_class` re-check is recommended at next deploy.

## 4. Authentication & sessions

- Supabase Auth (`@supabase/supabase-js 2.117.3`); publishable key only in browser (`src/lib/backend.ts:31,48-49`; `supabaseClient.ts:9`).
- Secure mode requires explicit save; auto-sync poll every 15 s + focus/visibility/online events.
- Fail-closed read-only on schema-version mismatch (`upgradeRequired`); `fca797f` adds a `retry_required` state for transient capability errors (`store/index.ts:1320-1327`).
- **Not independently tested live:** token refresh, expiry during DB op, permission change during active session, account deactivation.

## 5. Edge functions

| Function | JWT | Rate limit | State |
| --- | --- | --- | --- |
| `invite-aitask-member` | `verify_jwt=true` | — | `fca797f` hardens request-parse + CORS allowlist (replaces wildcard; needs `AITASK_ALLOWED_ORIGINS`) |
| `aitask-feedback` | `verify_jwt=false` (service-role key) | submit (IP) **and** results (actor+IP) now both limited | `index.ts:112-128,209-225` |

**Caveats:** (a) CORS allowlists differ between feedback function and DB origin list (SUP §6) — keep aligned. (b) `invite-aitask-member` CORS/`AITASK_PUBLIC_URL` must be set before the redeploy of `fca797f`.

## 6. Query efficiency

- Workspace load pages `aitask_members` + `aitask_entities` (500/page) + separate notification feed; entire workspace loaded into memory (growth risk for large tenants).
- 15 s polling continues even when tab hidden (PERF-01 — optional).
- No obvious missing index in static review; **not verified against `pg_stat_statements`.**

## 7. Supabase verification scripts

- `verify:supabase`, `verify:supabase:rollout`, `verify:release-db-alignment`, `verify:release-provenance` exist but require live project credentials — **not run in this review.**

## 8. Conclusion

Backend security architecture is strong and the P0/P1 migrations are verified-applied through `service_transition_guard`. The single material gap is the **2 pending production migrations**, one of which is a P1 security fix (`pm_client_scope_and_ownership`). The DB-layer fixes for GAP-D1/D2 are correct in source but their pgTAP proofs are unrun in this environment.
