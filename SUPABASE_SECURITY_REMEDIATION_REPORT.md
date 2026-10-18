# Supabase Security Advisor Remediation Report

Assessment date: 2026-10-18 (Asia/Kuala_Lumpur)  
Project: `AiTask` (`ohjhwyiffgzyatcmmdql`)  
Region: `ap-southeast-1`  
Database: PostgreSQL 17.6.1.121  
Assessment mode: read-only production inspection plus source-only remediation

## Executive decision

The 19 `authenticated_security_definer_function_executable` findings are not
19 independent defects. They are an intentional application RPC boundary: the
functions perform controlled writes or scoped reads that cannot rely solely on
the caller's table-level RLS context. Each function has an empty
`search_path`, and the live definitions inspected during this assessment all
perform caller, workspace, membership, role, permission, object, or ownership
checks before privileged work.

The correct disposition is therefore:

1. Keep the 19 functions as `SECURITY DEFINER` application RPCs.
2. Do not apply a blanket `REVOKE EXECUTE` or change them all to
   `SECURITY INVOKER`; that would either break the application or remove the
   intended authorization boundary.
3. Add explicit RPC-level checks for the confirmed legacy service-delete and
   generated-task reference-integrity gaps.
4. Fail closed when the current client-name-to-workspace mapping is ambiguous.
5. Keep leaked-password protection as an explicit residual risk until the
   Supabase organization is on a plan that supports the feature and it is
   enabled.

The source migration is
`supabase/migrations/20261018120000_harden_security_definer_rpc_boundaries.sql`.
It has **not** been applied to production by this task. No production rows,
functions, triggers, or settings were changed.

The missing staging project is intentionally recorded as a release-process
boundary, not as work this agent must resolve. The release owner must provide
an approved disposable or staging database before applying the migration and
running the database regression suite. This report does not provision,
repair, or attempt to discover another staging project.

## Live Security Advisor snapshot

The read-only live inspection observed:

| Advisor finding | Count | Disposition |
|---|---:|---|
| Authenticated users can execute `SECURITY DEFINER` functions | 19 | Intentional RPC boundary; individually reviewed below; source hardening added where needed |
| RLS enabled without policies | 9 | Existing internal/system tables; retain only after confirming they are not client-facing |
| Leaked password protection disabled | 1 | Plan/configuration limitation; remains open |

