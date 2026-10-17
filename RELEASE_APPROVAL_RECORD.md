# AiTask Production Release Approval Record

**Status:** RELEASED — BACKUP/RESTORE, MIGRATIONS, LIVE ALIAS, AND FOUR-ROLE SMOKE VERIFIED
**Prepared:** 2026-10-17 (Asia/Kuala_Lumpur)

**Approval received:** 2026-10-17T15:04:28Z via explicit release-owner message (`approve`). This approves the retention/deletion semantics below; it does not waive backup, configuration, migration-alignment, or live-authentication gates.

## Release identity

- Released commit: `a56517420947d6ed6e1ef061be5a18772ac7b326` (tested application baseline `1ce9f6f0b1f496c9895623b82ff93462d776b79a`; subsequent changes record release evidence, migration aliases, and upload exclusions).
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

- Recovery point: `2026-10-17T15:20:51.005Z`, PostgreSQL 17.6 custom logical archive, SHA-256 `d3d1f2be17e15df14ec2b811a0dc5f258fcae1221b6be778fa2576029d87a525`, private folder `/Users/user/Downloads/aitask-production-backups/20261017T151800Z`. The restore drill verified all 50 tables and 7,545 rows at `2026-10-17T15:22:33.134Z`; every per-table row count and SHA-256 matched. Restore operator: authenticated project owner `tehzion`, assisted by Codex, using the isolated Supabase platform-owner role. Application scopes remain owned by `postgres`; managed Auth/Storage schema replacement requires platform-owner permissions. Storage-object backup is included separately.
- No automatic down migration is safe. Re-adding the actor `ON DELETE SET NULL` foreign key can recreate immutable-history mutation and may fail after orphaned actor IDs exist.
- Restoring workspace `ON DELETE CASCADE` or direct `service_role` privileges requires a reviewed forward migration and reopens destructive paths. Application rollback alone does not roll back database semantics.

## Explicit approval required

The release owner must explicitly confirm all of the following:

- [x] `20261017140000_audit_history_retention_guards_followup.sql` is the intended replacement for the nonexistent requested filename.
- [x] The actor-FK removal, workspace `ON DELETE RESTRICT`, indefinite snapshot retention, and complete direct `service_role` privilege revocation are approved.
- [x] A current recovery point and restore owner/method are recorded.
- [x] Vercel production environment metadata has been verified without exposing secret values, using local CLI 59.20.0 as `tehzion` in `tehzions-projects`. The connector remains restricted, but the authorized CLI succeeds. The serving application points to `ohjhwyiffgzyatcmmdql`; Secret-type URL/key values cannot be read back.

Until the remaining boxes are confirmed, do not apply either pending migration, push the production branch, or deploy the release candidate.
