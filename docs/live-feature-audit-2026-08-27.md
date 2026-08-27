# AiTask live feature audit — 27 August 2026

> Historical pre-release evidence: this audit identified the version mismatch
> that v2.1.1 is designed to correct. Treat it as resolved only after production
> `/build-info.json` reports v2.1.1 and its exact tag commit.

## Overall result: partially verified, release label needs correction

The public production app and secure Supabase backend are reachable and passed the available live checks. Local automated coverage for the audited features also passes. A full authenticated production workflow test was not performed because no approved test account was available, so client plan creation, delivery edits, approvals, and notifications were not exercised against real production data.

## Passed checks

| Area | Result | Evidence |
| --- | --- | --- |
| Core audited feature logic | Pass | 193 unit and permission tests passed, including service plans/cycles, client portal, notifications, workload reporting, access projection, capability checks, retained edits, and conflict recovery. |
| Code quality and build | Pass | Typecheck, lint, production build, and PWA verification completed successfully. |
| Live Supabase command protection | Pass | Anonymous callers cannot execute workspace, service, task-chain, or capability commands. |
| Live data protection | Pass | Anonymous callers cannot read secure workspace tables or the retired public snapshot. |
| Live database health | Pass | The guard-trigger and policy audit passed; secure cutover is active. |
| Public deployment | Pass | `/`, `/login`, `/notifications`, `/clients/client-demo`, `/account/password`, the web manifest, and the service worker all returned HTTP 200. |
| Production bundle configuration | Pass | The deployed bundle contains the configured Supabase project reference and the secure-sync status message. |

## Release-audit finding — action required

The deployed bundle identifies itself as **v2.0.0** but contains UI markers added after the v2.0.0 release:

- **“All work”** and **“View delivery”** were introduced by the 26 August staff/client-workspace changes, after the v2.0.0 boundary commit (`6d2348b`).
- Both markers are present in the live production bundle.

This means the live app contains unversioned changes. The existing client release note correctly excludes those changes, but it is **not a complete description of the live deployment**. Bump the application version and publish updated release notes before treating the production deployment as a formally released build.

## Limits and next live check

- The live checks were deliberately read-only and anonymous; no production client records, tasks, approvals, or notifications were created or changed.
- The browser-automation binary is unavailable in this environment, so browser interaction was verified by public HTTP route and asset checks rather than a visual session.
- The local checks ran with Node.js 24.19.0 and pnpm 11.19.0, while CI pins Node.js 22 and pnpm 10.4.1. The checks passed, but the release gate should still run in the pinned CI environment.
- To complete end-to-end live validation, use an approved non-production client/staff test account to test: sign-in, service-plan save, cycle/deliverable update, client approval/revision, notification read state, and page refresh/retry recovery. Clean up test data afterward.
