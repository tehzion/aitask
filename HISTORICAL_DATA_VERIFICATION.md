# Historical Data Verification

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)

## Verification objectives

Historical records must remain attributable after a member changes role/department, a PM/HOD relationship changes, a task is reopened, a project is deleted, or an account/client is removed.

## Current evidence

| Requirement | Current mechanism | Result |
| --- | --- | --- |
| Preserve prior task status/approval data | task `workHistory`, `approvalHistory`, `revisionCount`, review provenance | PASS for retained tasks |
| Preserve assignment attribution | `assignedBy`, `assignedAt`, task history, row versions | PASS for retained tasks |
| Preserve reviewer decision | server-owned `reviewDecision`, approval history, audit event | PASS |
| Preserve deleted task values | new `aitask_entity_history` DELETE snapshot | FIXED; staging execution pending |
| Preserve deleted member values | new member history trigger snapshot | FIXED; staging execution pending |
| Preserve prior client/project/service values | new history trigger on every entity row | FIXED; staging execution pending |
| Keep normal reports scoped | RLS-filtered snapshot and role selectors | PASS in source/tests |
| Keep date-only fields calendar-safe | `parseISO`, workspace business calendar, `Asia/Kuala_Lumpur` server reminders | PASS in unit/source review |
| Keep archived/deleted rows visible to ordinary reports | no archive/tombstone projection | NOT SATISFIED |

## Historical verification cases

### H-01: Department transfer

1. Capture a task assigned to a Staff member in Department A.
2. Move the member to Department B.
3. Confirm the old task remains attributed to the original member and original task department.
4. Confirm future assignment eligibility uses Department B.
5. Confirm HOD review scope changes only for future/current authorization, not the prior task snapshot.

Source controls: multi-department normalization, assignment validation, task history, optimistic versions.

Status: source/unit coverage PASS; live historical report verification NOT RUN.

### H-02: PM/HOD reassignment

1. Record `createdBy`, `assignedBy`, and `assignedAt` on work.
2. Change client/project ownership or reviewer cover.
3. Confirm the prior reviewer/owner values remain in task history/value history.
4. Confirm the new scope applies to new actions only.

Status: source/database guards PASS; live role handoff NOT RUN.

### H-03: Reopen approved work

1. Approve work.
2. Reopen it through the revision path.
3. Verify approval state is invalidated, revision count increments, and prior approval remains in history.
4. Verify completion timestamps do not silently survive a reopened task.

Status: task transition and workflow tests PASS.

### H-04: Delete task/member

1. Delete a task or member in a transaction.
2. Verify the source row is absent where current operational semantics require deletion.
3. Verify the immutable history row contains the complete prior JSON, actor, action, timestamp, and changed fields.
4. Verify unauthorized users cannot read or mutate the history row.

Status: new pgTAP structural coverage added; live execution NOT RUN.

## Historical reporting limitation

The history remediation protects forensic accuracy but does not automatically make deleted rows appear in dashboards. The current UI deliberately reports current authorized operational rows. If the business requires historical trend reports to include archived/deleted projects, tasks, members, or clients, an authorized archive projection must be built on top of `aitask_entity_history` with explicit retention and privacy rules.

The new snapshots are prospective: existing compact audit events are not backfilled because their replaced values were never stored. Production rollout must therefore record the migration cutover timestamp and treat pre-cutover events as action-level evidence only.

## Date/time verification

- Date-only task and cycle fields are parsed as calendar dates, not browser-local timestamps.
- Server reminders use the workspace reminder timezone, defaulting to `Asia/Kuala_Lumpur`.
- Current period, overdue, monthly, and weekly calculations use shared selectors/helpers.
- A staging run crossing local midnight and a DST-bearing browser timezone should still be added to release acceptance, even though Malaysia itself does not observe DST.
