# Supabase Architecture Audit — AiTask

**Date:** 2026-10-17 · **Source:** `supabase/secure-auth-schema.sql` + `supabase/migrations/*` + `supabase/preflight/migration_repair_manifest.review.json`.

---

## 1. Tables

| Table | PK | Key constraints | Notes |
| --- | --- | --- | --- |
| `aitask_workspaces` | `id text` | `name not null`, `version bigint default 1`, `sync_protocol_version` | root |
| `aitask_members` | `id text` | `workspace_id → workspaces CASCADE`; `auth_user_id uuid UNIQUE → auth.users SET NULL`; `role CHECK (PM/HOD/Staff/Client)`; `is_super_admin`, `permissions jsonb default '{}'`; `department not null` + `departments text[]` (legacy mirror) | idx `(workspace_id)`, `(auth_user_id)` |
| `aitask_entities` | `(workspace_id, entity_type, entity_id)` | `workspace_id → workspaces CASCADE`; `entity_type CHECK`; `data jsonb`; denormalized `parent_id/client_key/assigned_to/created_by/target_*` | polymorphic row model |
| `aitask_feedback_submissions` | `id uuid default gen_random_uuid()` | strong `CHECK`s (name 2-100, email 5-254, role/device/language enums, jsonb object types); **unique `(campaign, lower(email))`** | public feedback |
| `aitask_command_receipts` / `aitask_audit_events` / `aitask_task_deadline_reminders` / `aitask_feedback_rate_limits` | (see migrations) | idempotency + audit + cron + rate-limit | supporting |
| `private.aitask_internal_review_decisions` / `private.aitask_member_onboarding` | — | FKs to workspaces/members/auth.users | private |

## 2. Relationships & data model

- **Polymorphic entity model**: business records are `aitask_entities` rows discriminated by `entity_type` (`task, project, client, service_package, client_plan, service_cycle, deliverable, cycle_comment, addon, service_workflow_template, service_pricing_snapshot, custom_role, notification`).
- **Soft referential integrity**: `parent_id/assigned_to/created_by/client_id/plan_id/cycle_id` have **no FK constraints** — enforced by triggers/backfills (`aitask_guard_entity` derives denormalized columns) and app-side cleanup. (SUP-I1.)
- Real FK chains are limited and correct: members/entities → workspaces (CASCADE), `auth_user_id` → auth.users (SET NULL).

## 3. Indexes (hot paths covered)

- `aitask_members`: `(workspace_id)`, `(auth_user_id)`.
- `aitask_entities`: `(workspace_id, entity_type)`, `(workspace_id, client_key)`, `(workspace_id, assigned_to)`, `(workspace_id, created_by)`, `(workspace_id, parent_id)`; later `(ws, client_id)`, `(ws, plan_id)`, `(ws, cycle_id)` added by `client_service_management.sql`.
- `aitask_feedback_submissions`: `(campaign, submitted_at desc)`, `(campaign, role)`, unique `(campaign, lower(email))`.
- `aitask_audit_events`: `(workspace_id, occurred_at desc)`, `(workspace_id, entity_type, entity_id)`, `(actor_member_id)`.
- No obvious missing index in static review; live `pg_stat_statements` not inspected.

## 4. Functions & triggers (SECURITY DEFINER, `SET search_path = ''`)

| Object | Purpose | Safety |
| --- | --- | --- |
| `private.aitask_member_id/role/client_key/is_admin/is_super_admin` | identity helpers | revoked from public; granted to authenticated |
| `private.aitask_has_permission` | per-role permission grants | rewritten by `project_manager_hod_role_model.sql` |
| `private.aitask_can_view_task/edit_task/view_client/edit_client/view_project` | per-entity authorization | rewritten/hardened by scope migrations |
| `private.aitask_guard_member_update` | blocks self-escalation of role/permissions/`is_super_admin` | before-update trigger |
| `private.aitask_guard_entity` | blocks secret-like `data` keys; admin-only client rename; derives denormalized columns | before insert/update |
| `private.aitask_guard_service_status` / `aitask_guard_task_stage_progress` | transition + completion integrity | command-scoped triggers |

## 5. Migration history / schema drift

- ~109 migrations, ordered and reproducible (`supabase db push`); `verify:migrations` guards non-empty files; pgTAP runs in CI disposable stack.
- **Drift finding (P2):** `secure-auth-schema.sql` is the *initial* snapshot and its `aitask_can_view_task` returns `true` for **any** Project Manager, and `aitask_can_edit_client` returns `true` via `aitask_is_admin` (PM=true). The hardened portfolio scope lives **only in later migrations** (`pm_portfolio_service_boundaries.sql`, `pm_task_company_boundaries.sql`, `pm_client_scope_and_ownership.sql`). **Never deploy the base schema without the full migration chain.** The manifest's `liveVerification` confirms the hardened state is applied in production.

## 6. Conclusion

Schema is sound for the polymorphic model; the two material risks are (a) soft FK integrity (accepted by design, mitigated by triggers + app cleanup) and (b) the base-schema-vs-migration drift above (mitigated by the enforced migration chain). No schema redesign warranted.
