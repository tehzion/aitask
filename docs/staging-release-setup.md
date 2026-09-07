# Staging and tagged-release setup

This repository can enforce the release gate only after the following project settings and secrets are configured. Do not put any of these values in tracked environment files.

## 1. Isolate staging

Use Supabase project `dyaxtloducpgjoxuaszk` (`aitask-staging`) and a separate Vercel project with the same name. Keep its migration history aligned, deploy the two Edge Functions, use the staging origin for `AITASK_PUBLIC_URL`, and allow that origin’s `/account/password` redirect.

Set `VITE_AITASK_BACKEND=supabase`, the staging Supabase URL, and the staging publishable key only in the staging Vercel project. Keep production values exclusively in the production Vercel project. Enable Supabase Auth leaked-password protection in both projects and use non-production email delivery for staging.

## 2. Validate before automatic production deployment

Keep `master` as the canonical production branch in the `aitask` Vercel project. Protect `master` in GitHub so production changes arrive through reviewed pull requests, and require Quality and Security plus Authenticated Staging QA before merge. Disconnect the duplicate `aitask-master` project from Git so a single Vercel project owns the production alias.

Add these GitHub secrets for Vercel: the account-scoped `VERCEL_TOKEN`, production `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, plus `STAGING_VERCEL_ORG_ID` and `STAGING_VERCEL_PROJECT_ID`. The workflows pair the same account token with the explicit staging IDs, so staging remains a separate project. Add `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, and `STAGING_SUPABASE_SERVICE_ROLE_KEY`; the service credential is used only by the fixture reset script and must never use a `VITE_` prefix. Set repository variables `VERCEL_CLI_VERSION` and `STAGING_SUPABASE_PROJECT_REF`.

## 3. Configure the staging QA fixture

The pull-request and tagged workflows run `scripts/reset-staging-qa.mjs` to create one resettable workspace named `Release QA`, with non-client accounts for Super Admin, Operations, Production, Account, and password setup, plus one Client account. The fixture includes:

- one known client plan with a published service cycle and a client-visible delivery awaiting review;
- one client-visible delivery belonging to another company, used only to verify denial;
- deterministic client, plan, cycle, deliverable, task-chain, notification, and foreign-company records;
- a cleanup operation that refuses production, checks the staging project reference, and removes only workspace `aitask-main` when its name is `AiTask` or `Release QA`, plus the six exact QA emails.

Store account credentials in the `STAGING_QA_*_EMAIL` and `STAGING_QA_*_PASSWORD` secrets, including `STAGING_QA_PASSWORD_SETUP_NEW_PASSWORD`. Fixture identifiers are non-secret deterministic constants shared by the reset script and staging suite. Both workflows use the exact deployment URL returned by Vercel and fail before verification if required configuration is absent.

The reset fixture also persists one `supplier` and one `freelancer` member through
the same `worker_type` field used by `invite-aitask-member`. Staging QA must verify
those values after sign-in, verify Staff approval and successful hosted login,
verify assigned-service access and denial for an unrelated client, and confirm
that one Staff member cannot read another Staff member's assigned service data.

If the staging Vercel project or token is unavailable, repair the account-scoped
token and the explicit `STAGING_VERCEL_ORG_ID`/`STAGING_VERCEL_PROJECT_ID`
secrets before merging. Do not substitute production project IDs or a production
token; the workflow is expected to fail closed when staging access is ambiguous.

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
