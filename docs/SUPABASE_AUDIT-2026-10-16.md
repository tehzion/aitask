# AiTask — Supabase / Database Audit

**Date:** 2026-10-16 · **Focus:** production "secure workspace" path
**Method:** static analysis of schema, migrations, RLS policies, RPCs, edge functions and preflight manifests. **No live project access** — runtime items are *Unverified*.

---

## 1. Schema map

Polymorphic workspace model: almost all workspace data is rows in **one** table discriminated by `entity_type`.

| Object | PK | Relationships / indexes | Source |
| --- | --- | --- | --- |
| `public.aitask_workspaces` | `id text` | root of the workspace | `secure-auth-schema.sql:6-13` |
| `public.aitask_members` | `id text` | `workspace_id → workspaces CASCADE`; `auth_user_id uuid UNIQUE → auth.users SET NULL`; idx `(workspace_id)`, `(auth_user_id)` | `secure-auth-schema.sql:15-36` |
| `public.aitask_entities` | `(workspace_id, entity_type, entity_id)` | `workspace_id CASCADE`; `entity_type` CHECK; idx `(ws,entity_type)`, `(ws,client_key)`, `(ws,assigned_to)`, `(ws,created_by)`, `(ws,parent_id)`, `(ws,client_id)`, `(ws,plan_id)`, `(ws,cycle_id)` | `secure-auth-schema.sql:38-63`; `client_service_management.sql:85-104` |
| `public.aitask_feedback_submissions` | `id uuid` | unique `(campaign, lower(email))` | `secure-auth-schema.sql:65-89` |
| `public.aitask_command_receipts` | `(workspace_id, actor_member_id, command_id)` | FKs CASCADE | `reliable_workspace_commands.sql:15-23` |
| `public.aitask_audit_events` | `id uuid` | `actor_member_id SET NULL`; idx `(ws,occurred_at desc)` | `reliable_workspace_commands.sql:25-45` |
| `public.aitask_task_deadline_reminders` | `(ws, task_id, due_date, type)` | — | `server_reminders_and_feedback_rate_limit.sql:10-21` |
| `public.aitask_feedback_rate_limits` | `key_hash text` | regex `^[0-9a-f]{64}$` | `server_reminders_and_feedback_rate_limit.sql:27-35` |
| `private.aitask_internal_review_decisions` | `decision_id uuid` | `workspace_id CASCADE` | `workflow_internal_review_gate.sql:2-13` |
| `private.aitask_member_onboarding` | `command_id uuid` | FKs to workspaces/members/auth.users | `reliable_member_onboarding.sql:2-19` |
| `public.aitask_app_state` (LEGACY) | `id text` | JSON `state` blob | `schema.sql:1-6` |

`entity_type` covers `task, project, client, service_package, client_plan, service_cycle, deliverable, cycle_comment, addon, service_workflow_template, service_pricing_snapshot, custom_role, notification` (`client_service_management.sql:4-10`).

---

## 2. RLS & access control

**Strengths (Confirmed).**
- RLS is **enabled on every app table** (`secure-auth-schema.sql:449-451`; `reliable_workspace_commands.sql:47-48`; private tables).
- **No `USING (true)` / `WITH CHECK (true)`** policies exist anywhere (grep clean).
- **No `anon` policies** on secure tables; the only `to anon` grants are on the **legacy** `aitask_app_state`, revoked by cutover migrations (`reliable_workspace_command_cutover.sql:7-11`, `harden_legacy_access_privileges.sql:6-9,21`, `secure-cutover.sql:4-18`).
- Writes were **revoked from `authenticated`**; all writes go through RPCs (`reliable_workspace_command_cutover.sql:4-5`).
- One **restrictive** policy bounds PM commercial records to their portfolio (`pm_portfolio_service_boundaries.sql:4-17`) — the only `as restrictive` policy in the repo.
- Storage: 4 bucket policies on `client-service-files/{workspace}/{client}/{cycle}` guarded by `aitask_can_read_service_file` / `can_access_service_client` (+ owner) (`client_service_management.sql:704-739`; delete hardened in `service_upload_reconciliation.sql:96-112`).
- The browser uses **only** the publishable key; **no service-role key in `src`** (`backend.ts:31,48-49`; `supabaseClient.ts:9`).

