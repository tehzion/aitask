# AiTask Role & Project Permission Enhancement

**Assessment date:** 2026-10-20
**Scope:** Project Manager project assignment, HOD project membership, approval authority, visibility boundaries, and project-health reporting.

## Existing system assessment

AiTask already has a central workspace member directory (`aitask_members`), entity-backed projects and tasks (`aitask_entities`), secure workspace commands, database RLS helpers, and append-only entity history. Staff accounts are already shared across projects; task assignment is the project-specific relationship for Staff.

Before this change, Project Manager scope was inferred from project creators, company ownership, task creators, and assignees. That meant a PM could inherit access to work without being explicitly assigned to its project. HODs were department-scoped but did not have an explicit project membership list. Project editing was largely creator-based. Review actions and task approval were already configurable at the task level, including an approval opt-out; project-wide defaults were not modeled.

The existing invitation, role-change, and deactivation paths are Super Admin-controlled. The schema has no project closure state or first-class project milestone entity. Service plans, cycles, and deliverables are attached to a company/client rather than to an individual project.

## Current permission matrix

| Role | Project and task scope | Operational authority | Account/system authority |
| --- | --- | --- | --- |
| Boss Koo (Super Admin) | All projects, tasks, and departments | Override and audit all operational work | Full user, role, settings, and system access |
| Project Manager | Explicitly assigned projects; legacy relationships are converted to explicit assignments by the migration | Manage assigned projects/tasks, assign work, approve/reopen within scope, and manage HOD membership in assigned projects | PM assignment changes remain Boss-only; account administration remains Boss-only |
| HOD | Explicitly assigned projects plus existing department/task rules | Assign and review work within assigned departments/projects; no PM override authority | No global user or system administration |
| Staff | Tasks assigned to them across projects, plus existing permitted task context | Update and submit assigned work | No project or account administration |
| Client | Existing client-visible information only | Existing client actions only; internal workflow remains separate | No internal administration |

## Implemented in this change

- Added `projectManagerIds` and `hodMemberIds` to the project model and a compact project-team editor. Only Boss Koo can change PM assignments; Boss Koo or an assigned PM can manage HOD membership within the project.
- Added a database migration that backfills existing PM and HOD relationships, adds membership indexes, and applies project-aware read, edit, review, service-client, and central-command checks. A database trigger protects project membership fields against direct table writes and validates assigned account roles.
- Updated local authorization to use the same explicit project boundary. Linked-task creator, assignee, or client ownership no longer gives a PM access to a different PM’s project. Staff retain cross-project access to tasks assigned to their single account.
- Restricted PM task-review authority to assigned projects and aligned notification recipients with PMs who can actually view the task.
- Updated the Boss Koo client/project monitor to show and filter by assigned PMs, including projects with multiple PMs.
- Added project health indicators based on overdue work, near-term deadlines, pending internal review, completion, and assigned staff. These rules are visible in `src/lib/pmDashboard.ts` and covered by unit tests. The next project/task deadline is used because a project-milestone entity does not yet exist.
- Kept approval optional at the task level and added the focused PM approval-authority migration from the preceding Jing Yi review work. The existing append-only entity history records project membership edits and task transitions.
- Added Simplified Chinese labels for the new project-team and health controls.

## Remaining limitations and rollout notes

1. PM creation, editing, and deactivation of HOD/Staff accounts is not implemented. The existing invitation and member-role mutation paths remain Super Admin-only. Extending them safely requires project-specific account memberships and a global-deactivation impact check so a PM cannot alter another PM’s shared employee assignments.
2. Project closure and first-class project milestones are not implemented because neither has a current data model or workflow. The health dashboard uses dates and task/review state as a transparent proxy; it does not claim milestone completion.
3. Service plans, cycles, and deliverables are company-level records. Access is now gated by assigned-project/company scope when projects exist, but if one company has multiple projects, those records cannot yet be separated per project. A follow-up schema change must attach these records to project IDs before claiming strict per-project confidentiality for them.
4. Approval can be configured per task today. A project-level default for “No approval / HOD / PM” is not yet available.
5. The new Supabase migrations and pgTAP scenario test are local source changes only. They have **not** been applied to the live AiTask project. The local Supabase database is behind several repository migrations, so the new SQL test was not run against it; resetting that database would be destructive and was not done. Run the migration and database scenarios in a clean, current staging environment before production rollout.
6. The live task `C10-09v 三个人访问` and production data have not been changed in this session. The Jing Yi approval-authority fix will not affect the live task until its migration is deployed.

## Verification performed

- `pnpm check` — passed.
- Full Vitest suite — 113 files, 864 tests passed.
- `git diff --check` — passed.
- Supabase schema lint was previously run against the existing local database and found no errors in that database; it does not validate the new migration because the local database is behind the current migration history.
