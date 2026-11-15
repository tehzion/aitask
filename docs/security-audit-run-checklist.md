# Running a security audit so its leads can be confirmed

Written after the 2026-11-14 audit, whose leads were "needs validation" because
no isolated database was available, and whose audited commit was not the branch
that was being released.

## Before the run

1. Audit the exact PR head: record `git rev-parse HEAD` and confirm
   `git merge-base --is-ancestor <audited-sha> <release-branch-head>` succeeds.
   Findings from a commit that is not an ancestor of the release branch must be
   re-checked against the release branch before anyone acts on them.
2. Start the disposable local stack (needs Docker): `pnpm verify:supabase:rollout`
   replays every migration, runs the full pgTAP suite in `supabase/tests/database`,
   and runs `scripts/verify-security-audit-leads.mjs`, which refuses any hosted or
   production target.
3. Give the auditor that stack, not a production project, so database leads can be
   settled with one local reproduction instead of staying open.

## Turning a lead into a regression test

- A database lead becomes a pgTAP file in `supabase/tests/database`; CI runs every
  file there with no hard-coded count, so the test gates each PR.
- Test the full matrix, not the one reported case (for notifications: every
  audience type and every reader role, see `notification_audience_matrix.test.sql`).
- Edge Function limits and ordering are asserted in
  `src/infrastructure/serialization/securityBoundaryRegression.test.ts` style tests.

## Settings the repository cannot prove

Record the owner-observed state, with the date, in the release manifest: `master`
branch protection and bypass actors, staging Environment/secret restrictions, and
the Vercel Trusted Sources claims (issuer, audience, repository, workflow, ref,
environment). `scripts/deployment-protection.mjs` also checks the OIDC `ref` claim,
but a branch can edit that script, so the provider-side rule is the real control.

## Production changes

Take a verified backup per `docs/production-rpc-mismatch-recovery.md`, compare the
live definition of every function a migration replaces (md5 of
`pg_get_functiondef`) with the repository's previous version before applying, and
record the rollback steps in the manifest.
