# Staging and tagged-release setup

This repository can enforce the release gate only after the following project settings and secrets are configured. Do not put any of these values in tracked environment files.

## 1. Isolate staging

Use Supabase project `dyaxtloducpgjoxuaszk` (`aitask-staging`) and a separate Vercel project with the same name. Keep its migration history aligned, deploy the two Edge Functions, use the staging origin for `AITASK_PUBLIC_URL`, and allow that origin’s `/account/password` redirect.

Set `VITE_AITASK_BACKEND=supabase`, the staging Supabase URL, and the staging publishable key only in the staging Vercel project. Keep production values exclusively in the production Vercel project. Enable Supabase Auth leaked-password protection in both projects and use non-production email delivery for staging.

## 2. Validate before automatic production deployment

Keep `master` as the canonical production branch in the `aitask` Vercel project. Protect `master` with one approving review, dismissal of stale reviews, administrator enforcement, conversation resolution and strict required checks `verify`, `database` and `verify-staging`, supplied by GitHub Actions (app ID 15368). Prohibit force pushes and deletion. These settings were applied and read back on 8 October 2026. Disconnect the duplicate `aitask-master` project from Git so a single Vercel project owns the production alias.

Add these GitHub secrets for Vercel: the production `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`, plus the staging-scoped `STAGING_VERCEL_TOKEN`, `STAGING_VERCEL_ORG_ID`, and `STAGING_VERCEL_PROJECT_ID`. The workflows expose the staging token only as the conventional `VERCEL_TOKEN` CLI environment variable, link the explicit staging project, and verify both credential and project before a build or deploy. The staging token must have access to the staging organization and project. Add `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, and `STAGING_SUPABASE_SERVICE_ROLE_KEY`; the service credential is used only by the fixture reset script and must never use a `VITE_` prefix. Set repository variables `VERCEL_CLI_VERSION` and `STAGING_SUPABASE_PROJECT_REF`.

## 3. Configure the staging QA fixture

The pull-request and tagged workflows run `scripts/reset-staging-qa.mjs` to create one resettable workspace named `Release QA`, with non-client accounts for Super Admin, Operations, HOD, Production, Account, and password setup, plus one Client account. The fixture includes:

- one known client plan with a published service cycle and a client-visible delivery awaiting review;
- one client-visible delivery belonging to another company, used only to verify denial;
- deterministic client, plan, cycle, deliverable, assigned/unassigned task, stale-version task, notification, and foreign-company records;
- a cleanup operation that refuses production, checks the staging project reference, and removes only workspace `aitask-main` when its name is `AiTask` or `Release QA`, plus the seven exact QA emails.

Store account credentials in the `STAGING_QA_*_EMAIL` and `STAGING_QA_*_PASSWORD` secrets, including `STAGING_QA_PASSWORD_SETUP_NEW_PASSWORD`. Fixture identifiers are non-secret deterministic constants shared by the reset script and staging suite. Both workflows use the exact deployment URL returned by Vercel and fail before verification if required configuration is absent.

The isolated `STAGING_QA_HOD_EMAIL` and `STAGING_QA_HOD_PASSWORD` secrets were added
on 8 October 2026. Both workflows share concurrency group
`aitask-staging-fixture`, with cancellation disabled, so fixture reset and cleanup
cannot interrupt the other workflow. All three workflows explicitly select Bash,
which enables `pipefail` for piped gates.

### Protected deployment access

Keep Deployment Protection enabled. Configure two GitHub Actions Trusted Sources
rules **only in the isolated `aitask-staging` Vercel project**:

| Field | Value |
| --- | --- |
| Identity provider | GitHub Actions |
| Issuer | `https://token.actions.githubusercontent.com` |
| GitHub account | `tehzion` |
| Repository | `aitask` |
| Workflow, first rule | `Authenticated Staging QA` |
| Workflow, second rule | `Tagged Release Verification` |
| Audience | `https://github.com/tehzion` |
| Deployment environment | Production **within the staging project** |

This follows [Vercel Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources).
Both rules were saved and read back on 8 October after the user authorized
continuing staging setup. Vercel Authentication remains enabled. Protected hosted
access still needs verification: CI's current deployment token cannot access the
configured staging team, and the Supabase staging project is unavailable to the
current account.

Both workflows grant `id-token: write`. The helper requests a short-lived token
for this audience and attaches `x-vercel-trusted-oidc-idp-token` only when the
request origin equals the returned deployment's `STAGING_PROTECTION_ORIGIN`.
Provenance requests reject redirects. Browser routing strips the header from
other origins, including Supabase; service workers are blocked for hosted QA.
Never substitute a long-lived bypass credential or disable protection to pass QA.

Hosted tests retain text diagnostics with trace, screenshot and video disabled.
Before artifact upload, `verify-qa-artifacts.py` scans files and nested ZIPs for
configured credential values and credential markers. A failed scan prevents
upload. Rotate any real credential found in older artifacts before reuse; the
limited historical inspection recorded in the remediation report found none.

