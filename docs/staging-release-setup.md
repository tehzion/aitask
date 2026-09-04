# Staging and tagged-release setup

This repository can enforce the release gate only after the following project settings and secrets are configured. Do not put any of these values in tracked environment files.

## 1. Isolate staging

Create a Supabase project named `aitask-staging` and a separate Vercel project with the same name. Apply the complete migration history to the empty staging database, deploy the two Edge Functions, use the staging origin for `AITASK_PUBLIC_URL`, and allow that origin’s `/account/password` redirect.

Set `VITE_AITASK_BACKEND=supabase`, the staging Supabase URL, and the staging publishable key only in the staging Vercel project. Keep production values exclusively in the production Vercel project. Enable Supabase Auth leaked-password protection in both projects and use non-production email delivery for staging.

## 2. Prevent unversioned production deployments

In the canonical production Vercel project, change the Git production branch to `production-managed-by-tags`. Disconnect the duplicate `aitask-master` project from Git or give it the same non-existent production branch. Pushes to normal branches may keep creating previews, but must never update either production alias.

Add these GitHub secrets for the production project: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Add separate `STAGING_VERCEL_TOKEN`, `STAGING_VERCEL_ORG_ID`, and `STAGING_VERCEL_PROJECT_ID` secrets for staging. Add `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, and `STAGING_SUPABASE_SERVICE_ROLE_KEY`; the service credential is used only by the fixture reset script and must never use a `VITE_` prefix. Set repository variables `VERCEL_CLI_VERSION` and `STAGING_SUPABASE_PROJECT_REF`.

## 3. Configure the staging QA fixture

The tagged workflow runs `scripts/reset-staging-qa.mjs` to create one resettable workspace named `Release QA`, with non-client accounts for Super Admin, Operations, Production, and Account, plus one Client account. The fixture includes:

- one known client plan with a published service cycle and a client-visible delivery awaiting review;
- one client-visible delivery belonging to another company, used only to verify denial;
- deterministic client, plan, cycle, deliverable, task-chain, notification, and foreign-company records;
- a cleanup operation that refuses production, checks the staging project reference, and removes only workspace `aitask-main` when its name is `AiTask` or `Release QA`, plus the five exact QA emails.

Store account credentials in the `STAGING_QA_*_EMAIL` and `STAGING_QA_*_PASSWORD` secrets. Fixture identifiers are non-secret deterministic constants shared by the reset script and staging suite. The release workflow uses the exact deployment URL returned by Vercel and fails before deployment if required configuration is absent.

## 4. Release and rollback

The v2.1.1, v2.1.2, and v2.1.3 tags were historical one-time direct-production
exceptions. v2.1.4 is the final exact exception and may proceed only after its
two pending production migrations and business-data integrity checks pass.
Every later release uses the staging-first path.

For every later release:

1. Commit the versioned source and changelog, then create a matching `vX.Y.Z` tag at that exact commit.
2. The tagged workflow validates source, builds and tests staging, runs authenticated staging QA, then builds and deploys the same tagged source to production.
3. Confirm the production `/build-info.json` contains the tagged version and commit before announcing the release.
4. If a post-deploy check fails, use Vercel rollback to restore the preceding production artifact. Follow the release-specific database rollback plan; never replay migrations as an application rollback shortcut.

## 5. Supabase evidence

Production alignment is recorded explicitly in
`supabase/preflight/migration_repair_manifest.review.json`. Do not use migration
repair or manually replay migrations: apply only the ordered entries in
`pendingProductionMigrations`, and require that list to be empty before creating
a release tag. Each release still runs the disposable local migration/pgTAP/
advisor gate, the staging authenticated suite, and the anonymous production
security verifier.
