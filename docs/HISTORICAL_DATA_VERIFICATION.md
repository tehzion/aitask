# Historical Data Verification — AiTask

**Date:** 2026-10-17

## 1. Audit trails

| Trail | Records | Protected? |
| --- | --- | --- |
| `aitask_audit_events` (server) | entity/command events: workspace, actor, entity, before/after | RLS read (admins), `service_role`-only writes (`reliable_workspace_commands.sql:48-62`) |
| `workHistory` (task) | field-level `TaskWorkEvent { userId, createdAt, fields }`, capped at last 50 | persisted on task |
| `approvalHistory` (task) | client decisions `{ userId, status, note, createdAt }` | persisted on task (append-only) |
| `reviewDecision` (task) | internal review provenance `{ reviewedBy, reviewedAt, overrideReason }` | server-owned |
| Registration/approval | `Registration.status`, approval records | persisted |

## 2. Verification of retention (source)

- **Reopen preserves history**: reopen path (`workflowReview.ts:116`) resets `clientApprovalStatus:'Pending'` but keeps `approvalHistory`/`workHistory`; `revisionCount`/`workflowOutputVersion` increment.
- **Approval decisions have reasons**: rejection requires a note (`store/index.ts:3016`); Boss override requires `reviewOverrideReason` (≤2000 chars), replaced by server `reviewDecision` provenance.
- **Deletion degrades, not destroys**: `aitask_audit_events.actor_member_id` SET NULL on member delete; `workHistory` entries on retained tasks keep `userId` (rendered as "Team member" when the user is gone).
- **No history is auto-deleted** on assignment/department/role changes.

## 3. Audit trail immutability

- `aitask_audit_events`: `revoke all ... from public, anon, authenticated`; only `select` to `authenticated` (admin policy); full write only to `service_role`. No user-facing write path.
- Task history is mutated only through the command RPC (writes revoked from `authenticated`), so it cannot be forged client-side.

## 4. Verdict

Important actions are traceable (who/what/when + prior/new values + reasons), and audit records are protected from ordinary modification. **No historical-integrity defect found.**
