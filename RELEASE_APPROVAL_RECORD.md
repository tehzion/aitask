# AiTask Production Release Approval Record

**Status:** AWAITING EXPLICIT RELEASE-OWNER APPROVAL — no production mutation performed
**Prepared:** 2026-10-17 (Asia/Kuala_Lumpur)

## Release identity

- Release candidate commit: `1ce9f6f0b1f496c9895623b82ff93462d776b79a`
- Supabase project: **AiTask**, `ohjhwyiffgzyatcmmdql`, `ap-southeast-1`, ACTIVE_HEALTHY
- Vercel project: **aitask**, `prj_uzWREguA16aYjlhTHPw9hE8DRLSM`
- Production URL: <https://aitask-virid.vercel.app>

## Pending production migrations

1. `20261017091031_workspace_revision_realtime.sql`
2. `20261017140000_audit_history_retention_guards_followup.sql` (SHA-256 `7620a58e34d775359ef870d85ffbac1f0b3cf6e9ab7d6d663a9d61b7986c00ab`)

The requested filename `20261017100103_audit_history_retention_guards.sql` does not exist in the repository or reachable Git history. The follow-up migration above is the reviewed intended replacement and must be explicitly confirmed as such.

## Retention and deletion behavior requiring approval

- Remove the audit-history actor foreign key so member deletion cannot rewrite immutable history; retain the historical actor identifier and snapshots.
- Change the workspace relationship to `ON DELETE RESTRICT`; a workspace with history cannot be deleted and no history row is cascaded away.
- Revoke every direct `service_role` privilege on the immutable history table, including `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN`.
- Retain full entity/member before-and-after snapshots until a separately approved export, redaction, or expiry process exists.

Snapshots can contain names, email addresses, auth identifiers, roles, departments, permissions, client associations, and account-state data. This is an indefinite retention and privacy decision, not only a technical foreign-key change.

## Recovery and rollback limitations

- A current recoverable backup or restore point, restore method, named operator, and restore verification are required before production application. None is evidenced in this execution context.
- No automatic down migration is safe. Re-adding the actor `ON DELETE SET NULL` foreign key can recreate immutable-history mutation and may fail after orphaned actor IDs exist.
- Restoring workspace `ON DELETE CASCADE` or direct `service_role` privileges requires a reviewed forward migration and reopens destructive paths. Application rollback alone does not roll back database semantics.

## Explicit approval required

The release owner must explicitly confirm all of the following:

- [ ] `20261017140000_audit_history_retention_guards_followup.sql` is the intended replacement for the nonexistent requested filename.
- [ ] The actor-FK removal, workspace `ON DELETE RESTRICT`, indefinite snapshot retention, and complete direct `service_role` privilege revocation are approved.
- [ ] A current recovery point and restore owner/method are recorded.
- [ ] Vercel production environment metadata has been verified without exposing secret values.

Until these boxes are confirmed, do not apply either pending migration, push the production branch, or deploy the release candidate.
