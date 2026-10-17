# AiTask Lifecycle Policy Approval

**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Status:** **Approval required; no policy changes implemented**

This document separates current implementation from proposed business rules. The proposed rules are the defaults requested for owner review, not authorization to change the application or database.

## Proposed rules for approval

1. Projects are archived instead of routinely deleted.
2. Members are deactivated instead of routinely deleted.
3. Clients are archived instead of routinely deleted.
4. Workspaces are disabled or archived instead of routinely deleted.
5. Audit history remains append-only and is never cascaded away by ordinary deletion.
6. Authorized historical reporting remains available for archived/deactivated records.
7. Permanent deletion is a separate, approved retention/privacy process with impact review and audit evidence.

## Decision matrix

| Decision | Current behaviour | Proposed behaviour | Required application changes | Required database changes | Historical/reporting impact | Approval required |
| --- | --- | --- | --- | --- | --- | --- |
| Project completion | No project lifecycle status; task completion is calculated independently. | Add an explicit project completion milestone, with a rule for required terminal tasks. | Completion action, prerequisite feedback, role checks, read-only treatment if applicable. | Project lifecycle fields, transition guard, versioned RPC, audit event. | Separate project completion from task completion and preserve event time. | Yes: terminal-task rule and authorized roles. |
| Project archiving | No archive state or archive flow; project deletion removes the projection and detaches linked tasks. | Archive reversibly; exclude from active work while retaining authorized history. | Archive/reopen UI, filters, read-only state, conflict handling. | Archive metadata, RLS/report predicates, guarded RPC, audit event. | Active dashboards exclude archives; historical reports retain relationships. | Yes: archive authority and eligibility. |
| Project reopening | No project reopen; task revision/reopen exists and invalidates affected approval/completion state. | Explicit reopen with a defined effect: active work or correction-only. | Reopen confirmation, affected-task/approval explanation. | Reopen transition guard, reason, actor, version check, audit event. | Reopened records need unambiguous active/historical classification. | Yes: authority and reopen effect. |
| Member deactivation | Super Admin deletion removes the member row and unassigns active tasks. | Tombstone/deactivate; block login, assignment, and approval authority while retaining identity. | Deactivate action, status, reassignment workflow, session handling. | `is_active`, deactivation metadata, guards, audit event. | Historical attribution resolves to the inactive member snapshot. | Yes: reassignment behavior and session invalidation. |
| Member reactivation | No reactivation because deletion is destructive. | Super Admin reactivation after role/department review. | Reactivate action, password/session recovery, permission review. | Reactivation metadata and guarded transition. | Historical records remain unchanged; active directory resumes from reactivation time. | Yes: who may reactivate and whether permissions reset. |
| Member deletion | Secure account deletion removes Auth/member identity and unassigns tasks; protected Super Admins cannot be deleted. | Exceptional, separate retention/privacy process; preserve immutable historical identity or approved redaction. | Impact preview, reason, strong warning, no ordinary delete path. | Session revocation, deletion procedure, history retention/redaction controls. | Historical reports must not lose actor identity unexpectedly. | Yes: legal/retention policy and redaction rules. |
| Client archiving | No client archive; deletion can remove linked operational projections. | Archive-first; exclude from active lists, retain linked history. | Archive view/filter, read-only behavior, notification rules. | Archive metadata, relationship-preserving guards, RLS/report predicates. | Client metrics distinguish active, archived, and deleted/redacted. | Yes: archive authority and client visibility. |
| Client deletion | Client deletion can cascade linked projects, tasks, plans, cycles, deliverables, comments, add-ons, snapshots, notifications, and client users. | Exceptional permanent deletion only after retention/export/session/storage checks. | Impact preview, explicit reason, irreversible approval flow. | Controlled cascade or archival process, history retention, storage cleanup, audit event. | Historical reports use retained snapshots or approved redaction. | Yes: deletion conditions and retention period. |
| Workspace deletion | Workspace deletion is not an approved lifecycle flow; current history FK is `ON DELETE CASCADE`, but the append-only trigger currently prevents deletion when history rows exist. | Disable/archive routinely; block deletion while audit history exists. | Workspace status, disable/archive UI, owner-only deletion request, recovery path. | Apply retention guard migration after approval; add workspace lifecycle fields/RPC if archive is selected. | Workspace history remains recoverable to authorized users. | Yes: archive/disable semantics and final deletion process. |
| Audit-history retention | History is append-only with actor snapshots, but current FKs use member `SET NULL` and workspace `CASCADE`, conflicting with immutability. | Keep rows append-only; remove actor FK mutation and restrict workspace deletion. | Historical actor fallback and authorized history views. | Apply `20261017140000_audit_history_retention_guards_followup.sql` after approval; add retention/reporting controls. | No silent loss or mutation of historical events. | Yes: retention period, export/redaction, and workspace deletion approval. |

## Roles and security

- Super Admin: owns lifecycle decisions, archive/deactivation approvals, and exceptional deletion workflow.
- Project Manager: may receive project/client lifecycle authority only if explicitly approved; never bypasses workspace, company, or project scope.
- HOD: retains department-scoped operational access; no archive/delete authority unless explicitly granted.
- Staff: retains assigned-work access; cannot perform lifecycle deletion or historical reconstruction outside scope.
- Client: sees only authorized client-visible history and receives no administrative lifecycle authority.

Every lifecycle action must use a versioned authorized RPC, create an immutable audit event, preserve prior values, and prevent stale sessions from mutating newly changed records.

## Required approval record

The business owner must approve or reject each item below before implementation:

- [ ] Project archive authority and eligibility.
- [ ] Project reopen authority and whether reopening permits new work.
- [ ] Member deactivation behavior for active assignments.
- [ ] Member reactivation authority and permission reset behavior.
- [ ] Permanent member deletion and identity-retention/redaction rule.
- [ ] Client archive authority and archived-client visibility.
- [ ] Permanent client deletion, storage cleanup, and retention rule.
- [ ] Workspace disable/archive behavior and final deletion process.
- [ ] Audit-history retention duration, export, and redaction policy.
- [ ] Approval to apply `20261017140000_audit_history_retention_guards_followup.sql` to staging.

Until this record is approved, the lifecycle and retention gates remain **BLOCKED** and no lifecycle migration should be applied.