**Risks.**
- **SUP-R1 (Medium, Potential):** legacy `aitask_app_state` retains `grant select,insert,update to anon, authenticated` + Origin-header policies in `schema.sql:13,100,113-145` and `legacy_snapshot_baseline.sql:14,107-139`. Safety depends entirely on cutover migrations being applied to the live project. `Origin` is explicitly **not** an authorization boundary (`schema.sql:105-108`). *Unverified whether applied live.*
- **SUP-R2 (Medium, Confirmed code):** `aitask-feedback` is `verify_jwt=false` (`config.toml:4-5`) and uses the **service-role key** server-side (`functions/aitask-feedback/index.ts:59-62`). Its `submit` branch is origin-allowlisted, 256 KB-capped, honeypotted and IP-rate-limited; the **`results` branch has no rate limit** (`:167-190`).
- **SUP-R3 (Low/Medium, Potential):** `service_role` holds `SELECT, UPDATE` on `aitask_members` (`service_role_member_grants.sql:12`), narrowed by `service_role_least_privilege.sql:9`. Documented least-privilege, but it is write capability on the directory table.
- **SUP-R4 (Low, Confirmed):** no `FORCE ROW LEVEL SECURITY` on secure tables (only the legacy snapshot). Standard for SECURITY DEFINER designs; note for defence-in-depth.

---

## 3. Command RPC pattern

- Primary write path: `public.aitask_execute_command(workspace_id, command_id uuid, command_type, operations jsonb)` — `SECURITY DEFINER`, `SET search_path = ''` (`reliable_workspace_commands.sql:256-524`).
- **Idempotency:** advisory xact lock on `ws||':'||command_id`, replay from `aitask_command_receipts`, receipt written at commit (`:315-325,513-514`).
- **Optimistic concurrency:** preflight compares each op's `expectedVersion` against the row before any write, returning `CONFLICT` + `actualVersion` (`:328-397`). A **workspace-level lock** was added via the 5-arg overload (`workspace_optimistic_lock.sql:13-163`).
- **Authorization inside the function:** each entity op is gated by `private.aitask_can_mutate_entity(...)` (`:362-372`); member ops require `is_admin` or self (`:388-391`). The service counterpart performs per-entity checks (`client_service_management.sql:353-437`). **No RPC relies on RLS alone for writes.**
- Client approval seeds `set_config('aitask.client_command_allowed', ...)` from `private.aitask_client_command_allowed(...)` (`workspace_optimistic_lock.sql:94-98,156-158`; enforced in `client_portal_review_privacy.sql:245-295`).
- Service-role RPCs (`aitask_reserve_member_onboarding`, `aitask_finalize_member_invitation_v3`, `aitask_update_member_email`, `aitask_delete_member_account`) are `grant ... to service_role` only and re-check super-admin (`reliable_member_onboarding.sql:52-54,87-88,125-126`).

**Note (Confirmed):** the 4-arg overloads (`aitask_execute_command`, `aitask_execute_service_command`) are retained "for older clients" and **bypass the workspace-level version precondition** (`workspace_optimistic_lock.sql:8-11`). This is intentional compatibility but is a weakened-concurrency surface if ever reachable by a current client.

---

## 4. Data integrity

**Strengths.** Only real FK chains are `members→workspaces` (CASCADE), `entities→workspaces` (CASCADE), `auth.users` (SET NULL), plus receipt/audit/onboarding/review FKs. Hot-path indexes exist for the polymorphic table. Partial unique indexes enforce one-active-plan and one-cycle-per-period (`client_service_management.sql:95-101`).

