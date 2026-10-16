# Supabase RLS & Security Report — AiTask

**Date:** 2026-10-17

## 1. RLS posture

| Table | RLS | Policies (authenticated) | Verdict |
| --- | --- | --- | --- |
| `aitask_workspaces` | enabled | SELECT where member of workspace | PASS |
| `aitask_members` | enabled | SELECT (directory); INSERT/UPDATE (super-admin, or self for profile); DELETE (super-admin, not self) | PASS |
| `aitask_entities` | enabled | SELECT/INSERT/UPDATE/DELETE via `aitask_can_view_task/edit_task/view_client/edit_client/view_project` + `aitask_is_admin`/`aitask_has_permission`; notification rows scoped to `target_user_id`/`target_role`/`target_client_key` | PASS |
| `aitask_feedback_submissions` | enabled | revoked from public/anon/authenticated; `service_role` select+insert only | PASS |
| `aitask_audit_events` / `aitask_command_receipts` / private tables | enabled | admin-read / `service_role`-write | PASS |

- **No `USING (true)` / `WITH CHECK (true)`** anywhere (grep-clean).
- **No `anon` policies** on secure tables (legacy `aitask_app_state` revoked by cutover).
- **Writes to `aitask_entities`/`aitask_members` are policy-gated**, but the primary write path is the SECURITY DEFINER command RPC (`aitask_execute_command`), which re-checks authorization internally — no RPC relies on RLS alone.

## 2. Role access matrix (enforced server-side)

| Capability | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| View all tasks | ✓ (`is_super_admin`) | portfolio (`pm_task_company_boundaries`) | dept | assigned/created |
| Edit any task | ✓ | portfolio/assigned | dept/assigned | assigned/created |
| Edit/delete client | ✓ | own/portfolio (`pm_client_scope_and_ownership`) | own-assigned | own-assigned |
| Manage members | ✓ (service_role RPC, super-admin recheck) | ✗ | ✗ | ✗ |
| Privilege escalation (self) | — | blocked | blocked | blocked (`aitask_guard_member_update`) |

## 3. SECURITY DEFINER & search path

- All SECURITY DEFINER functions use `SET search_path = ''` (verified in schema + `manifest.liveVerification.securityDefinerSearchPathsFixed: true`).
- All `private.aitask_*` helpers `revoke all ... from public` and `grant execute ... to authenticated`; private functions are not browser-callable directly except as policy predicates.

## 4. Secret handling

- No service-role key in `src/` (only publishable key via `src/lib/backend.ts`); service-role key exists only server-side (edge functions, CI secrets without `VITE_` prefix).
- `aitask_guard_entity` rejects entity `data` keys matching `password|secret|token|api_key|service_role`.

## 5. Storage security

- Private bucket; 4 policies on `client-service-files/{workspace}/{client}/{cycle}` guarded by `aitask_can_read_service_file` / `aitask_can_access_service_client`; delete hardened in `service_upload_reconciliation.sql`.
- 100 MB cap; allowed MIME types: pdf/jpeg/png/webp/gif (manifest `serviceInfrastructure`).

## 6. Residual / findings

| Priority | Finding |
| --- | --- |
| P1 | `pm_client_scope_and_ownership` + `department_scoped_visibility_cleanup` **not applied to production** (first closes a live PM cross-company edit/delete/re-own hole in the SECURITY DEFINER service RPC). |
| P2 | Base `secure-auth-schema.sql` alone has unscoped PM access (`can_view_task → true`); hardened only by the migration chain — never deploy the base schema in isolation. |
| P2 | `service_role` holds `SELECT, UPDATE` on `aitask_members` (documented least-privilege). |
| P3 | 4-arg command RPC overloads bypass the workspace-level version precondition (legacy-client compatibility). |

## 7. Verdict

RLS is comprehensive and role-correct; no cross-tenant or privilege-escalation path was found in static review. The one live gap is the unapplied `pm_client_scope_and_ownership` migration (P1 security). Independent live RLS/grants re-check still recommended at next deploy (this session had no live project access; manifest evidence only).
