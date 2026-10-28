# AiTask Current Version & Development Baseline

**Audit date:** 28 October 2026 (Asia/Kuala_Lumpur)  
**Scope:** Git, Vercel deployment provenance, source release scope, Supabase targets, and migration history.  
**Mutation status:** No application code was changed. No tests, deployment, merge, or database mutation was run. The only working-tree file created by this audit is this report. A Git fetch refreshed remote references after the initial sandbox blocked writes to .git; it did not alter the working tree.

## Summary

| Item | Verified result |
|---|---|
| Current working branch | codex/release-stabilization-2026-10-26 |
| Current HEAD commit | f3682201e6dc2a17ca529a822e07e83c1f8ffc3f |
| Remote tracking branch | None configured for the current branch. The origin remote is github.com:tehzion/aitask.git. |
| Current working version | Mixed / unclassified development. The working tree contains operational fixes and additive workflow work, but no formal V1 or V2 release assignment. |
| Repository/application version | package.json is 3.0.0. The live build reports 3.0.0. No v3.0.0 Git tag was found; V1/V2 release ownership is a separate, unresolved question. |
| Live production commit | f39c335f7911c9992368bf45d218f6899f0b6334 |
| Latest production deployment | dpl_H2LbAUCwu94FU9EFBZdabN51fu67; READY; created 26 Oct 2026 20:51:41 MYT; production target; source ref codex/production-assignee-guard-2026-10-26. |
| Commits ahead of production | 2 by Git reachability; one is a documentation commit patch-equivalent to a production commit. One content-distinct local commit. |
| Commits behind production | 3 by Git reachability; one is a documentation commit patch-equivalent to a local commit. Two content-distinct production fixes. |
| Branch relationship | Diverged from production at common ancestor 8eeba61ebe3e02825447201b18c6d1b0acfec595. |
| Uncommitted changes | At audit start: 144 modified tracked paths and 18 untracked status paths; none staged. This report adds one untracked path. The worktree includes source, tests, screenshots, reports, and migrations. |
| Unreleased features | One local-only content commit for modularization/release verification, plus a broad uncommitted mix of workflow fixes, UX improvements, and additive capabilities. |
| Current local Supabase target | AiTask project ohjhwyiffgzyatcmmdql. Local .env and .env.production resolve to this project. |
| Production Supabase target | Verified from the production build bundle: ohjhwyiffgzyatcmmdql. |
| Vercel Preview target | The latest inspected Preview bundle also resolves to ohjhwyiffgzyatcmmdql. No Preview deployment exists for the current local branch. |
| V1/V2 database isolation | No isolation observed. Local development, the inspected production build, and the inspected Preview build point to the same Supabase project. No separate V2 database was found. |
| Next recommended action | Preserve this dirty worktree, then split narrow V1 hotfixes from additive product work. Base V1 hotfixes on the verified production SHA and give future-version work a separate, non-production Supabase target. Reconcile migrations before any rollout. |

## Git and release history

The current branch has no upstream configured. The origin remote was fetched successfully after the workspace’s read-only .git mount blocked the first attempt. The working tree remained unchanged by the fetch.

The current HEAD and production commit are not in an ancestor relationship. Raw reachability gives two commits on the current side and three on the production side. Git’s patch comparison marks f368220 and 5e06f7a as equivalent documentation patches; therefore the content-distinct difference is one local refactor commit versus two production fixes.

    8eeba61  common ancestor
    ├── 35f46d6  local modular-app and release-verification refactor
    │   └── f368220  current HEAD: final go-live audit documentation
    │               (patch-equivalent to production commit 5e06f7a)
    └── 5e06f7a  production-side go-live audit documentation
        └── e5f5b5a  live notifications and Staff-status recovery
            └── f39c335  live task-ownership guard; current production

The latest two commit objects reachable from the current branch but not from the production SHA are:

| Commit | Change | Classification |
|---|---|---|
| f368220 | Records the final go-live audit. Its patch is equivalent to production commit 5e06f7a, so it adds no distinct application behavior. | Release documentation; no functional difference by patch comparison. |
| 35f46d6 | Finalizes the modular application structure and release verification: broad source/module moves, architecture boundaries, CI/staging verification, release-readiness documentation, and regression coverage. | Refactor and stabilization work; no formal V1/V2 assignment. |

There are **not four current-branch-only unreleased commits** to list. The two listed above are the complete branch-only set by Git reachability. The many dirty paths are uncommitted changes, not commits.

The latest production-side commits missing from current HEAD are:

| Commit | Change | Classification |
|---|---|---|
| e5f5b5a | Delivers live notifications and recovers Staff status actions. | Production workflow fix; absent from current HEAD. |
| f39c335 | Requires task ownership before work starts. | Production safety fix; absent from current HEAD. |
| 5e06f7a | Records the final go-live audit. | Documentation patch-equivalent to local f368220. |

The current branch therefore does not contain the latest production hotfix commits by ancestry. Some uncommitted files may overlap with their behavior, but they are not committed or verified as equivalent to those production fixes.

### Current uncommitted scope

The working tree is much broader than the branch-only commits. It contains:

