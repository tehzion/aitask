# Audit-History Retention Migration Review

**Migration:** `supabase/migrations/20261017140000_audit_history_retention_guards_followup.sql`
**Assessment date:** 2026-10-17 (Asia/Kuala_Lumpur)
**Status:** Reviewed locally; **not applied** to production or staging

## Scope

The migration changes two foreign-key relationships on `public.aitask_entity_history` and removes all direct `service_role` table privileges. It does not create tables, add columns, modify RLS policies, add functions, or replace triggers. History capture continues through existing `SECURITY DEFINER` trigger functions owned by `postgres`, so the application service role does not require direct table access.

## Before and after

| Concern | Current production behavior | Behavior after migration |
| --- | --- | --- |
| `actor_member_id` relationship | Foreign key to `public.aitask_members(id)` with `ON DELETE SET NULL`. Deleting a member attempts to update the history row, which conflicts with the append-only history guard and can abort the member deletion. | No foreign key. The historical actor id and `actor_snapshot` remain unchanged when the member directory row is removed. |
| `workspace_id` relationship | Foreign key to `public.aitask_workspaces(id)` with `ON DELETE CASCADE`. Deleting a workspace attempts to cascade-delete history rows, which conflicts with the append-only guard and can abort the workspace deletion. | Foreign key remains, but changes to `ON DELETE RESTRICT`. Workspace deletion is explicitly rejected while history rows exist. |
| Append-only trigger | `aitask_guard_entity_history_immutable` blocks `UPDATE` and `DELETE` on history rows. | Unchanged. |
| RLS and grants | RLS is enabled; authenticated history access is limited by the MFA Super Admin policy. Production currently grants `service_role` direct `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges. | RLS policies remain unchanged. All direct `service_role` privileges are revoked so `TRUNCATE` cannot bypass the row-level immutability trigger. |
| Application permissions | Application users have no direct history DML authority. | User-facing role predicates remain unchanged; referential integrity produces a clearer database rejection for workspace deletion. |

## Data and historical-integrity assessment

- The migration contains no data rewrite or backfill.
- Existing history rows are preserved by the migration itself.
- Production currently contains zero rows in `aitask_entity_history`, verified read-only, so there is no current orphaned actor reference to reconcile.
- In future, deleted members may leave historical `actor_member_id` values that no longer resolve to a live directory row; this is intentional and `actor_snapshot` is the display fallback.
- Workspace history cannot be silently destroyed by a workspace delete after the migration. A future approved archival/retention process must decide how to preserve or export that history before any workspace removal.
- History payloads can retain full before/after entity JSON and member snapshots, including names, email addresses, user identifiers, role/department details, permissions, client associations, and account-state fields. Approval therefore also accepts indefinite retention of this personal and authorization data until a separate export/redaction/expiry policy is implemented.

## Trigger and foreign-key interactions

The original history migration installs an append-only `BEFORE UPDATE OR DELETE` trigger. Under the current foreign keys:

1. Member deletion invokes `ON DELETE SET NULL`, which is an update to the history row; the append-only trigger rejects it.
2. Workspace deletion invokes `ON DELETE CASCADE`, which is a delete of the history row; the append-only trigger rejects it.

The pending migration replaces these implicit trigger failures with explicit retention semantics:

1. Member deletion no longer updates history rows.
2. Workspace deletion is rejected by `ON DELETE RESTRICT` before history can be removed.

No trigger is disabled. The migration additionally closes the inherited `service_role` `TRUNCATE` path, because PostgreSQL `TRUNCATE` does not invoke row-level `DELETE` triggers.

## Rollback and recovery limitations

There is no safe automatic rollback that restores the old foreign keys without policy review:

- Re-adding `actor_member_id → members ON DELETE SET NULL` would recreate mutation of immutable history and may fail if member references were intentionally orphaned after the migration.
- Restoring workspace `ON DELETE CASCADE` would reintroduce the possibility of destructive history deletion if the append-only guard were changed later.
- Restoring direct `service_role` access would reopen a privileged deletion path and is not an acceptable automatic rollback.
- A rollback must therefore be a reviewed forward migration after confirming retention state and existing references.

The migration DDL is transactional at the database statement level: a failed migration does not leave a partially completed constraint rewrite. This does not provide a business-data rollback after a separately approved future deletion process.

## Decision

The migration is technically consistent with append-only history and the proposed archive-first lifecycle. The release owner has explicitly approved the retention/deletion semantics; it remains **blocked for application** until a current recoverable backup or restore point is confirmed and the isolated database evidence is tied to the final release sequence.
