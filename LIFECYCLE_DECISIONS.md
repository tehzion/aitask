# Lifecycle Decisions

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Status:** Approval required before implementation

## Existing behaviour and established rules

| Area | Existing implementation | Established behaviour | Gap/risk |
| --- | --- | --- | --- |
| Task completion | Staff submission → HOD/internal review → PM completion; completion is distinct from client acceptance | PM may complete client-visible work before client acceptance; client review is a separate audited decision | No material policy gap identified in this phase |
| Task reopening | Approved/completed work is returned through revision/reopen guards; approval state and completion fields are invalidated | Revisions must not silently edit approved output | Covered by existing workflow tests and database guards |
| Project completion | `Project` has no lifecycle status or completion transition; task completion is calculated independently | No explicit project completion/archive rule found | Project-level reporting can disagree with task-level history |
| Project archive/reopen | No archive fields, archive RPC, archive view, or reopen flow | No approved project archive semantics found | Deletion/detachment is not a substitute for an operational archive |
| Member removal | Super Admin deletion removes the member row and unassigns tasks | Historical snapshots preserve evidence | No inactive state, reactivation, or stable directory identity |
| Department changes | Department membership and future assignment eligibility are guarded; task records retain their prior department/assignment fields | Historical task attribution is retained | Current directory changes can affect future visibility and reviewer eligibility |
| Client removal | Client deletion can cascade operational entities | No approved archive-first requirement found in the repository | Historical reports cannot use normal live projections after cascade |

## Decision matrix for business-owner approval

The matrix below separates observed behaviour from a proposed policy. The proposed column is not an implementation approval; it is the smallest decision set needed before changing the lifecycle model.

| Decision | Existing behaviour | Proposed behaviour for approval | Affected roles | Database impact | UI impact | Reporting impact | Security impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project completion | Projects have no lifecycle status. Task completion is stored/calculated independently. | Add an explicit project completion state only if the owner wants a project-level milestone; define whether all required tasks must be terminal. | Super Admin, Project Manager, HOD, Staff | Project status/timestamps, transition guard, audit event, aggregate validation. | Complete action, prerequisite feedback, read-only state if completed. | Project totals must distinguish task completion from project completion. | Only authorized management roles may complete; prevent forged completion through direct RPC/table writes. |
| Project archiving | No archive state or archive RPC. Deleting a project removes it from the operational projection and detaches linked tasks locally. | Prefer reversible archive; preserve linked records and history, exclude archived work from active views, and record actor/reason. | Super Admin and/or Project Manager depending on approval. HOD/Staff become read-only observers if permitted. | `archived_at/by/reason`, archive transition guard, RLS/report predicates, audit event. | Archive confirmation, archived badge/filter, read-only treatment, conflict feedback. | Active dashboards exclude archived projects; historical reports include them when authorized. | Archive must not bypass task/client scope or expose another company. |
| Project reopening | No project reopen flow. Task revision/reopen exists and invalidates affected approval/completion state. | Reopen only through an explicit authorized action; define whether it restores editability/new work or is correction-only. | Super Admin plus optional owning Project Manager. HOD/Staff follow normal task permissions. | Reopen transition, reason, actor, version check, audit event. | Reopen confirmation and explanation of which tasks/approvals are affected. | Reopened work must be counted as active only after the defined activation rule. | Reopen cannot silently resurrect deleted members, assignments, or approvals. |
| User deactivation | Super Admin deletion removes the member directory row and unassigns active tasks; no inactive state exists. | Prefer deactivation/tombstone; block login, new assignment, and approval authority while retaining stable historical identity. | Super Admin; affected PM/HOD/Staff; current user cannot self-escalate or self-delete. | `is_active`, deactivation metadata, assignment/approval guards, session invalidation strategy, audit event. | Deactivate action, status badge, reassignment workflow, no destructive “delete” wording. | Historical attribution resolves to the inactive member; active staffing reports exclude them. | Existing sessions must be revoked or rejected for sensitive actions; inactive member cannot use stale JWT indefinitely. |
| User reactivation | No member reactivation flow because deletion is destructive. | Super Admin may reactivate a tombstoned member after verifying identity and role/department scope. | Super Admin; reactivated member; HOD/PM affected by assignments. | Reactivation metadata, versioned transition, permission reset/review, audit event. | Reactivate action and confirmation; require password/session recovery as appropriate. | Member returns to active directory from the reactivation timestamp; historical reports remain unchanged. | Do not restore stale elevated permissions automatically; revalidate role, departments, and sessions. |
| Permanent user deletion | Secure account service deletes the Auth user/member and unassigns tasks; local mode also removes directory rows and local credentials. | Require separate owner-approved retention/privacy rule; default should be blocked when historical attribution or legal retention requires identity. | Super Admin only; affected task/project/client/report readers. | Soft-delete/tombstone or immutable identity reference; controlled Auth deletion; audit event before deletion. | Strong warning, impact summary, no one-click irreversible delete. | Historical reports retain an immutable display identity even if login is removed. | Revoke sessions first; prevent deletion of protected Super Admins; ensure no orphaned ownership/approval authority. |
| Client archiving | No client archive state. Operational lists and linked entities can be removed by client deletion. | Prefer archive-first; hide from active lists while retaining linked projects/tasks/plans/cycles for authorized history. | Super Admin and authorized PM/HOD according to owner-approved scope; Staff/Client read-only or hidden. | Client archive metadata, link-preserving guards, RLS/report predicates, audit event. | Archive confirmation, archived filter, read-only client workspace. | Active client counts exclude archives; historical metrics include archived relationships. | Cross-company visibility must remain scoped; archived client data must not become public through history views. |
| Client deletion | Client deletion can cascade clients, projects, tasks, plans, cycles, deliverables, comments, add-ons, snapshots, notifications, and client users in local state; production RPC has cascade semantics. | Keep permanent deletion as an exceptional, owner-approved privacy operation only after retention/export checks. | Super Admin or explicitly authorized client manager; no ordinary Staff action. | Controlled deletion procedure, dependency checks, immutable audit/history retention, no accidental cascade. | Require impact preview, reason, confirmation, and explicit irreversible warning. | Deleted client excluded from active reports but retained as a redacted historical reference if policy requires. | Verify all related Auth sessions, Storage objects, notifications, and signed URLs are revoked or removed according to retention policy. |
| Historical reporting | Audit events/history preserve some evidence, but current directory/projection rows can disappear after deletion and there is no archive projection. | Read historical snapshots by authorized role; distinguish current state, archived state, deleted/redacted state, and event-time department/assignment. | Super Admin, PM, HOD according to scope; Staff only for permitted work history; Client only for permitted client-visible history. | Immutable snapshots, actor/assignment/department-at-time fields, retention policy, report-safe views/RPCs. | Historical filters and clear “archived/deleted at time” labels. | Reports must use event-time facts, not current member department or current ownership. | History is append-only, RLS-protected, and excludes secrets; no unauthorized cross-company reconstruction. |

