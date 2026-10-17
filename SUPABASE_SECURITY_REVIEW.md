# Supabase Security Review

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Project:** `ohjhwyiffgzyatcmmdql` (`AiTask`)
**Scope:** Remaining production security blockers only

## Leaked-password protection

The production organization is on the Supabase **Free** plan. Current Supabase Auth documentation states that leaked-password protection is available on the Pro plan and above. No supported project-level toggle is exposed through the connected management tools for this Free-plan organization, so this blocker could not be enabled without a plan change or owner-approved alternative.

Existing compensating controls verified in source:

- New and reset passwords are required to contain at least 12 characters.
- Password changes require the current password for hosted accounts.
- Invited accounts use reset-on-first-login controls.
- Passwords are stripped from persisted application snapshots and sensitive-key filters reject password/token/secret fields.

These controls reduce risk but do not detect passwords present in breach corpora. Gate result: **BLOCKED — platform plan limitation**.

## Security-definer advisor findings

The production Security Advisor reported 19 authenticated `SECURITY DEFINER` functions. A catalog review checked each affected function for owner, search path, anonymous execution, and authorization/delegation signals.

| Control | Result |
| --- | --- |
| Owner | All reviewed functions are owned by `postgres`. |
| Search path | All reviewed functions have `search_path = ""`, preventing attacker-controlled name resolution. |
| Anonymous execution | `anon` execution is false for every reviewed function. |
| Authenticated execution | Only intended application RPCs are executable by `authenticated`; internal helpers and legacy support functions are not. |
| Authorization | Direct checks use `auth.uid()` and workspace membership where applicable. Command/service wrappers delegate to guarded internal functions that enforce workspace membership, role/capability, scope, expected versions, and idempotency. |
| RLS interaction | The elevated boundary is intentional for atomic command processing; direct table access remains governed by RLS and grants. |

The 19 reviewed RPCs are:

- `aitask_acknowledge_release_notice`
- `aitask_complete_password_setup`
- `aitask_execute_command` (two overloads)
- `aitask_execute_service_command` (two overloads)
- `aitask_generate_deliverable_task_chain` (two overloads)
- `aitask_get_backend_capabilities`
- `aitask_get_release_notice_acknowledgement`
- `aitask_get_workflow_task_context`
- `aitask_read_client_portal`
- `aitask_reconcile_service_upload`
- `aitask_set_deliverable_status`
- `aitask_set_notifications_read`
- `aitask_set_service_cycle_status`
- `aitask_update_member_departments`
- `aitask_update_member_permissions`
- `aitask_update_member_role`

The advisor is correctly identifying a privileged boundary, but the evidence does not justify removing `SECURITY DEFINER` from these RPCs. No migration was applied to silence the warning. Gate result: **PASS — reviewed, with ongoing monitoring required**.

## Residual review note

The intent-specific deliverable and service-cycle wrappers read the target row before delegating to the guarded service command. They do not return row contents, but their `NOT_FOUND` versus authorization response is a potential existence side channel. This is a defense-in-depth improvement candidate and should be addressed in a separately reviewed migration if the business accepts a generic “record unavailable” response. It was not changed in this pass because staging role tests and a migration approval were unavailable.

## Evidence

- Supabase organization query: plan `free`.
- Production Security Advisor: 19 authenticated security-definer warnings, 9 RLS-without-policy informational findings, and 1 leaked-password warning.
- Production catalog query: all 19 reviewed RPCs owned by `postgres`, `search_path = ""`, and `anon_execute = false`.
- Source checks: password minimum/reset controls and sensitive snapshot filtering.
