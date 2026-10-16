# PM role remediation — 16 October 2026

Deep dive into the Project Manager role (access helpers, store actions, PM UI,
SQL/RLS/RPC, tests) followed by fixes. Migrations are authored locally only;
no hosted database or deployment was changed. This follows the 14–15 October PM
audits and does not re-report their resolved items.

## Server security

| Priority | Finding | Fix |
| --- | --- | --- |
| P1 | `aitask_execute_service_command` authorized `entityType='client'` on the `manageClientPlans` capability alone. Because the RPC is `SECURITY DEFINER` and `aitask_entities` has no `FORCE ROW LEVEL SECURITY`, RLS did not apply and the PM service guard deliberately excluded `client`. An authenticated PM could rename, edit, re-own, or delete any company. | Both overloads now require `aitask_can_edit_client(old)` for update, caller ownership for delete, and `aitask_can_create_client` for insert, in addition to the capability. |
| P1 | Company ownership was mutable from the normal command path: `aitask_can_edit_client` accepts task-derived PMs and nothing compared old/new `createdBy`. | A `BEFORE UPDATE OR DELETE` trigger freezes `client.createdBy` for every non-super-admin and blocks foreign PM mutation/deletion. It does not fire on insert. |
| P2 | The service-client helper matched tasks/projects by `client_key`, so a duplicate company name could pull another portfolio's work into scope. | The helper now prefers `task.client_id` and `project.parent_id`; name matching remains only for id-less legacy rows. |

`20261016160000_pm_client_scope_and_ownership.sql` also makes
`createClients`/`deleteClients` authoritative for a PM override instead of being
short-circuited by `aitask_is_admin`.

## Frontend access and store

| Finding | Fix |
| --- | --- |
| Portfolio scope was keyed on normalized company **name**, so same-named foreign companies leaked tasks/projects into a PM's view/edit/delete and dashboards. | `ownedClientIds` + `matchesOwnedClient`: id-bearing records match only their company id; name is a legacy fallback. Applied to `canViewTask`, `canEditTask`, `canDeleteTask`, `isTaskInOwnedPortfolio`, `getVisibleProjects`. |
| A PM could delete a foreign task they were merely assigned to (no portfolio/creator requirement). | `canDeleteTask` requires creator or owned portfolio for a PM. |
| `createClients`/`deleteClients` overrides were ignored for a PM. | `canCreateClientProfiles`/`canDeleteClientProfiles` derive from the effective permission for every role. |
| `addTask` skipped deliverable/cycle scope for everyone except Staff/HOD; `updateTask` let non-workflow tasks set `deliverableId`/`serviceCycleId`/`visibility` unvalidated. | Deliverable links are validated for every role and via the explicit link rules. |
| PMs were blocked from linking/repairing delivery records by the Boss-only `editTasks` key. | `linkTaskToDeliverable` and the delivery-review panels gate on `canEditTask` scoped to the portfolio. |
| Boss-only "Member Added/Removed" notices targeted the `Project Manager` role, reaching every PM with a link to the denied Approvals page. | Those notices are targeted at the acting (Boss) member. |
| `deleteClientProfile` orphaned Client portal accounts; `deleteTask` left notifications pointing at the deleted task; a department change left stale review config. | Cleanup added for each. |
| `canRequestTaskRevision` granted every PM global revision authority. | Now requires `isResponsibleProjectManager`. |

## UX and documentation
- PM sidebar gains the portfolio task list (`/tasks`, "Portfolio work").
- Role-aware scope copy on Companies (`Companies in your portfolio.`), Reports
  (`Portfolio`), and the PM commercial summary (`owned portfolio`).
- `docs/role-templates.md` updated for the changed policies.

## Tests
- `src/lib/pmPortfolioIdScope.test.ts`: id isolation with duplicate names,
  legacy name fallback, delegated-PM deletion denial, revoked create/delete.
- `src/store/deliveryTaskLinks.test.ts`: PM link allowed in portfolio, denied
  for foreign work; the reversed Staff gate updated.
- `supabase/tests/database/pm_client_scope_and_ownership.test.sql`: foreign
  update/delete/re-own denied on both service-command overloads, own company and
  Boss control preserved, revoked capabilities enforced.

## Verification
- 799 unit tests pass; typecheck and lint clean; strict i18n audit 0 findings;
  production build passes; eager JS 291.6 KiB gzip against the 300 KiB cap.
- The migration was applied to a disposable PostgreSQL instance and the
  ownership/scope trigger passed six behavioral checks (own edit/delete allowed,
  own ownership change blocked, foreign edit/delete blocked, super-admin
  ownership change allowed).

## Rollout
`20261016160000_pm_client_scope_and_ownership` is recorded in the migration
manifest's validated tail and pending production list. Apply through the
repository's staging-first release process; local validation does not mean the
production gap is patched.