## Proposed defaults supplied for owner review

These are the requested proposals, not silently approved requirements.

### Project lifecycle

- Active projects can be completed.
- Completed projects can be archived.
- Archived projects are read-only for normal users.
- Archived projects remain available in authorized historical reports.
- Authorized management roles can reopen archived projects.
- Archive and reopen actions are recorded in immutable audit history.

### Member lifecycle

- Deactivation is the default.
- Deactivated members cannot access the system or receive new assignments.
- Historical activities retain the member identity.
- Super Admin reactivation is supported.
- Permanent deletion requires separate approval.

### Client lifecycle

- Archiving is the default removal action.
- Archived clients and linked records remain available to authorized historical reporting.
- Archived clients are excluded from active operational lists.
- Permanent deletion requires separate approval and a retention/privacy policy.

## Conflicts and unresolved choices

The proposals are directionally compatible with the existing historical-integrity goal, but they conflict with current destructive operations and require details that the repository does not establish:

| Decision | Option A | Option B | Required owner choice |
| --- | --- | --- | --- |
| Member removal | Deactivate/tombstone with `is_active`, timestamps, stable display identity, and reactivation | Keep permanent deletion and history-only lookup | A or B |
| Project removal | Reversible archive with read-only historical visibility and explicit reopen | Retain deletion/detachment semantics | A or B |
| Client removal | Archive-first, exclude from active lists, retain historical reporting | Keep destructive cascade with documented history-only retention | A or B |
| Archive eligibility | Only after all required tasks are terminal | Allow archive at any point with explicit warning | Owner choice |
| Reopen authority | Super Admin only | Super Admin plus owning Project Manager | Owner choice |
| Reopen effect | Restore project editability and permit new work | Reopen only for reporting/correction; new work requires separate activation | Owner choice |
| Deactivated member work | Preserve assignments as historical ownership; block only future work | Unassign all active work immediately | Owner choice |

## Required implementation after approval

No lifecycle schema or policy implementation is included in this phase. After approval, implementation must be coordinated across:

1. Supabase schema fields, constraints, RPCs, triggers, RLS, and audit events.
2. Application types, secure command serialization, access checks, mutation recovery, and session invalidation.
3. UI actions, confirmation flows, read-only/archive views, and reopen/deactivation feedback.
4. Dashboard/report filters distinguishing active, archived, and historical records.
5. Notification routing so archive/deactivation/reopen events reach only authorized audiences.
6. Regression, pgTAP, four-role authenticated, historical-report, and concurrency tests.

## Approval record

Owner approval is pending. The production gate must remain **NO-GO** until the choices above are recorded and implemented consistently.
