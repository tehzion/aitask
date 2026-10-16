# Supabase Security Report — Role-Based Access (AiTask)

**Date:** 2026-10-17 · **Scope:** server-side enforcement of the four-role model. Static review of `supabase/migrations/*` + `migration_repair_manifest.review.json`. **No live project access this session** — runtime items are source + manifest evidence.

---

## 1. Role mapping at the database

- Members row: `role ∈ ('Project Manager','HOD','Staff','Client')` + `is_super_admin` flag (Boss Koo / Super Admin) + `custom_role_id` (builtin-hod etc.). (`secure-auth-schema.sql`, `project_manager_hod_role_model.sql:28-36`.)
- `aitask_has_permission(member, permission)` mirrors the frontend `defaultRolePermissions` with per-role branches (`project_manager_hod_role_model.sql:284-303`).

## 2. Row Level Security

| Check | Result |
| --- | --- |
| RLS enabled on every app table | Confirmed — no `USING (true)` / `WITH CHECK (true)` anywhere (grep clean) |
| Writes revoked from `authenticated`; all writes via RPC | Confirmed (`reliable_workspace_command_cutover.sql:4-5`) |
| `anon` policies on secure tables | None (legacy `aitask_app_state` revoked by cutover migrations) |
| `FORCE ROW LEVEL SECURITY` | Added on `aitask_entities` client-ownership trigger (`pm_client_scope_and_ownership.sql`) |
| Storage policies | 4 policies on `client-service-files` guarded by `aitask_can_read_service_file` |
| Manifest live evidence (prior rollout) | `anonymousDirectTableAccess:false`, `authenticatedDirectTableMutation:false`, `anonymousCommandRpcExecution:false`, `securityDefinerSearchPathsFixed:true` |

## 3. Server-side authorization functions (role enforcement)

| Function | Enforces | Source |
| --- | --- | --- |
| `aitask_has_permission` | Per-role permission grants | `authorization_hardening_followups.sql` |
| `aitask_can_view_task` | View visibility (Boss bypass, PM portfolio, HOD dept, Staff assigned) | `pm_task_company_boundaries.sql` etc. |
| `aitask_can_mutate_entity` | Write authorization per entity + op | `reliable_workspace_commands.sql:362-372` |
| `aitask_can_access_service_client` | Service client access (PM portfolio vs assigned) | `pm_project_service_scope.sql` |
| `aitask_client_command_allowed` | Client approval path (seeded via `set_config`) | `workspace_optimistic_lock.sql` |
| `aitask_can_edit_client` / `aitask_can_create_client` | Company edit/create/ownership freeze | `pm_client_scope_and_ownership.sql` |

Key property: **no RPC relies on RLS alone for writes** — authorization is performed inside the SECURITY DEFINER functions with `SET search_path = ''`.

## 4. Role-specific enforcement (source-verified)

| Control | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| View all tasks/clients | ✓ | ✗ portfolio | ✗ dept | ✗ assigned |
| Company rename/edit/delete | ✓ | own portfolio only | own-assigned only | own-assigned only |
| Company ownership mutation | frozen via trigger | frozen | frozen | frozen |
| Service plan/cycle/prices | ✓ | portfolio only | ✗ | ✗ |
| Member management RPCs | `service_role`-only + super-admin recheck | ✗ | ✗ | ✗ |
| Privilege escalation | `sanitizeRolePermissions` + DB `viewAllTasks`/`viewAllClients` strip for dept-scoped roles | — | — | — |

## 5. Residual risks

- **`service_role` holds `SELECT, UPDATE` on `aitask_members`** (documented least-privilege; write on directory table).
- **4-arg command RPC overloads** bypass the workspace-level version precondition (legacy-client compatibility).
- **2 pending production migrations** (`pm_client_scope_and_ownership`, `department_scoped_visibility_cleanup`) — the first closes a live PM cross-company injection; **not yet applied**.
- Leaked-password protection disabled (plan limit); no scheduled backups (Free plan).

## 6. Conclusion

Server-side role enforcement is present and consistent with the frontend matrix. No server-side bypass or cross-tenant leakage was found in static review. The material open item is deployment (2 pending migrations) and independent live re-verification of RLS/grants, which requires a linked project.