- Fixes and regression coverage for existing task assignment, review/revision state, save recovery, permissions, client-visible status, notifications, and release-notice behavior.
- UX and workflow improvements across project, task, calendar, dashboard, report, onboarding, tutorial, language, accessibility, and responsive surfaces.
- Additive capability work, including a Project Workspace route/domain and private task supporting-file upload UI.
- Five new untracked Supabase migrations dated 26 October.
- Many modified E2E files and screenshot baselines.

This is mixed product scope, but the source and release records do not formally assign the additive capabilities to V2. UI redesign alone is not treated as evidence of V2. The appropriate formal classification is **unable to determine V1/V2 ownership; mixed and unclassified working content**. No explicit breaking-change marker was found, but the pending workflow, authorization, and storage migrations are compatibility-sensitive and have not been approved for production rollout.

## Production deployment verification

Vercel project metadata identifies the project as aitask. The latest production deployment record and deployment detail agree:

- **Deployment ID:** dpl_H2LbAUCwu94FU9EFBZdabN51fu67
- **Status / target:** READY / production
- **Created / ready:** 26 October 2026 20:51:41 / 20:52:30 MYT
- **Commit:** f39c335f7911c9992368bf45d218f6899f0b6334
- **Source branch recorded by deployment:** codex/production-assignee-guard-2026-10-26
- **Production aliases:** aitask-virid.vercel.app and the two project aliases
- **Build metadata:** version 3.0.0, channel production, commit f39c335f7911c9992368bf45d218f6899f0b6334

The live commit supplied in the earlier assessment is therefore confirmed as current for this audit. Vercel project settings did not expose the configured production Git branch, so the branch recorded on this deployment is verified, while the project’s configured Production Branch setting is **NOT VERIFIED**.

The current local HEAD is not deployed. It diverges from production at 8eeba61. The local refactor commit and the working-tree changes are not part of the verified production deployment.

## Environment safety and migration status

### Supabase targets

The production build’s compiled workspace runtime contains the Supabase project reference ohjhwyiffgzyatcmmdql. The latest Preview returned by the Vercel query filtered to target=preview was deployment dpl_7d4LikK3BSGut1BofRRx9Z6eHDrb at aitask-notgytnxb-tehzions-projects.vercel.app, READY on commit f39c335; its compiled bundle contains the same project reference. The deployment detail omitted target (null), so its Preview classification comes from the filtered deployment-list result. The local .env and tracked .env.production files resolve to the same project. The Supabase account lists one active AiTask project with this reference; no separate V2 project was found.

Vercel denied access to project environment-variable metadata with 403, so branch-specific environment overrides are not visible. The artifact-level result verifies the latest observed production and Preview builds, but not the future environment of a Preview deployment from this branch. Vercel returned no Preview deployment for the current branch.

**Risk:** local development and the observed Preview build target the same Supabase project as production. Running the application while authenticated can write live records through the app’s normal authorized workflows. Treat local and Preview activity as production-affecting until a separate development database is configured. No API keys, tokens, passwords, or connection strings are included in this report.

The Supabase branch listing returned only the default main branch with the same project reference and a MIGRATIONS_FAILED status, while the project details reported ACTIVE_HEALTHY. I did not infer that the live project is unavailable; this branch-status discrepancy should be resolved before using it for a migration rollout.

### Migration gap

The live Supabase migration API returned 124 applied records through 20261023154255_bind_service_command_entity_types. The checkout contains 130 migration files. Existing release manifests document production-generated aliases for historical repository migrations, so a raw filename-version set difference is not a valid pending-migration count. The current release manifest identifies 20261024090000_security_boundary_hardening as absent from production. The live migration list also confirms that the five new, untracked 26 October migrations are not applied:

| Local migration | Intended effect from its SQL comments/name |
|---|---|
| 20261026120000_separate_internal_revision_from_client_approval | Keep internal revisions from overwriting a Client’s separate delivery decision. |
| 20261026123000_enforce_project_assignment_membership | Enforce project membership for task assignees. |
| 20261026130000_private_task_supporting_files | Add private internal supporting files, access controls, and task-history handling. |
| 20261026135000_preserve_revision_stage_progress | Preserve revision progress through the final status calculation. |
| 20261026141000_allow_current_release_notice_acknowledgement | Keep acknowledgement RPC behavior aligned with the active notice while retaining compatibility. |

These are schema, workflow, authorization, or storage-boundary changes. **Applying them could affect production behavior and data access.** At least six candidate migration files are absent from live migration history: the previously identified security-boundary hardening migration plus these five new files. Historical version aliases and SQL-hash parity still need reconciliation; do not batch-push the checkout’s migration folder to production based only on filenames. No database mutation was executed.

## Release decision and recommendation

This checkout is not a clean V1 stabilization candidate or a formally designated V2 branch. It is a diverged branch with a large, uncommitted mixed scope and a shared production database target. A narrow release cannot be safely selected from this tree without separating the changes and reconciling migrations.

Recommended sequence:

1. Preserve the current dirty worktree and its uncommitted files.
2. Review and isolate only approved V1 fixes on a branch based on live production SHA f39c335.
3. Keep Project Workspace and other additive capability work on a dedicated future-version branch.
4. Give Preview and local development a separate Supabase project/branch before further writes.
5. Reconcile the complete migration chain and validate it against that non-production database before considering production rollout.

Until those boundaries are established, fixes on the current branch have no verified V1 or V2 release destination, and the current working set cannot be released without risking inclusion of unfinished feature work and pending migrations.