**Risks.**
- **SUP-I1 (Medium, Confirmed):** no FK constraints on `aitask_entities.parent_id/assigned_to/created_by/client_id/plan_id/cycle_id`; referential integrity is soft (JSON + denormalized columns) and enforced by triggers/backfills only. Orphan risk is real, especially with `primaryTaskId` dangling client-side (BUG-09).
- **SUP-I2 (Critical, Confirmed source):** `supabase/migrations/20261015140049_monthly_plan_revision_scheduling.sql` is **0 bytes** yet appears in the validated tail and `pendingProductionMigrations` (`migration_repair_manifest.review.json`). Intended DDL is missing; repair/replay hazard.
- **SUP-I3 (High, Confirmed source):** **9 pending production migrations** already carry fixes for live issues (e.g. `20261015014716_pm_task_company_boundaries` closes a PM cross-company task-name/ID injection per `docs/pm-role-deep-audit-2026-10-15.md`). Until applied, those defects remain live.
- **SUP-I4 (Low):** cascade on member delete **SET NULL**s `audit_events.actor_member_id` and `onboarding.auth_user_id`, so audit attribution degrades after account deletion (by design, note only).

---

## 5. Query efficiency
- Workspace load pages `aitask_members` + `aitask_entities` at 500 rows/page and separately loads the notification feed; notifications are excluded from the entity page query and reconstructed (`store/index.ts:1637`; `secureWorkspace.ts:1633,1657-1665`). Efficient enough, but the **entire workspace is loaded into memory** — growth risk for large tenants.
- Auto-sync polls every 15s plus focus/visibility/online events (`store/index.ts:6035`), and secure mode still runs the poll loop even though saves are explicit. Consider pausing the poll when the tab is hidden (`visibilitychange` already handled for reminders only).
- Indexes cover the documented hot paths; no obvious missing index found in static review. **Unverified against live `pg_stat_statements`.**

---

## 6. Edge functions

| Function | JWT | Auth | Validation | Notes |
| --- | --- | --- | --- | --- |
| `invite-aitask-member` | `verify_jwt=true` (`config.toml:1-2`) | Bearer + actor/super-admin check (`index.ts:84-117,166-169`) | email regex, department normalization, custom-role checks, UUID command id, ≥12-char temp password (`:205-268,306,338`) | Uses service-role key; idempotent reservation/finalize with retry. Good. |
| `aitask-feedback` | `verify_jwt=false` (`config.toml:4-5`) | submit: public (origin allowlist); results: Bearer + reviewer/Boss (`:167-183`) | body cap 256 KB, honeypot, per-IP SHA-256 rate limit on submit, duplicate-email guard | **No rate limit on `results`** (SUP-R2). Uses service-role key. |

CORS allowlists differ between the feedback function (`index.ts:4-10`) and the DB origin list — narrower in the function. Keep them aligned.

---

## 7. Migration chain
- ~90 migrations, mostly additive and idempotent (recreate-policy / `create or replace function`).
- **Empty-file hazard (SUP-I2)** and **pending backlog (SUP-I3)** are the two actionable items.
- Legacy compatibility retained: `aitask_app_state` table + `aitask_app_state_health()` + `aitask_is_internal_app_origin()` remain defined (privileges revoked post-cutover); `role = 'Admin'` still referenced in some rewritten policy bodies though the member CHECK is now `('Project Manager','HOD','Staff','Client')` (`secure-auth-schema.sql:21`). Cosmetic but confusing.
- `system-hod`/`builtin-hod` custom-role compatibility retained for historical records (`harden_legacy_access_privileges.sql:51-58`).

---

## 8. Supabase recommendations
1. **P0** Confirm/repair or delete the empty migration; schedule the 9 pending migrations behind the documented preflight + backup gate (`docs/production-rpc-mismatch-recovery.md`).
2. **P0** Verify live that `aitask_app_state` anon/authenticated grants are revoked and that no `service_role` grants beyond the documented `SELECT, UPDATE` on `aitask_members` remain.
3. **P1** Add an IP/actor rate limit to the `aitask-feedback` `results` branch.
4. **P1** Audit production for orphaned `primaryTaskId` / missing `client_id` and for duplicate client names (name-keyed authorization risk from `docs/pm-company-delete-audit-2026-10-15.md`).
5. **P2** Consider `FORCE ROW LEVEL SECURITY` on secure tables and retire the 4-arg command overloads once no old clients remain.
6. **P2** Validate service collections in `parseWorkspaceSnapshot` rather than casting through (SYN-04).