The Security Advisor warning is useful because it identifies functions that
need manual review, but it does not establish that a function is exploitable.
The relevant Supabase guidance is [SECURITY DEFINER function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [leaked password protection](https://supabase.com/docs/guides/auth/password-security).

## Classification legend

* **A — Intentional privileged RPC, retained.** The function is a deliberate
  authenticated application boundary and contains its own authorization and
  object-scope checks.
* **A+ — Intentional privileged RPC with source hardening.** The design is
  retained, but the new source migration adds a missing authorization or
  integrity invariant.
* **R — Residual operational risk.** The function is not currently classified
  as an exploitable privilege escalation, but deployment, data repair, or
  compatibility work remains necessary.

## Complete 19-function review

The signatures below are the exact public signatures returned by the live
Advisor review. The two four-argument and five-argument command families are
separate overloads and are listed separately.

| Function/signature | Classification | Evidence and disposition |
|---|---|---|
| `public.aitask_acknowledge_release_notice(text,text)` | A | Requires an authenticated `auth.uid()`, resolves the member in the supplied workspace, checks the allowlisted notice ID, and records an idempotent acknowledgement. Retain. |
| `public.aitask_complete_password_setup(text,uuid)` | A | Requires the authenticated user to own the target member row, locks the member, verifies the reset state, and audits the change. Unauthenticated and cross-member calls are rejected. Retain. |
| `public.aitask_execute_command(text,uuid,text,jsonb)` | A+ | General command dispatcher with member/workspace context and entity authorization. The four-argument form is a compatibility overload without the newer expected-workspace-version input; retain pending telemetry and a compatibility window. |
| `public.aitask_execute_command(text,uuid,text,jsonb,bigint)` | A | Newer command dispatcher with expected workspace-version handling, context seeding, idempotency, version checks, and delegated authorization. Retain. |
| `public.aitask_execute_service_command(text,uuid,text,jsonb)` | A+ | Service write boundary with member/client/operation checks. Source hardening now adds an RPC-level PM portfolio check before service updates/deletes, including the legacy four-argument delete path. Retain. |
| `public.aitask_execute_service_command(text,uuid,text,jsonb,bigint)` | A+ | Current service write boundary with workspace locking and expected-version handling. Source hardening adds the same PM portfolio check and coherent generated-task reference validation. Retain. |
| `public.aitask_generate_deliverable_task_chain(text,uuid,jsonb)` | A+ | Delegates to the legacy service-command path. Source hardening reaches it through the service-command checks and rejects forged or cross-client cycle/deliverable references. Retain pending compatibility telemetry. |
| `public.aitask_generate_deliverable_task_chain(text,uuid,jsonb,bigint)` | A+ | Delegates to the version-aware service-command path. The same coherent client → service cycle → deliverable invariant is enforced by source migration. Retain. |
| `public.aitask_get_backend_capabilities(text)` | A | Read-only capability response scoped to an authenticated workspace member and intended backend feature flags. Retain; continue to ensure no secrets are returned. |
| `public.aitask_get_release_notice_acknowledgement(text,text)` | A | Requires authenticated workspace membership and returns acknowledgement state for an allowlisted notice. Retain. |
| `public.aitask_get_workflow_task_context(text)` | A | Read-only workflow context lookup with authenticated member/workspace checks and scoped task context. Retain. |
| `public.aitask_read_client_portal(text)` | A+ | Requires a client member and scopes task/project/service reads to the member's normalized client mapping. Source hardening now fails closed when more than one canonical client row matches the normalized key. |
| `public.aitask_reconcile_service_upload(text,uuid,text,boolean)` | A | Requires authenticated ownership of the upload, member/client scope, workspace/path validation, path locking, and idempotent reconciliation. Retain. |
| `public.aitask_set_deliverable_status(text,uuid,text,bigint,text)` | A | Performs a scoped target pre-read and delegates to the service command boundary; expected versions and service permissions are enforced by the delegate. Retain. |
| `public.aitask_set_notifications_read(text,uuid,text[],boolean,boolean)` | A | Requires member scope, bounds the notification ID list, checks audience/ownership, locks the receipt operation, and is idempotent. Retain. |
| `public.aitask_set_service_cycle_status(text,uuid,text,bigint,text)` | A | Performs a scoped target pre-read and delegates to the service command boundary; expected versions and service permissions are enforced by the delegate. Retain. |
| `public.aitask_update_member_departments(text,uuid,text,text[],bigint)` | A | Requires an actor member with `is_super_admin = true`, locks the workspace/target, validates the target version, and audits the update. PM, HOD, Staff, Client, and zero-permission actors are denied. Retain. |
| `public.aitask_update_member_permissions(text,uuid,text,jsonb,bigint)` | A | Requires a super-admin actor, validates the permission-key set, locks the target, checks the expected version, and audits the update. Retain. |
| `public.aitask_update_member_role(text,uuid,text,text,text,text,text[],bigint)` | A | Requires a super-admin actor, validates role and related fields, locks the target, checks the expected version, and audits the update. Retain. |

Live catalog checks also confirmed that all 19 are `prosecdef`, have
`search_path=""`, do not grant `EXECUTE` to `anon`, and currently grant the
authenticated application role access. The empty search path is important: it
prevents an attacker from shadowing unqualified objects through a mutable
function search path. It does not replace the need for the explicit
authorization checks described below.

## Confirmed gaps and source remediation

### 1. Legacy service child delete was not fully bound to a PM portfolio

The live service command family correctly checked authentication, membership,
operation shape, service permissions, entity versions, and idempotency. The
existing PM service-scope trigger covered service inserts and updates, but did
not cover deletes. Because the function is `SECURITY DEFINER`, a missing RPC
authorization check could allow an RLS-bypassing delete path to reach a child
service entity outside a Project Manager's portfolio.

The source migration adds private helper
`private.aitask_service_target_in_scope(...)` and inserts it into both service
command overloads before the write. For Project Managers it requires:

* delete: the old target's `clientId` is in the PM's portfolio;
* update: old and new client IDs are identical and both are in the portfolio;
* insert: existing service insert checks remain authoritative.

Super-admin and non-PM service authorization behavior is preserved. The new
database regression test includes a foreign `service_cycle` delete through the
legacy four-argument overload and asserts both rejection and no side effect.

### 2. Generated task references were not proven to form one object chain

The generated-task path checked that client, service-cycle, and deliverable
IDs were non-empty and that the actor could access the client. That is not
enough when the write executes as a definer: a caller could submit IDs from
different client/cycle relationships unless the function proves the linkage.

The source migration adds
`private.aitask_generated_task_references_are_valid(...)`. It requires a
single workspace-local chain:

`client.entity_id = data.clientId` →
`service_cycle.client_id = client.entity_id` →
`deliverable.client_id = client.entity_id` and
`deliverable.cycle_id = service_cycle.entity_id`.

The check is added to both service command overloads, which covers both
deliverable-task-chain overloads through delegation.

### 3. Ambiguous client portal mapping now fails closed

The live database contains duplicate normalized canonical client keys in the
`aitask-main` workspace:

* `le motor`: `CL-1792042519625-t499q` and
  `CL-migrated-79a8ac767300c08a4ba67c18`;
* `lumea skin lab sdn bhd`: `CL-1789636987542-u8qh6` and
  `CL-1790583083252-76vlv`.

Related entities are split across the duplicate `le motor` rows. The existing
client portal lookup used `LIMIT 1`, so a client account whose normalized name
matched one of these keys could receive an ambiguous or incorrect workspace
view. The source migration counts canonical matches and raises
`42501 / Client workspace mapping is unavailable.` unless exactly one row
matches. It does not alter production data.

The duplicate rows require a separately approved data-repair decision: identify
the authoritative client row, re-point or archive dependent entities, repair
the member mapping, and only then consider a uniqueness constraint. No such
production repair was performed here.

## Permission and scope checks

The following outcomes were verified from the live function definitions and
their called private helpers:

| Caller or scenario | Expected result | Assessment |
|---|---|---|
| Unauthenticated caller | Reject all member/client mutation RPCs | Confirmed in function logic; regression test added for password setup |
| Staff promotes a member or changes administrative role | Reject | Confirmed: member-admin RPCs require a super-admin actor |
| HOD grants administrative permissions | Reject | Confirmed: member-admin RPCs require a super-admin actor |
| Project Manager changes member departments | Reject | Confirmed: department RPC requires a super-admin actor |
| Client changes staff role or permissions | Reject | Confirmed: member-admin RPCs require a super-admin actor |
| Zero-permission custom role attempts admin mutation | Reject | Covered by the same actor requirement; no role name alone grants authority |
| PM modifies service work outside portfolio | Reject | Existing service checks plus new source RPC target check |
| PM deletes a foreign service child through four-argument compatibility RPC | Reject | New source check; regression test added |
| Forged client/cycle/deliverable combination | Reject | New source chain-integrity helper |
| Client portal with duplicate normalized mapping | Reject closed | New source ambiguity check |
| Replayed command or stale entity/workspace version | Reject or return idempotent receipt | Existing command/service locking and version checks |

The four-argument compatibility overloads remain callable because they are
still referenced by existing database tests and may be used by older clients.
The current frontend sends the five-argument version-aware forms. Removing the
legacy overloads is a separate release task requiring telemetry and a
compatibility window; it is not part of this remediation.

## Password-security warning

The live organization is on the Free plan, and the live Advisor still reports
leaked password protection as disabled. Supabase documents the breached-password
check as a plan-gated feature using Have I Been Pwned. No production setting was
changed because the current plan does not expose the control.

Current compensating controls observed in source include a minimum password
length, current-password or reauthentication requirements for sensitive
changes, reset-on-first-login handling, and filtering of password-like values
from logs and error responses. These controls reduce risk but do not detect
credentials that have appeared in a breach corpus.

Required release action: when the organization is eligible, enable leaked
password protection in Auth settings, then verify the Advisor warning clears
and test sign-up/password-change behavior. Until then, track this as a known
residual risk rather than representing the project as fully password-secure.

## Validation performed

### Read-only production evidence

* Listed the connected Supabase projects; no separate staging project was
  available in the connected account.
* Read the AiTask project, organization plan, migration history, live Advisor
  findings, function catalog, function definitions, relevant triggers, and
  duplicate client-key data.
* Confirmed all 19 Advisor functions have an empty `search_path`, no anonymous
  execute grant, and intentional authenticated application access.
* Confirmed the source migration's function-definition anchors are present in
  both live service overloads and in the live client portal definition. This is
  a preflight check only; it is not evidence that the migration was applied.

### Repository gates

These local gates passed:

* `git diff --check`
* `pnpm verify:migrations`
* `pnpm test` — 107 test files, 830 tests passed
* `pnpm check`
* `pnpm lint`
* `pnpm build`

The new SQL regression file was not executed against a database because there
was no local database or approved staging/disposable project available. The
`supabase` CLI is not installed in this workspace, and no production migration
was applied as a substitute.

A local Playwright run was attempted with a local Vite server. It was
interrupted after reaching the final client-locale group and ended with:

* 310 passed;
* 1 failed: `e2e/role-reports.spec.ts` expected the seeded “Due tasks” count;
* 1 interrupted: `e2e/ui-message-audit.spec.ts` for Client `zh` could not find
  `main` before interruption;
* 12 not run.

Those E2E results are recorded as an incomplete/non-clean run. They are not
attributed to the SQL remediation without a separate diagnosis.

## Release procedure and acceptance criteria

The migration should be handled by the normal reviewed release process:

1. Apply the source migration to an approved disposable or staging database.
2. Run `supabase/tests/database/security_definer_rpc_boundaries.test.sql`
   with the project's normal pgTAP/database test runner.
3. Run both Security Advisors and inspect the resulting function privileges,
   `search_path`, policies, and trigger behavior.
4. Exercise positive and negative service, client portal, generated-task, and
   member-administration cases with representative roles.
5. Review the duplicate-client repair plan separately; do not silently merge
   or delete production entities.
6. Obtain the production migration approval required by the release process,
   then apply the migration through the project's normal migration mechanism.
7. Re-run Advisors and the regression suite after deployment, and attach the
   results to the release record.

Acceptance requires the source migration to apply cleanly, the SQL regressions
to pass, foreign PM deletes and forged task chains to be rejected without side
effects, ambiguous portal mappings to fail closed, and no regression in
authorized same-portfolio operations.

## Remaining residual risks

* The Security Advisor may continue to report the 19 intentional authenticated
  `SECURITY DEFINER` functions because the linter cannot infer their complete
  authorization logic. The report and per-function inventory are the manual
  disposition for those findings.
* Leaked password protection remains unavailable on the current plan.
* Nine RLS-without-policy informational findings still require ownership review
  to ensure the affected tables are not exposed through another endpoint.
* Duplicate canonical client names remain in production until a separately
  approved data repair is completed. The new portal behavior fails closed but
  does not repair the data model.
* Four-argument compatibility overloads remain part of the public surface until
  usage telemetry supports retirement.
* Read-only wrappers that pre-read a target before delegating can disclose
  limited existence information through their response timing or error shape;
  this was not treated as a confirmed cross-workspace data read in this
  assessment and should be reviewed if the threat model requires strict
  object-existence indistinguishability.

