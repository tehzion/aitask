# Data Lifecycle Report

**Audit date:** 2026-10-17 (Asia/Kuala_Lumpur)

## Lifecycle map

| Record | Create | Change | Deactivate/archive | Delete | Historical result |
| --- | --- | --- | --- | --- | --- |
| Member | Super Admin onboarding/invitation | role, department, permissions, profile | No first-class inactive state | Super Admin hard-delete endpoint | Full deleted row now preserved in `aitask_entity_history`; ordinary directory lookup loses the member |
| Department membership | Super Admin/member administration | normalized multi-department list | Removed membership changes future eligibility | Not separately deleted | Prior task department and assignment snapshots remain; current workload follows current membership/scope |
| Project Manager ownership | client/project/task attribution | guarded ownership and portfolio updates | No project-manager assignment history table | client/project deletion may remove ownership context | `createdBy`, `assignedBy`, `assignedAt`, and history snapshots preserve prior values |
| HOD/reviewer | role/departments/review cover | guarded reviewer configuration | Expired review cover falls back to eligible reviewers | member deletion removes directory row | Review decision stores reviewer ID/time; history preserves prior task and member values |
| Project | PM/Super Admin create | guarded identity/date/service updates | No explicit project archive field | delete detaches tasks locally/through diff | Tasks remain, but project association is cleared; history preserves project before delete |
| Task | PM/HOD/Staff according to role | status, assignment, evidence, dates, comments | Cancelled is terminal; approved/completed work requires revision path | authorized delete | Embedded work/approval history plus immutable before/after history; task is not present in ordinary live reports after deletion |
| Approval/review | internal/client decision path | append decision, reject/revision | no silent overwrite | child rows may be removed with task | Decision remains in task history and value-history snapshots when task changes/deletes |
| Client profile | authorized create/ownership | profile/owner edits | no explicit archive state | cascade delete | Full deleted rows are now recoverable to authorized auditors, not to normal reporting |
| Service plan/cycle/deliverable | service commands/cron | guarded revision, publication, progress | Paused/Ended/Cancelled/Completed as applicable | client cascade/package/template deletion paths | Plan/cycle snapshots freeze pricing/workflow; value history preserves later mutations/deletes |
| Notification | server/client command recipient | read state only for recipient | read/unread tombstones | task deletion cleanup removes stale routes | Notification history is captured when rows are changed/deleted; stale task routes are intentionally removed |

## Findings

### DLR-001 — Historical-value capture — REMEDIATED

Before this pass, audit records identified that a change happened but did not contain the replaced values. The new history table records:

- actor member ID;
- actor snapshot (name, email, and role at the time of the action);
- action and entity identity;
- command ID when the primary command RPC sets it;
- command type;
- timestamp;
- changed fields;
- full before and after JSON values.

The table is protected by RLS, has no authenticated insert/update/delete grants, and has an append-only trigger.

### DLR-002 — Deactivation policy is missing — OPEN / HIGH

There is no `is_active`, `deactivated_at`, or effective-date membership model. A removed member is deleted rather than retained as an inactive identity. This affects reactivation, historical display names, assignment history, and reviewer accountability.

### DLR-003 — Client deletion removes operational history from normal projections — OPEN / HIGH

The cascade is atomic and permission-checked, but it is destructive from the business-report perspective. The immutable history table reduces forensic loss; it does not restore historical records to dashboards or reports.

### DLR-004 — Project archive is not represented as a durable state — OPEN / MEDIUM

Projects have create/update/delete behavior but no explicit archived status or archived timestamp. Deleting a project preserves tasks by detaching them, which avoids task loss but loses the project-level historical grouping in normal reports.

## Required lifecycle policy before production

1. Decide whether member removal is deactivation or irreversible deletion.
2. Decide whether clients/projects/tasks are legally and operationally erasable or must be tombstoned.
3. Define retention periods and who can read historical snapshots.
4. Add archive/tombstone fields and effective dates if historical reporting must remain user-visible.
5. Backfill and verify existing deleted-ID lists before enabling a live archive view.
