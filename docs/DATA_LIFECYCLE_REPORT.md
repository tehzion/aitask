# Data Lifecycle Report — AiTask

**Date:** 2026-10-17 · **Historical accuracy + traceability across lifecycle events.**

## 1. Lifecycle event map

| Event | Behaviour | Historical integrity |
| --- | --- | --- |
| **User deactivated / deleted** | `deleteUser` (`store/index.ts:5474`): super-admin-gated; secure mode → `invite-aitask-member` edge function (JWT-verified, service-role RPC); local mode → remove member + unassign tasks (`assignedTo:''`) + "Member Removed" notice; `deletedUserIds` tracked | Task history preserved (tasks not deleted, only unassigned); audit `actor_member_id` SET NULL by design (attribution degrades, not lost) |
| **Staff change department** | Department change invalidates `reviewCover`/`accountableLeadId` (`store/index.ts:2895-2900`); scope recalculated | Work history retained; dept-scoped visibility re-derived |
| **PM reassigned / removed from project** | Project ownership keyed on `createdBy`; reassignment via portfolio rules; no silent ownership transfer (client-ownership trigger freezes `createdBy`) | Ownership provenance preserved |
| **HOD change** | `builtin-hod` role / department membership updated; review routing re-derived (`getDepartmentReviewers`) | Prior review decisions retained in `reviewDecision` |
| **Project/plan archived** | Plans use `Ended`/`Paused` states + revision history (`supersedesPlanId`); no hard delete | Full revision chain retained |
| **Task deleted** | `deleteTask` clears `deliverable.primaryTaskId`, removes from `taskIds`, filters notification routes (`store/index.ts:2983`) | No dangling references; notifications no longer link to missing task |
| **Approved work reopened** | `requestRevision`/reopen sets `clientApprovalStatus:'Pending'`, increments `workflowOutputVersion`/`revisionCount`, preserves `approvalHistory` + `workHistory` | Approval history is append-only; prior decisions traceable |
| **Completed project modified** | `Active → Draft` blocked with started cycles; plan edits via revision | No silent mutation of completed cycles |
| **Historical access** | `approvalHistory` (client decisions), `workHistory` (last 50 field-level events), `reviewDecision` (internal review provenance), server `aitask_audit_events` | Readable in Task details History section |

## 2. Traceability guarantees

- **Who/when/what**: `workHistory` (`TaskWorkEvent { userId, createdAt, fields }`) and `approvalHistory` (`TaskApprovalEvent { userId, status, note, createdAt }`) record actor + timestamp + change.
- **Previous/new values**: field-level `fields` array in work history; server `aitask_audit_events` records entity/command events.
- **Approval decisions + reasons**: `reviewDecision.overrideReason`, `approvalHistory.note` (required for rejections).
- **Protection**: `aitask_audit_events` is RLS-read (admins only), `service_role`-only writes — audit records cannot be modified by ordinary users.

## 3. Verdict

Historical information is **append-only and preserved** across deactivation, reassignment, department changes, deletion, and reopening. No lifecycle path silently destroys history; attribution degrades (not lost) on account deletion, which is a documented, acceptable trade-off.
