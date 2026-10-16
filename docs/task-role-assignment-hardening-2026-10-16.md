# Task role assignment, update and notification hardening — 16 October 2026

This change closes the assignment, update and notification findings raised across
the Staff, HOD and Project Manager deep audits, and removes the shared root causes
so the same class cannot recur. Review/approval authority is unchanged: only real
HODs (including the `builtin-hod` promotion), an active review cover, the owning
Project Manager fallback, or Boss Koo may approve submitted work.

## Findings and fixes

| # | Finding | Fix |
| --- | --- | --- |
| 1 | A department-scoped custom role was titled "Department work" on the pages but "My work"/"All work" in navigation and All work. | `navigation.ts` and `StaffAllWork.tsx` now key the department-lead label off `isDepartmentScopedUser`, matching `StaffMyWork`. |
| 2 | HOD `/tasks` had two tablists controlling one panel (invalid ARIA). | The HOD scope tablist controls its own `hod-scope-panel`; the queue tablist controls `all-work-panel`. `StaffMyWork` queue tabs now declare their panel too. |
| 3 | A Project Manager changing a task's department auto-selected a staff member the HOD-first rule forbids. | `TaskDetailsModal` derives the default assignee from `assignableTaskAssignees`. |
| 4 | The stage-1 rule was bypassable by changing the department only. | `store.updateTask` runs the stage check on assignee **or** department change; `aitask_task_assignment_is_valid` requires `v_new_assignee <> v_old_assignee or v_new_department is distinct from v_old_department`. |
| 5 | Frontend/DB HOD parity for HOD-base custom roles. | Verified equivalent: `isHodRole` requires `isBuiltin`, so `isHodUser` for Staff already means `builtin-hod`, matching the SQL. Documented; no change. |
| 6 | Returning submitted work through the status picker did not notify the assignee. | `updateTaskStatus` adds an assignee `Task Status Updated` notice for `Pending`/`In Progress`/`Revision` returns; reviewers are filtered from the generic notice and keep their own handoff. |
| 7 | A department-scoped Staff lead who delegated work was invisible to contact notifications. | `resolveTaskUpdateRecipientIds` includes any accountable internal contact (`hasLogin` + `canViewTask`); `aitask_guard_staff_notification_insert` allows an internal task contact beyond real HODs. |

## Root causes removed

- **One label predicate.** Department oversight labelling uses
  `isDepartmentScopedUser` everywhere; reviewer/authority decisions use
  `isHodUser`. The two are deliberately distinct and documented in `access.ts`.
- **One stage validator.** The HOD-first check runs on every assignment change
  (assignee or department) in both the store and the database.
- **Contact notifications decoupled from HOD-ness.** The task contact (assigner
  or creator, excluding the assignee) is notified regardless of role; reviewers
  are notified by their dedicated handoff.

## Database

`supabase/migrations/20261016120000_task_role_assignment_and_contact_notification_hardening.sql`
recreates `private.aitask_task_assignment_is_valid` and
`private.aitask_guard_staff_notification_insert`, preserving every prior
invariant (one audience, command/task binding, `can_edit_task`, client
visibility). Registered in `supabase/preflight/migration_repair_manifest.review.json`.

## Verification

- Unit: `navigation.test.ts`, `taskStageProgress.test.ts`,
  `notificationRecipients.test.ts` cover the label predicate, the
  department-change rejection, the return-transition notice, and the
  department-scoped lead recipient.
- pgTAP: `pm_hod_first_assignment.test.sql` (department-only bypass rejected),
  `staff_task_contact_notifications.test.sql` (department-scoped Staff contact
  accepted; out-of-department Staff contact rejected).
- e2e: `staff-audit-regressions.spec.ts` asserts the HOD scope and queue
  tablists control distinct panels.
- Full gate: `pnpm check`, `pnpm lint`, `pnpm verify:i18n`, `pnpm test`, and
  `pnpm verify:supabase:rollout`.
