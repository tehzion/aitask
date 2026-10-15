# Deliverable status audit — 15 October 2026

The original feedback showed a task-free ADS Management Fee rejecting **In Progress**. That case now supports manual status changes. The deeper audit found six related defects; fixes and regression coverage are implemented locally. Nothing in this audit was deployed to production.

## Confirmed defects and fixes

| Priority | Defect and trigger | Fix |
| --- | --- | --- |
| P1 | A frozen workflow with missing required steps could be marked Delivered locally when no tasks existed, or when only the existing subset was complete. Hosted writes could also mark ordinary deliverables Delivered while their required tasks were unfinished. | Check the frozen cycle workflow as well as linked tasks. Enforce readiness for both ordinary and generated work in the database. Required steps cannot be replaced by unrelated manual tasks. |
| P1 | Updating a delivered output in a Cancelled cycle could automatically change the cycle to Completed, making it eligible for client publication again. | Automatic cycle completion now updates only Published or Completed cycles. Draft and Cancelled cycles retain their publication state. |
| P2 | Workflows containing only optional tasks remained In Progress because readiness required a positive count of required tasks. | Optional work does not block readiness or delivery. Frontend and database derivation now agree. |
| P2 | The explicit linking action could detach a generated task from its frozen workflow locally; the database then rejected the identity change. | Reject frozen task identity changes before mutating local records. Ordinary invalid-link repairs remain supported. |
| P2 | Progress derived from an actor's partial hosted task snapshot could promote an output prematurely, or overwrite database progress based on hidden required work. | Preserve canonical output and cycle progress when linked task IDs are missing from the actor's snapshot. Allow confirmation of canonical Ready outputs without widening task visibility. Complete snapshots still derive paired task-link writes. |
| P2 | Direct delivery writes could omit deliveredAt, and task-driven reopening could retain a stale delivery timestamp. | Database writes stamp missing confirmation timestamps and remove them whenever an output is no longer Delivered. |

The status dropdown now disables unavailable transitions, explains whether progress is manual or task-controlled, has an accessible name, and uses localized labels with stable status values.

## Verification

- All 713 unit tests passed in the full suite run. Subsequent focused checks passed 80 tests covering status, linking, visibility, saves, and translations; the final eight audit regressions also passed after the last fixture refinement.
- 921 database assertions across 57 files passed on a disposable Supabase stack, including readiness, optional work, timestamps, cycle cancellation, permissions, and workflow review gates.
- Database schema lint, advisors, and rollout postflight passed. Advisors reported informational unused indexes on the fresh test database.
- Real authenticated Staff/HOD saves passed through the frontend store and REST API, including derived delivery/reopening, reverse links, invalid-link repair, reload, and lost-confirmation retry.
- Real authenticated workflow checks passed for generation, crafted request denial, hidden dependency summaries, canonical HOD signatures, and downstream reopening.
- All eight final browser cases passed: task-free In Progress persistence in English and Chinese, required-workflow status choices, task-link retry in both languages, invalid-link review, role isolation, and the service demo.
- TypeScript, targeted ESLint, and diff whitespace checks passed.

## Scope and remaining release conditions

Other work was active in the shared checkout during this audit. Its edits were preserved, and browser checks used a separate port.

The database gate excluded the unrelated unfinished `staff_task_contact_notifications.test.sql` fixture after its baseline setup failed with **Built-in roles cannot be assigned as custom member roles.** Its migration remained installed during the delivery checks. This exclusion must not be described as a pass of that fixture or of the unmodified release command.

Both delivery migrations remain listed as pending production migrations:

- `20261015064701_manual_deliverable_progress`
- `20261015065635_deliverable_status_integrity`

Existing production data was not rewritten or audited for historical status/timestamp inconsistencies. The migrations enforce future writes and task-driven refreshes; deployment remains outstanding.
