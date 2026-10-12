# Supabase and save reliability audit — 8 October 2026

**The local v3.0.0 candidate passes the save checks below. Production is not
cleared: it still runs v2.6.1 and its older invitation function retains a known
login-loss path.** The matching onboarding migration and updated function are
prepared and verified locally, but have not been rolled out.

The review traced browser edits through the store, retained command batches,
authenticated RPCs, version checks, database triggers and canonical reloads. It
also checked member onboarding, uploads, RLS/grants, recent production activity,
release alignment and the current SDK changelog. Production inspection was
read-only; authenticated writes and failure injection used disposable local
Supabase stacks.

## Versions and changes

| Component | Verified state |
| --- | --- |
| Workspace app | 3.0.0 |
| Live app | 2.6.1, commit `00c9d0c632575f9d6ac741c8d8d87acf10face48`, built 7 October 2026 |
| Browser SDK | Updated and pinned from `@supabase/supabase-js` 2.116.0 to 2.117.3; matching lockfile updated |
| Edge Function source | Both invitation and feedback SDK imports now pin 2.117.3 |
| Local CLI | Repository-pinned 2.117.0 used for the database gates; registry reports 2.120.0 available |
| Live database | PostgreSQL 17.6; project reports `ACTIVE_HEALTHY` |

[Supabase's stable 2.117.3 release](https://github.com/supabase/supabase-js/releases/tag/v2.117.3)
includes the timeout-abort retry fix and function/storage upload fixes. The
[SDK changelog](https://github.com/supabase/supabase-js/blob/master/packages/core/supabase-js/CHANGELOG.md)
also records the intervening session-refresh fix. Node 22 satisfies the SDK's
runtime requirement. Unrelated dependency resolutions were preserved.

Three new tests execute the actual SDK with controlled transport failures:
an aborted read is attempted once; a dropped mutation confirmation is returned
to the application's retry machinery; a 503 mutation response is not
automatically resent. Existing application tests cover retaining and replaying
the same command ID, complete mixed-command batches, conflicts, reloads, newer
drafts and account changes.

## Save verification

| Boundary/check | Fresh result |
| --- | --- |
| Full unit suite | 509 tests in 73 files passed |
| Database migrations, pgTAP, lint, advisors and postflight | 578 assertions in 41 files passed with SDK 2.117.3 |
| Real authenticated Staff/HOD saves | Passed creation/deletion, edits, priority/status/dates, comments, derived delivery completion/reopening, delegation, reload and lost-confirmation retry |
| Real Storage | Passed upload/reference persistence, committed-response loss, cross-account denial, discard fencing and cleanup retry |
| Real Auth/REST onboarding | Actual updated handler preserved a working password login after a lost finalization response; receipt replay, atomic worker types, invitation metadata and unrelated-account denial passed |
| Browser recovery | All 53 selected Staff, Boss and Customer scenarios passed in one completed run |
| TypeScript, ESLint and strict translations | Passed |
| Production build, bundle budgets and static PWA | Passed; eager JavaScript remained below the unchanged 300 KiB gzip cap |
| Production dependency audit | Zero reported vulnerabilities |
| Anonymous production verifier | Passed workspace/RPC/snapshot/retired-helper denial checks |
| Production release alignment | Correctly failed: `20261007173905_reliable_member_onboarding` remains pending |

Browser scenarios use the local backend and injected save outcomes. Actual
authenticated database/storage/onboarding checks are separate integrations
against disposable stacks. These results do not represent authenticated tests
of the deployed production app. The initial browser launch could not use port
4180 because an existing server occupied it; the completed run used isolated
port 4319 without stopping that server. Both disposable Supabase stacks were
stopped and removed.

## Production findings

1. **P1: deployed onboarding recovery remains unsafe.** Direct inspection of
   `invite-aitask-member` version 34 confirms it calls
   `aitask_finalize_member_invitation_v2` and deletes a newly created Auth user
   whenever that RPC returns an error. A lost response after a successful
   database commit can therefore remove a committed login. Worker type is also
   written separately after finalization. The local v3 handler and migration
   already address both paths and passed fresh real Auth/REST recovery tests.
   Production has neither `private.aitask_member_onboarding` nor its v3 RPCs.
   Apply the reviewed migration before deploying the updated invitation handler
   and frontend; verify alignment and hosted onboarding afterward.

2. **Managed PostgreSQL security patch remains outstanding.** Live SQL reports
   17.6. Supabase's
   [17.11 patch announcement](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
   describes security and compatibility fixes. Detection found no installed
   `ltree`/`btree_gist`, custom selectivity operators or AiTask PGP-decryption
   functions. Those checks reduce the listed compatibility concerns, but do
   not apply the patch or establish absence of other upgrade requirements.
   Resolve the managed upgrade with its backup and maintenance requirements.

3. **Leaked-password screening is disabled.** The live security advisor still
   reports `auth_leaked_password_protection`. This remains outside the project's
   expected-warning allowlist. See
   [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
   and the existing plan limitation in `supabase-security-advisor-allowlist.md`.

4. **Production save telemetry is insufficient for a zero-error claim.** The
   successful log aggregate returned 43 permission-denied (`42501`) errors in
   its rolling 24-hour window, with no other ERROR SQLSTATE in that aggregate.
   Anonymous audit probes can produce these denials. Detailed event-message
   and API-path queries repeatedly failed at the log provider, so attribution
   to probes versus user actions remains unresolved. The command-receipt query
   found zero new receipts in its preceding 24 hours; recent successful user
   saves were therefore not demonstrated by this window. No logging settings
   were changed.

## Production boundaries independently verified

- All 11 surveyed AiTask tables have RLS enabled, no anonymous table privileges,
  and no direct authenticated mutation grants.
- No surveyed public AiTask definer RPC grants anonymous execution; every
  surveyed definer RPC fixes its search path.
- The private file bucket allows the intended PDF/image MIME types and a
  100 MiB maximum. It is not public.
- The five surveyed task/project/deliverable/cycle/client reference relationships
  have zero orphans.
- Four AiTask cron jobs are active; the preceding 24-hour database query found
  99 runs and zero failures.
- Security advisors report the seven documented deny-by-default table notices,
  18 intentional authenticated definer-RPC warnings, and the open password
  warning. Performance advisors report four unused-index INFO findings; this
  audit provides no reason to remove those indexes.

## Reviewable result and remaining rollout

Local changes consist of the pinned browser/Edge SDK updates, lockfile, three
transport regressions and this report. Application version remains 3.0.0.
No production schema, Auth account, setting, function or deployment was changed.

Production rollout still needs the already prepared
`supabase/migrations/20261007173905_reliable_member_onboarding.sql`, matching
invitation handler and frontend in that order. The protected hosted-staging
access limitations recorded in `version-3-prelive-remediation-2026-10-08.md`
remain unresolved by this audit. Keep release alignment blocked until the
actual hosted state and authenticated recovery checks are verified.

Fresh local evidence is retained in `/private/tmp/aitask-supabase-deep-*` logs:
`unit-final-20261008.log`, `rollout-client-21173-20261008.log`,
`browser-20261008.log`, `build-final-20261008.log`, and
`dependencies-20261008.json`. Raw disposable-stack startup logs can contain
ephemeral local credentials and should not be published.
