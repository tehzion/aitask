# Production RPC mismatch recovery

This runbook is intentionally fail-closed. Migration repair changes only the
Supabase migration-history records; it must never be used as a substitute for
proving that the live schema and the repository baseline are equivalent.

## Current production state

- Verified on 25 August 2026: production migration history matches all 31
  repository migrations through `20260821075407_add_release_notice_acknowledgements`.
- The legacy and workspace-locked command signatures, service commands,
  deliverable task-chain functions, and schema-version-2 capability RPC exist.
- Postflight matches the approved business checksum, all task/project records
  have canonical client IDs, Storage is private, and the service cron is not
  tied to a hard-coded workspace.
- Super Admin, Admin, Staff, and Client capability probes pass for their own
  workspace and return `FORBIDDEN` for a cross-workspace probe.
- Do not repair migration history or reapply the five rollout migrations.
- Restorable-backup evidence is still unverified, and production Auth still
  reports leaked-password protection as disabled.

## Stop conditions

Do not apply production DDL if any of these conditions is true:

- the frontend read-only compatibility guard is not deployed;
- a verified, restorable production backup is unavailable;
- live counts have changed materially from the approved preflight;
- the client mapping contains a missing key, ambiguous name, or duplicate
  canonical profile;
- task/project business-field checksums do not match before and after;
- schema equivalence for any migration-history repair entry is unproven;
- the dry run lists anything other than the five expected migrations;
- local reset, pgTAP, lint, advisors, or application release gates fail.

## 1. Local validation

Use the repository-pinned Node, pnpm, and Supabase CLI versions. Discover CLI
flags from the installed CLI help before running them.

1. Start Docker and run `pnpm verify:supabase:rollout`. This creates an unlinked,
   disposable Supabase workspace so a production-linked checkout cannot affect
   local reset or migration-history validation. It verifies the five-migration
   manifest tail, applies every migration, runs every pgTAP file, runs database
   lint and advisors, executes the postflight SQL, and removes its containers.
2. Run `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, and
   `node scripts/verify-pwa.mjs`.
3. Run `pnpm verify:supabase` against the deployed environment and retain all
   command output with the release record.

The old four-argument command, the new five-argument command, both service
command signatures, both task-chain signatures, and the capability RPC must all
exist. New signatures must not define defaults, otherwise PostgREST can treat a
legacy call as ambiguous.

## 2. Backup and preflight

1. Create a production backup using the platform backup mechanism.
2. Restore it to an isolated database and verify the restored counts/checksums.
3. Run `supabase/preflight/service_rollout_preflight.sql` against production.
4. Save its count, checksum, mapping-detail, and mapping-summary result sets.
5. Abort unless every mapping row reports `safe_to_apply = true`.

The approved preview was rechecked read-only on 2026-08-24: 189 tasks, 62
projects, 59 client groups, one reused profile, 58 deterministic new profiles,
no missing client keys, no ambiguous/duplicate mappings, and no existing
service entities. The task/project business-field checksum was
`794fe323c64ee57e517ef0432afefb42`. These values are a review baseline, not
values hard-coded into the migration.

## 3. Historical migration-history reconciliation

This section records the recovery procedure that was prepared before production
history became aligned. It is retained for audit only and must not be executed
against the current production state.

The schema-equivalence comparison completed on 2026-08-24. A clean local
database reset stopped at `20260802121500_notification_center`, immediately
before the service migration. Production and that baseline matched exactly for
relations, columns, constraints, indexes, policies, triggers, function bodies,
function grants, and relation grants. The counts and MD5 fingerprints are
recorded in `migration_repair_manifest.review.json` and can be reproduced with
`supabase/preflight/schema_fingerprint.sql`.

This proves schema equivalence only. It does not authorize a migration-history
repair without a verified restorable backup and final review of the metadata
operations.

1. Export the production migration history and schema.
2. Compare the production schema with the repository state immediately before
   `20260815042430_client_service_management.sql`.
3. Review every group in
   `supabase/preflight/migration_repair_manifest.review.json`.
4. Only after equivalence is proven, mark the equivalent local versions applied
   and the superseded remote-only versions reverted in migration history.
5. Run migration list and a database-push dry run.
6. Abort unless the dry run lists exactly the five entries in
   `expectedDryRunMigrations`, in that order.

Do not run the five migration files manually and do not edit production data to
make the history appear aligned.

## 4. Rollout and validation

1. Keep secure workspaces in `upgrade_required` read-only mode.
2. Apply the five migrations sequentially, without seed data.
3. Reload the PostgREST schema cache after the final migration.
4. Run `supabase/preflight/service_rollout_postflight.sql` and compare counts and
   business checksums with the saved preflight output.
5. Confirm anonymous and cross-workspace probes fail, Storage stays private,
   and the service-cycle cron has no hard-coded workspace.
6. Authenticate as each release role and verify the capability RPC and allowed
   projections.
7. Re-enable writes only after the authenticated probes pass.
8. Retry the retained browser command using its original command ID. Command
   receipts make this retry idempotent.

If the original browser tab was refreshed before the compatibility frontend was
loaded, first confirm that no matching remote record exists, then re-enter the
edit. Never choose **Use latest** unless the user confirms the retained edit can
be discarded.