The reset fixture also persists one `supplier` and one `freelancer` member through
the same `worker_type` field used by `invite-aitask-member`. Staging QA must verify
those values after sign-in, verify Staff approval and successful hosted login,
verify assigned-service access and denial for an unrelated client, and confirm
that one Staff member cannot read another Staff member's assigned service data.

If the staging Vercel preflight reports that the account is inaccessible, recreate
`STAGING_VERCEL_TOKEN` from an account or service account that belongs to the
staging organization, then set the matching `STAGING_VERCEL_ORG_ID` and
`STAGING_VERCEL_PROJECT_ID` secrets before merging. Do not substitute production
project IDs or a production token; the workflow is expected to fail closed when
staging access is ambiguous.

## 4. Release and rollback

The v2.1.1, v2.1.2, and v2.1.3 tags were historical one-time direct-production
exceptions. v2.1.4 is the final exact exception and may proceed only after its
two pending production migrations and business-data integrity checks pass.
Every later release uses the staging-first pull-request path while preserving automatic deployment from reviewed `master` changes.

For every later release:

1. Commit the versioned source and changelog on a pull request. Authenticated Staging QA deploys and tests that candidate before merge.
2. Merge only after required checks pass. Vercel automatically deploys the reviewed `master` commit to production.
3. Create a matching `vX.Y.Z` tag at that exact merge commit. The tagged workflow repeats staging and source gates, then confirms production `/build-info.json` contains the tag version and commit.
4. If a post-deploy check fails, use Vercel rollback to restore the preceding production artifact. Follow the release-specific database rollback plan; never replay migrations as an application rollback shortcut.

## 5. Supabase evidence

Production alignment is recorded explicitly in
`supabase/preflight/migration_repair_manifest.review.json`. Do not use migration
repair or manually replay migrations: apply only the ordered entries in
`pendingProductionMigrations`, and require that list to be empty before creating
a release tag. Each release still runs the disposable local migration/pgTAP/
advisor gate, the staging authenticated suite, and the anonymous production
security verifier.

## 6. Deep-audit migration and attachment gate

The audit adds `20260930111033_service_upload_reconciliation` and
`20260930154013_initialize_deadline_reminder_claim`. Verify the hosted migration
history, including the existing delegation migration, before applying the ordered
pending production tail. The checked-in manifest is release evidence, not a live
query of the project's migration history.

Deploy the reconciliation migration before releasing the new attachment-cleanup
interface. Until its RPC exists, cleanup fails closed and retains unresolved
uploads. The RPC is restricted to the authenticated uploader, workspace and
client scope. It checks canonical references and fences discarded commands before
allowing deletion. Do not remove its tombstones or replay discarded command IDs
during an application rollback: those records prevent a delayed request from
referencing an already-deleted object.

Run `pnpm verify:supabase:rollout` in a disposable Docker stack. It now includes
authenticated delegation pgTAP tests and real Auth/REST/Storage upload tests,
including lost acknowledgement after commit, cross-account denial, late-command
replay after discard and interrupted cleanup retry. The storage harness refuses
non-local hosts and non-validation database containers. Repeat the relevant flows
against isolated hosted staging through its established QA fixture before release;
a passing local stack does not establish the deployed project's policy state.

Export checks can be repeated with `pnpm verify:csv:libreoffice` when LibreOffice
is installed. Startup profiling uses a production-mode local demo build and a
localhost preview: set `AITASK_PROFILE_URL` to that preview and run
`pnpm profile:startup`. Neither script targets production.

## 7. Version 3 onboarding rollout and current hold

Apply `20261007173905_reliable_member_onboarding.sql` before deploying the updated
`invite-aitask-member` Edge Function, and deploy the frontend afterward. Preserve
historical migrations and existing v2 RPC compatibility. The new reserve and
finalize RPCs are service-only. Their journal excludes passwords and atomically
records worker type, membership and registration approval with a replay receipt.
Old clients receive a reload-required response without creating an account or
discarding their form draft. Do not delete an Auth account to resolve an uncertain
RPC response; retry the original command and reconcile its receipt.

The disposable rollout gate also exercises real local Auth email invitations and
the actual onboarding handler against Auth/REST, dropping a successful finalizer
response and confirming replay and password login. It uses disposable Mailpit
email delivery and refuses hosted targets.

Release remains blocked until protected hosted staging passes, the ordered
production migration tail is separately approved and verified, leaked-password
protection is enabled, and the managed database security patch is resolved.
Staging Supabase project access currently returns authorization denial, and CI's
Vercel deployment credential fails its staging-team preflight. No production deployment,
migration, paid upgrade or release publication is authorized by this remediation.
See [the remediation report](version-3-prelive-remediation-2026-10-08.md) for actual
results and limitations. Rebuild release artifacts from the final committed source
only when publication is separately requested.
