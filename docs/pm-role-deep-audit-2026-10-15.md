# PM role deep audit — 15 October 2026

This follow-up audits the current Project Manager implementation against `role-templates.md`, including the earlier 14 October remediation. It changes source and prepares one database migration. No hosted database or deployment was changed.

## Confirmed findings and fixes

| Priority | Finding | Fix |
| --- | --- | --- |
| P1 | An authenticated PM could change an owned standalone task to another company's name/ID through `aitask_execute_command`. That new task relationship then granted access to the other company's service workspace. A rollback-only database probe confirmed access changed from false to true. | A private BEFORE trigger validates the destination against the PM's existing company access before creating the relationship. The local store checks the same boundary for creation and company changes. |
| P2 | Task inserts ignored a PM's revoked `createTasks` permission on the server. Workflow generation also ignored that permission locally. | The server checks PM creation permission before inserting tasks. The store rejects new workflow generation when creation is revoked; already-generated chains remain safe to retrieve. |
| P2 | A PM assigned another member's task could edit it, but the frontend blocked delegation unless the PM also owned the company/project or created the task. The server already supported direct-assignment delegation. | Match the server's assignment authority in the shared access helper. Both quick reassignment and the full editor permit delegation. Delegation preserves the accountable lead and does not confer permanent access. |
| P2 | Changing an ordinary task's company name left its old `clientId`. This could disagree with the selected project or fail a server save. An accessible name could also conceal a foreign ID in crafted input. | Resolve the destination company ID with the name/project and reject mismatched identities. The database independently checks supplied IDs against canonical company names. |

Regressions failed before these fixes and passed afterward. Database checks call the authenticated command RPC and inspect persisted state and access; they do not depend on matching function source text.

## Scope and compatibility

- Reviewed PM company/project visibility, creation, task editing, assignment, commercial operations, review configuration, internal approval, completion, and client-review queues.
- Rechecked existing portfolio service boundaries and cross-role task controls through the complete unit/database suites and focused browser coverage.
- Confirmed company moves and direct-assignment delegation through the actual frontend store, Supabase Auth, command serialization, REST persistence, and a fresh workspace load.
- The full disposable rollout also verified storage permissions, workflow generation/signatures, downstream reopening, reviewer file access, client isolation, and PM final completion.
- Boss Koo retains cross-company task control. Existing task editing still works when creation is revoked. Routine updates preserve unchanged legacy company links, including missing historical IDs.
- Frozen workflow identity remains protected. This work does not rewrite historical task relationships or change the existing PM-completion/customer-acceptance rule.

The authenticated layout is loaded with the existing route Suspense boundary, keeping login startup within the unchanged bundle budget. Authenticated navigation and offline shell loading are checked in the final browser verification.

## Verification

All 681 unit tests, 897 database assertions, eight PM/cross-role browser scenarios, and the production offline-shell test passed. Typecheck, lint, strict translations, the production build, database lint/advisors, and the full disposable rollout gate passed. Eager JavaScript is 283.1 KiB gzip against the unchanged 300 KiB cap.

See [verification metadata](audit-evidence/pm-2026-10-15/verification.json) for commands and results. The dedicated new coverage is in `pmPortfolio.test.ts`, `taskAssignment.test.ts`, `pm-portfolio.spec.ts`, and `pm_task_company_boundaries.test.sql`. The authenticated PM save/reload probe extends `scripts/verify-staff-action-saves.mjs` and runs in the normal rollout gate.

## Rollout

`20261015014716_pm_task_company_boundaries.sql` is recorded in the manifest's validated tail and pending production migrations. Its guard runs inside both normal task commands and service/workflow command inserts. The function is private, has an empty search path, and is not executable by public API roles.

The migration and frontend require the repository's staging-first release process. Local validation does not mean the production vulnerability has been patched. Both disposable validation stacks were stopped after testing.
