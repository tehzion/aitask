# Staff dashboard accuracy — 7 October 2026

## Outcome and scope

The original production audit found four Staff calculation/refresh discrepancies. All four are now corrected in the local implementation. The original observations are preserved below; the implementation and regression results follow at the end.

The production build endpoint identified commit `00c9d0c632575f9d6ac741c8d8d87acf10face48`, version 2.6.1. Browser checks used that committed source in a disposable snapshot with synthetic Staff records and the Asia/Jakarta timezone. Other dashboard work in this shared workspace was preserved. Application code, production records, permissions and deployment settings were not changed during the initial audit.

## Original reproduced discrepancies

| Display | Actual | Expected | Cause |
| --- | --- | --- | --- |
| Production/Operation context: Blocked steps | 0 blocked tasks when an assigned task has one open, accessible predecessor created by Staff and now assigned to another member. | 1 blocked task. | The dashboard filters its dependency lookup down to the current member's assignments. It omits a predecessor that the member is still authorized to view. |
| Account context: Assigned clients | 2 clients with one assigned company and one company represented only by a Staff-created task assigned to another member. | 1 assigned client, or a label explicitly describing all visible clients. | The counter uses all visible tasks while the surrounding queue and description refer to assigned work. |
| Account context: Renewals | 0 renewals at 00:30 on 7 October for a contract ending 6 November. | 1 renewal, exactly 30 local calendar days away. | The lower bound uses the local date, while the upper bound adds elapsed milliseconds and takes the UTC ISO date. This drops the final day near local midnight. |
| Daily figures and queue urgency | Due today remains 2 after midnight on 8 October, while independently recomputed assigned open tasks due that day total 1. | Refresh to the new local day without requiring a task mutation or page reload. | The deployed dashboard has no local-day refresh dependency. |

Production source references:

- [Assignment filter](https://github.com/tehzion/aitask/blob/00c9d0c632575f9d6ac741c8d8d87acf10face48/src/components/StaffMyWork.tsx#L36)
- [Blocker calculation](https://github.com/tehzion/aitask/blob/00c9d0c632575f9d6ac741c8d8d87acf10face48/src/components/StaffMyWork.tsx#L60)
- [Client and renewal calculations](https://github.com/tehzion/aitask/blob/00c9d0c632575f9d6ac741c8d8d87acf10face48/src/components/StaffMyWork.tsx#L62)
- [Local date calculation](https://github.com/tehzion/aitask/blob/00c9d0c632575f9d6ac741c8d8d87acf10face48/src/components/StaffMyWork.tsx#L34)

## Verified behavior

- Assigned work is isolated from another member's unrelated task. In the fixture, Needs action = 1, Up next = 1, Waiting = 1 and Done = 2.
- Due today = 2 and Waiting review = 1 matched independently computed assigned/open records before the day changed. Completed tasks were excluded even when a legacy completion flag was false.
- Done intentionally groups Completed and Cancelled tasks; it is a closed-work queue, rather than a completed-only count.
- Linked outputs counts distinct deliverable IDs referenced by assigned, non-cancelled tasks, including historical work. It is not a delivered-output count.

## Read-only production data checks

Four ordinary Staff accounts were checked, excluding HOD using the deployed helper. Totals below are a backend data snapshot, not an authenticated rendering of each account's dashboard:

| Department(s) | Assigned tasks | Open | Due 7 October | Waiting review | Open revisions | Assigned client names |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Video Editor | 34 | 4 | 0 | 0 | 0 | 11 |
| Designer | 0 | 0 | 0 | 0 | 0 | 0 |
| Designer | 52 | 1 | 0 | 0 | 0 | 23 |
| Video Editor, Designer | 41 | 9 | 0 | 6 | 0 | 26 |

There are 14 open assignments across these accounts and none due on 7 October. Two accounts have one creator-only task each, but their currently visible and assigned client-name counts are equal, so the assigned-client discrepancy was demonstrated with synthetic data rather than claimed as a present mismatch in these four accounts.

An additional production reference check found one distinct assigned output link, zero dangling assigned output references and zero completed-status/completion-flag mismatches among assigned, non-cancelled Staff tasks.

## Original audit verification

Five diagnostic browser checks passed: one asserted correct queue/basic-metric behavior, and four asserted the reproduced discrepancies against independent expected calculations. These are diagnostic probes, not a passing implementation regression suite. They remain outside the repository in the disposable audit snapshot.

The first fixture reused a built-in demo member whose department was normalized during initialization. The final probes use an isolated Staff identity and completed in 11.8 seconds.

Newer dashboard changes in the local branch/workspace were outside the original production-source audit. No production records were changed by it.

## Implemented corrections

- Keep all permission-visible tasks for dependency lookup, while retaining the assigned task scope for ordinary Staff queues and metrics. Dashboard blocker totals and task-row badges now agree on visible predecessors, including work assigned to someone else. Inaccessible task details remain excluded.
- Derive Account Staff client and active-plan counters from assigned work. Merely creating another member's task no longer increases the assigned-client counter.
- Use the shared calendar-day contract helper for the inclusive 0–30 day renewal window. Expired, day-31, invalid and absent deadlines are excluded.
- Subscribe Staff directly to `useLocalToday`. Queues, due-today counts, renewal counts and the date heading update at local midnight and when a suspended tab resumes. HOD workload calculations also receive the current local date as a memo dependency.
- Extract pure scoped calculations into `src/lib/staffDashboard.ts` for direct regression coverage.

## Final verification after corrections

Verification used a disposable snapshot of committed baseline `85d3efb` plus these Staff changes, with its own Vite dependency cache.

- **457 unit tests passed across 67 files**, including seven new scoped-metric tests.
- **29 browser scenarios passed**, including eleven new Staff dashboard regressions plus existing HOD permission and role UX cases. Coverage includes Operation and Designer blocker counts, inaccessible dependencies, assignment/plan changes, the renewal boundary, local midnight, resumed tabs and mobile layout.
- TypeScript, scoped ESLint, translation coverage (zero findings across 128 source files), and production/PWA build passed.
- No database migration or Edge Function change is required. Existing Supabase records and permission checks are used by the corrected frontend calculations.

This follow-up is committed locally only. It does not push or deploy the corrections; the production-source findings above describe the version audited before this follow-up.
