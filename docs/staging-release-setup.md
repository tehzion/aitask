# Staging and tagged-release setup

This repository can enforce the release gate only after the following project settings and secrets are configured. Do not put any of these values in tracked environment files.

## 1. Isolate staging

Create a separate Supabase project and a separate Vercel project for staging. Apply the complete migration history to the empty staging database, deploy the two Edge Functions, use the staging origin for `AITASK_PUBLIC_URL`, and allow that origin’s `/account/password` redirect.

Set `VITE_AITASK_BACKEND=supabase`, the staging Supabase URL, and the staging publishable key only in the staging Vercel project. Keep production values exclusively in the production Vercel project. Enable Supabase Auth leaked-password protection in both projects and use non-production email delivery for staging.

## 2. Prevent unversioned production deployments

In the production Vercel project, change the Git production branch to a branch that is never pushed, such as `production-managed-by-tags`. Pushes to normal branches may keep creating previews, but must never update the production alias.

Add these GitHub secrets for the production project: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`. Add separate `STAGING_VERCEL_TOKEN`, `STAGING_VERCEL_ORG_ID`, and `STAGING_VERCEL_PROJECT_ID` secrets for staging. Set repository variable `VERCEL_CLI_VERSION` to an approved pinned Vercel CLI version.

## 3. Configure the staging QA fixture

Create one resettable workspace named `Release QA`, with non-client accounts for Super Admin, Operations, Production, and Account, plus one Client account. The fixture must include:

- one known client plan with a published service cycle and a client-visible delivery awaiting review;
- one client-visible delivery belonging to another company, used only to verify denial;
- a documented reset operation that removes or restores only the `Release QA` workspace after every run.

Store account credentials in the `STAGING_QA_*_EMAIL` and `STAGING_QA_*_PASSWORD` secrets. Store the fixture identifiers and base URL in the similarly named repository variables used by `.github/workflows/release.yml`. The release workflow fails if any required value is absent.

## 4. Release and rollback

The v2.1.1 tag is a documented one-time direct-production exception. It skips
staging and Vercel CLI deployment, waits for the existing Git integration, and
runs only unauthenticated live verification. It performs no database migration.

For every later release:

1. Commit the versioned source and changelog, then create a matching `vX.Y.Z` tag at that exact commit.
2. The tagged workflow validates source, builds and tests staging, runs authenticated staging QA, then builds and deploys the same tagged source to production.
3. Confirm the production `/build-info.json` contains the tagged version and commit before announcing the release.
4. If a post-deploy check fails, use Vercel rollback to restore the preceding production artifact. Follow the release-specific database rollback plan; never replay migrations as an application rollback shortcut.

## 5. Supabase evidence

Production is already aligned through `20260826230000_client_read_privacy`. Do not use migration repair or manually replay migrations. Each release still runs the disposable local migration/pgTAP/advisor gate, the staging authenticated suite, and the anonymous production security verifier.
