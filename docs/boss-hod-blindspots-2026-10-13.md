# Boss Koo and HOD blind spots — 13 October 2026

Two corrections are implemented locally: destructive task authority is separate
from editing, and Boss workload reporting supports equal department memberships.
The third priority, reviewing HOD approval and handover ownership, confirmed an
unenforced review gate. That finding is recorded below; this change does not
introduce a new approval workflow.

## Task deletion authority

Department visibility still grants routine task edits and comments. For HOD and
department-scoped Staff custom roles, deletion now requires the same authority as
delegation: the task is in the actor's departments, `manageCreatedTasks` is enabled,
and the actor created the task or is its current assignee. Past assignment or
delegation alone is insufficient. Boss Koo retains unrestricted deletion;
ordinary Staff and Project Manager rules remain unchanged.

The shared task access result, task details Delete button and store action use the
independent predicate. Migration `20261012165347_hod_task_deletion_authority`
adds a private database helper and updates only the task deletion branch of the
existing mutation validator. Command and direct-table policies share that
validator. The new helper has a fixed empty search path and no execution grants
to PUBLIC, anonymous, authenticated or service roles.

Regression coverage verifies department edits without deletion, current
assignment, creator ownership after delegation, permission revocation,
out-of-department assigned work, scoped custom roles, rejected commands retaining
records, and Boss deletion. UI coverage confirms that delegating a PM-created task
removes the HOD's Delete control while keeping Edit available.

## Department workload

Member filters match every normalized department membership. Person rows keep
the person's total assigned workload; the heading explains that scope.

Department rows count tasks by their normalized task department, once per task.
They include secondary departments, legacy `Editor` aliases and assigned work
whose department differs from the assignee's membership. Client contacts,
directory-only contacts, unknown assignees and unassigned work are excluded from
this assigned-team view. Unassigned work remains an independent operational
exception rather than being attributed to a team member.

Search and sorting continue to work in both views. Desktop and mobile checks
verify that a multi-department member appears under Video Editor and that the
same fixture counts one Shooting task and two Editing tasks, without duplication.
Both new explanatory labels have Chinese translations.

## Review and handover audit

**Confirmed unresolved finding:** an assigned Staff member can complete a frozen
`internal_review` task while its predecessor remains Pending.

A temporary diagnostic created a real client plan and generated the ten-step
Short Video workflow through the store. Boss assigned step 3 (Script Internal
Review) to an Operation Staff member. With step 2 still Pending, the Staff actor's
`updateTaskStatus(..., 'Completed')` returned `{ ok: true }` and the review task
became Completed. The intended denial assertion failed, confirming the gap.
The diagnostic was removed rather than retained as an expectation of incorrect
behavior. Its output is in `/private/tmp/aitask-hod-review-ownership-probe-20261013.log`.

A production SELECT inspected eight signatures of the task edit/mutation,
entity guard, command and progress functions. None explicitly referenced
`internal_review` or `predecessorTaskIds`. This supports the source finding but
does not establish every hosted timing or authorization path; no production
task update was attempted.

Handover checks confirm immutable task creation ownership, actor-stamped
`assignedBy`/`assignedAt`, retained attribution on non-assignment edits, and
continued appearance in the HOD's Delegated by me scope after delegation.
There is no separate permanent accountable-lead or named internal-review decision
record. Later reassignment can replace the last assigner, so that field should
not be treated as permanent outcome ownership.

An enforced review feature needs an explicit reviewer/cover model, a decision
bound to the reviewed output version, server-enforced review/dependency gates,
and invalidation after revisions. Boss/PM overrides must be explicit and audited.
These are additional product changes, not guarantees supplied by this patch.

## Verification and rollout

- Full unit suite: 552 tests passed across 76 files. The additional scoped-custom-role
  case subsequently passed in the 12-test HOD permission suite.
- Browser coverage: 27 distinct checks passed across the HOD permission suite
  and the final workload/task-authorization/deletion-recovery run.
- Final disposable database run: 43 pgTAP files, 606 assertions passed; schema
  lint and security advisors passed their error gates. The stack was cleaned up.
- TypeScript, scoped ESLint, strict translations, production build, whitespace
  and bundle checks passed. Eager JavaScript was 298.4 KiB gzip against 300 KiB.
- Real local Storage checks and assigned Staff/HOD delivery persistence passed
  in the broader rollout gate. That gate later failed the separate Client
  approval-without-staff-directory scenario with FORBIDDEN. The complete
  Auth/REST/onboarding gate is therefore not claimed as passed.

The role guide now accurately reserves Approvals for Boss Koo and describes
editable built-in templates and the deletion boundary.

The frontend and new deletion migration have not been deployed. The migration
is recorded as pending in the release manifest. Existing delivery/privacy work
in this shared checkout was preserved; no unrelated files were committed,
no staging deployment was performed and no production business records changed.

## Commit isolation and compatibility

The commit stages only this chat's changes. Shared translation and release-manifest
files are staged selectively; the committed manifest lists only migrations
present in the commit.

The deletion migration also supports the parallel Client projection wrapper by
updating its retained validator instead of replacing the wrapper. HOD deletion
assertions passed with that wrapper in a disposable database. The combined
snapshot failed five separate notification/direct-access checks introduced by
the parallel wrapper, so its migrations remain outside this commit. The isolated
staged frontend passed 74 relevant unit tests and TypeScript checks.
The exact staged migration set passed all 597 database assertions across 42
files, schema lint and security-advisor error gates in a separate disposable run.
