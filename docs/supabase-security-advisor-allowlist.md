# Supabase Security Advisor review allowlist

This document records warnings reviewed during the v2.3.0 security audit. A
warning is not an approval to ignore new findings: each production release must
run the advisor and compare its output to this list.

## Expected warnings

| Advisor finding | Why it is expected | Release check |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` on AiTask RPCs | Browser roles need the public RPC surface. The functions enforce authentication, workspace membership, Boss Koo or Staff scope, optimistic locking, and command idempotency internally. | Verify every exposed `SECURITY DEFINER` function has `SET search_path = ''`, checks the actor before data access or mutation, and has `anon` execution revoked unless explicitly public. |
| RLS enabled with no policy on deny-by-default operational tables | `aitask_app_state`, command receipts, feedback submissions, and release acknowledgements deliberately have no browser-table grants. Access is only through approved RPCs or service-role jobs. | Confirm `anon` and `authenticated` have no direct table privileges and the intended RPC grants are unchanged. |

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
