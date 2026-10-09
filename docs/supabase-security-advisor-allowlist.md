# Supabase Security Advisor review allowlist

This document records warnings reviewed during the v2.3.0 security audit. A
warning is not an approval to ignore new findings: each production release must
run the advisor and compare its output to this list.

## Expected warnings

| Advisor finding | Why it is expected | Release check |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` on AiTask RPCs | Browser roles need the public RPC surface. The functions enforce authentication, workspace membership, Boss Koo or Staff scope, optimistic locking, and command idempotency internally. | Verify every exposed `SECURITY DEFINER` function has `SET search_path = ''`, checks the actor before data access or mutation, and has `anon` execution revoked unless explicitly public. |
| RLS enabled with no policy on deny-by-default operational tables | `aitask_app_state`, command receipts, feedback submissions, and release acknowledgements deliberately have no browser-table grants. Access is only through approved RPCs or service-role jobs. | Confirm `anon` and `authenticated` have no direct table privileges and the intended RPC grants are unchanged. |
| RLS enabled with no policy on `private.aitask_member_onboarding` | The new onboarding journal is deliberately inaccessible directly, including to `service_role`; only service-only security-definer reserve/finalize RPCs and the private Auth trigger access it. | Confirm direct privileges remain revoked, both new public RPCs have only service execution, their search paths are fixed, and replay/ownership tests pass. This entry describes the disposable validation of the pending migration, not a completed production rollout. |

## Never allowlist

- Any anonymous `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grant on secure workspace tables.
- An unfixed `SECURITY DEFINER` search path warning.
- An RLS-disabled table in an exposed schema.
- New public execution of a privileged RPC, Edge Function JWT bypass, or public storage bucket.
- Any warning that is not named above, unless its owner records the reason and a compensating control in this file.

## Required evidence for each release

1. Run the disposable Supabase migration, pgTAP, lint, advisor, and postflight gate.
2. Record the advisor output with the release evidence.
3. Run the anonymous production verifier read-only; it must confirm the secure
   tables, RPC grants, and storage privacy boundaries remain closed.

## Open hosting limitation — 7 October 2026

The AiTask organization is on the Free plan. The live advisor still reports
`auth_leaked_password_protection`; Supabase makes leaked-password protection
available on Pro and above ([official password-security documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

This finding is not added to the expected-warning allowlist and no paid upgrade
or risk exception has been approved by the version 3 code-fix request. Enabling
it requires the owner to authorize/provision the required plan, enable the Auth
setting and rerun the advisor. Existing private workspace grants, guarded RPCs,
password setup and rate limiting remain verified independently; they do not
replace leaked-password screening.

## Version 3 validation — 8 October 2026

The new journal's foreign keys have covering indexes. Its local schema lint has
no findings. Fresh disposable-stack `unused_index` INFO entries do not prove an
index is unnecessary; assess actual hosted workloads before removing indexes.
Neither the leaked-password warning nor the outstanding managed PostgreSQL
security patch is allowlisted. Hosted verification and remediation remain
release requirements.
