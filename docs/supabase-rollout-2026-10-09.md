# Supabase onboarding rollout — 9 October 2026

Production project: `ohjhwyiffgzyatcmmdql`.

Applied repository migration `20261007173905_reliable_member_onboarding.sql`
through the Supabase connector. Production recorded
`20261009024458_reliable_member_onboarding`; existing connector aliases were
preserved. Deployed `invite-aitask-member` version 35 with JWT verification
enabled. Retrieved deployed source matches the repository exactly.

## Verification

- Disposable migration replay, 41 pgTAP files / 578 assertions, schema lint,
  advisors and service postflight passed. Real local Storage recovery,
  authenticated Staff/HOD saves and actual-handler Auth/REST onboarding recovery
  passed, including lost finalization response and successful password login.
- All 15 onboarding assertions passed on the hosted database in a transaction
  that rolled back. No fixture Auth accounts or onboarding journal rows remain.
- Both new RPCs have fixed empty search paths, deny anonymous/authenticated
  execution and allow service-role execution. The journal has RLS enabled and
  denies direct browser/service-role access.
- Production anonymous isolation verifier passed. Hosted invitation endpoint
  returned OPTIONS 200, missing JWT 401 and invalid JWT 401.
- All 11 existing members and every entity type retained their preflight counts
  and data hashes.
- `pnpm verify:release-db-alignment` passed after recording the actual migration
  alias and clearing the pending production migration list.
- Security Advisor retained 18 expected authenticated SECURITY DEFINER warnings
  and the existing leaked-password-protection warning. Its deny-by-default RLS
  information count rose from 7 to 8 for the new private onboarding journal.

## Remaining verification and scope

Authenticated hosted Edge/Auth recovery was not executed. The hosted database
tests and real local Auth/REST tests establish separate evidence; neither is
claimed as a complete authenticated hosted application test. Frontend deployment
and protected staging QA remain outside this Supabase rollout.

Leaked-password protection remains disabled under the existing documented plan
limitation. This rollout did not change the plan or Auth settings. See
[the advisor review](supabase-security-advisor-allowlist.md) and
[Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The disposable run log is retained at
`/private/tmp/aitask-supabase-rollout-20261009.log`; raw local startup logs can
contain ephemeral credentials and should not be published.
