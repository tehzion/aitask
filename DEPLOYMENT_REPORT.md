# AiTask takeover and deployment — 2026-10-17

## Outcome and authority

The owner authorized pushing all intended audit-branch changes and deploying to production Supabase, then explicitly waived a fresh backup ("skip the backup"). Three reviewed migrations and two edge functions are deployed. No master merge, force push, Vercel production promotion, production test account, or production business-data test mutation was performed.

Git target: `tehzion/aitask`, branch `codex/audit-p0p1-2026-10-16`, existing [PR #8](https://github.com/tehzion/aitask/pull/8). Implementation commit `463eb7c3a3a88215505e8387d4f80ace73bbc0cd` and its eight previously unpushed predecessors were successfully pushed by ordinary fast-forward from remote `9d65935`. This report and the six original handover documents are included in the following documentation commit for the same branch. Preview builds may start automatically; they are not production promotion.

## Independently verified takeover findings

- React 18 / TypeScript / Vite SPA, version 3.0.0; Node 22 and pnpm 10.4.1. Secure Supabase command RPCs, workspace optimistic locking and role/portfolio checks mediate writes. Client portal projections are separate from internal workspace reads.
- The original handover's clean-tree claim was incorrect: its six handover documents were untracked. They are retained, with historical-status notices. The initial branch was eight commits ahead of its remote, without divergence from master. No existing Git history was rewritten.
- Migration history uses verified connector-generated timestamp aliases, not filename timestamps. Before rollout, 107 live entries resolved to 107 repository migrations, with two pending; this takeover added a third task-notification cleanup migration. No migration-history repair was used.
- Authorization tests exposed a real company-cascade ordering defect in the unapplied ownership migration. Authorization is now checked before the cascade, with a transaction-local context bound to workspace, company and actor; the ownership trigger remains restrictive outside that exact approved delete.
- Staff task saves unnecessarily included notification-delete operations that Staff cannot perform. The client now omits only those dependent deletes; a private, tightly scoped AFTER DELETE trigger cleans stale task notices in the same workspace and retains explicit Task Deleted notices. No wider notification/table grants were added.
- Stale pgTAP fixtures, ambiguous test-helper parameters and several browser expectations were corrected to match current approved behavior. Client-visible completion-before-acceptance remains unchanged. HOD edit-before-delete and portfolio boundaries remain enforced.
- Members and custom roles use Realtime; entity refresh uses polling plus focus/visibility/online events. Server cron jobs are active, with monthly revision scheduling incorporated into the existing generator. The service-file bucket remains private with scoped policies, a 100 MiB limit and restricted document/image MIME types.

## Supabase production execution

Project: `ohjhwyiffgzyatcmmdql` (AiTask, Singapore). Migrations were applied sequentially through the connected Supabase tool from committed SQL:

| Repository migration | Recorded production version |
| --- | --- |
| `20261016160000_pm_client_scope_and_ownership` | `20261017031828_pm_client_scope_and_ownership` |
| `20261016170000_department_scoped_visibility_cleanup` | `20261017031838_department_scoped_visibility_cleanup` |
| `20261017030340_task_delete_notification_cleanup` | `20261017031841_task_delete_notification_cleanup` |

All 110 repository migrations now resolve to 110 live entries. The production alias map is preserved in `supabase/preflight/migration_repair_manifest.review.json`; no migrations remain pending there.

Edge deployments, both ACTIVE, submitted directly from their committed `index.ts` files:

| Function | Previous → new version | verify_jwt |
| --- | --- | --- |
| `invite-aitask-member` | 36 → 37 | true |
| `aitask-feedback` | 23 → 24 | false (existing application-level authorization retained) |

The unrelated `provision-aitask-launch-users` function was not changed. Existing environment secrets were not replaced or exposed.

Read-only production verification after migrations:

- All 14 business-entity groups have identical counts and content hashes before/after, including 79 companies, 71 projects, 174 tasks, 79 deliverables and 1,295 notifications. Members remain 11 with identical content hash; Auth users remain 10. The visibility-cleanup migration found no qualifying production rows to rewrite.
- Public/Storage policy hash is unchanged: `60abfc570f674c06aecdaa3f3026b8e7`.
- All 13 application tables retain RLS. Anonymous users cannot execute either service-command overload; anonymous/authenticated roles have no direct application-table INSERT/UPDATE/DELETE grants. Both overloads contain the new create/portfolio guards. Ownership and task cleanup triggers are enabled. New private helpers have a fixed empty search path and appropriately restricted execution.
- Security advisor: zero ERROR findings; existing intentional authenticated SECURITY DEFINER endpoints and internal tables with RLS/no policies remain reported, along with disabled leaked-password protection. They were not hidden or weakened to clear the advisor.

Fresh backup: explicitly waived by the owner after the Supabase CLI backup request failed with Invalid access token. Pre-change function definitions are preserved only in ignored local `.release-backups/production-functions-pre-takeover-20261017.sql`. This is schema evidence, not a full backup or a verified restore point. Any database rollback requires separate review; do not automatically replay old definitions or delete migration history.

## Verification actually completed

- Type checking and lint: passed after the final source changes.
- Unit tests: 106 files / 818 tests passed.
- Migration nonempty check: 110 files passed. Internationalization audit: zero findings.
- Production build, PWA generation and bundle budget: passed; eager gzip 292.0 KiB against the 300 KiB budget.
- Isolated database checks: 66 pgTAP files / 1,009 assertions passed; schema lint and Storage checks passed. The full database gate did **not** pass: its later Staff action integration phase stopped during local Auth fixture setup with a request timeout. This remains unverified end to end.
- Targeted critical browser coverage: 54 of 55 passed on the combined run, then the smoke failure was corrected and its rerun passed. Additional regression expectations were corrected, but the latest broader run was interrupted at the owner's push request. Do not describe the complete E2E suite as green.
- Production secure-cutover verifier passed before and after rollout: anonymous command execution, direct data reads and legacy helper access are blocked. Both redeployed edge functions returned HTTP 200 to OPTIONS probes; only the canonical production origin was echoed in the allowed-origin header, with neither additional Vercel alias allowed. No production account creation or business mutation was used for smoke tests.

Ignored logs/results, generated dist files, local environment files and backup evidence are excluded from Git. The tracked production environment contains only public frontend configuration, not service credentials.

## Vercel and outstanding release gates

Verified team `team_g508b9bq8m0arklfrfDId3wH`, project `prj_uzWREguA16aYjlhTHPw9hE8DRLSM` (aitask), Git production branch `master`. Existing production is deployment `dpl_2xYFtMbz8M6Rxei9R95PuNVJEZ8n`, READY from `fd45ca9fd544c4daa1f105cb9b14655b66dd11ad`; the canonical [production URL](https://aitask-virid.vercel.app) returned matching build metadata. Its protection settings were preserved. Production frontend remains at that existing commit, not the new audit-branch code.

Vercel CLI access verified the project and production/preview public Supabase environment variable names without printing values. Audit previews use the production Supabase environment; do not run authenticated mutating tests there as if it were disposable staging. The canonical production origin is allowed by the current edge CORS configuration; additional Vercel aliases are not configured as allowed origins.

The existing remote CI run for the old branch tip failed quality/staging gates. Staging Supabase access is denied and the staging Vercel token cannot access its organization. Master requires `verify`, `database`, `verify-staging` and one approval. These protections were not bypassed. A green full integration/E2E run, repaired staging credentials and separate production-frontend release authority remain necessary before claiming a fully verified frontend production release.

For application rollback, use a reviewed Git revert or an explicitly approved prior Vercel deployment. For backend regression, inspect the recorded migration/function versions and prefer a reviewed forward migration; the backup waiver means a fresh full-data restore was not established.
