# AiTask Tutorial Release Readiness

**Assessment date:** 2026-10-19
**Package version:** `3.0.0`
**Base revision inspected:** `90279d6` on `codex/audit-p0p1-2026-10-16`
**Decision:** **NOT READY FOR PRODUCTION**

## What is ready

- The tutorial/onboarding implementation passed the full local functional, unit, type, lint, localization, build, browser, and isolated database-policy checks recorded in `AITASK_TUTORIAL_TEST_REPORT.md`.
- Production configuration source uses the Supabase backend and disables demo login and password-reset bypass. No secret values are recorded in this report.
- No tutorial step is designed to perform business mutations without an explicit user action, and no business data was modified during QA.

## Blocking release gates

| Priority | Blocker | Evidence | Required authorized action |
| --- | --- | --- | --- |
| P0 | Production migration parity is unproven for the current repository tail. | `pnpm verify:supabase:rollout` and `pnpm verify:release-db-alignment` correctly fail against the immutable production verification record, which ends at `20261017140000_audit_history_retention_guards_followup`. The repository now includes later migrations, including `20261018032155_tutorial_feedback` and `20261018120000_harden_security_definer_rpc_boundaries`. | Review the exact ordered migration plan, apply it to the authorized target, and update the manifest only with evidence of the actual production state. |
| P0 | Fresh backup/restore and rollback proof for the changed release has not been recorded. | Earlier production evidence cannot cover later migration files. | Create and verify a fresh backup/restore point before migration; document recovery ownership and timing. |
| P0 | No authorized deployment preview/artifact was available for provenance verification or production smoke testing. | `pnpm verify:release-provenance` requires `--url` or `--file`; neither was supplied. | Produce a deployment preview from the reviewed revision, verify provenance, then run the specified authenticated role smoke tests. |

## Required promotion sequence

1. Obtain explicit change approval for the ordered migrations and release artifact.
2. Create a fresh production backup and verify that it can be restored under the documented incident procedure.
3. Run preflight checks against the authorized production target; inspect the exact migration differences rather than changing a manifest to suppress them.
4. Apply approved migrations in order, including the tutorial-feedback schema, and record the actual deployed version.
5. Update the production verification record truthfully after successful application.
6. Deploy a preview with the production-equivalent environment. Confirm demo login and password-reset bypass remain disabled.
7. Run authenticated smoke tests for Super Admin, Project Manager, HOD, Staff, Client, and a persisted custom role where applicable: Help visibility, direct-link denial, one complete guide, first-login completion, feedback save/read where authorized, and a Client data-boundary check.
8. Verify deployment provenance, error monitoring, migration health, and rollback ownership. Promote only after an authorized reviewer accepts the evidence.

## Rollback posture

- Preserve the previously deployed application artifact before promotion.
- The tutorial-feedback migration is additive. If the application must roll back, disable or roll back the frontend feature only through the approved deployment procedure; do not delete feedback or schema data as an ad hoc rollback.
- A database restore is an incident action and must use the verified backup plus explicit authority. Any down migration must be reviewed for data preservation before it is executed.

## Non-blocking follow-up

- Refresh the Browserslist database as routine maintenance.
- Consider further splitting the `workspaceRuntime` bundle.
- Add a manual screen-reader and physical-device pass to the production smoke checklist.

## Deployment status

No production deployment, production migration, production configuration change, or release commit was performed by this audit. The worktree intentionally remains uncommitted because it contains pre-existing user changes in addition to the tutorial work. Production release authorization should be reconsidered only after every P0 gate above is evidenced as complete.
