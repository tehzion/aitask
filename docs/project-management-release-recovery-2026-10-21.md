# AiTask Project Management Release Recovery

## Backup set

The authoritative backup set is stored outside the repository at:

`/Users/user/Documents/AiTask Backups/2026-10-20-project-management`

Required files:

- `schema-release.sql` — refreshed schemas and database objects for `public`, `private`, `auth`, and `storage`.
- `data-release.sql` — refreshed rows for those schemas.
- `roles.sql` — role configuration.
- `storage/aitask-main/...` — the binary copy of the production Storage object.

Do not use the superseded `schema.sql` as the recovery schema; it omitted the `private` schema and cannot restore independently.

## Tested database restore

Use a disposable database owned by a role that can assume the Supabase service roles. Replace the placeholders with the disposable database connection details; never paste production credentials into source control.

```sh
createdb --owner=postgres --maintenance-db='<ADMIN_DATABASE_URL>' aitask_restore_verify
psql '<SUPABASE_ADMIN_RESTORE_URL>' -X -v ON_ERROR_STOP=1 -f schema-release.sql
psql '<SUPABASE_ADMIN_RESTORE_URL>' -X -v ON_ERROR_STOP=1 -f data-release.sql
```

Validate the restored snapshot:

```sql
select count(*) from public.aitask_entities;
select count(*) from public.aitask_members;
select count(*) from auth.users;
select count(*) from storage.objects;
```

The verified snapshot contained 1,935 entities, 11 members, 10 Auth users, and 1 Storage object record.

Apply the candidate migration only to the disposable restore:

```sh
psql '<POSTGRES_RESTORE_URL>' -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261020131544_project_management_completion.sql
```

Confirm that the project-management RPC exists and rerun the pgTAP suite before any production release.

## Storage recovery

The SQL data restores Storage metadata, not object bytes. Re-upload the saved file under the same bucket and object key from the `storage/` backup directory. Verify its SHA-256 checksum is:

`b66b461bc00d9c8f111196b26ec8ca48207a4d0e4f92116c1ec5247fc1e84d65`

## Production release gate

Production's historical connector deployments use different timestamps from the repository. The 51 remote-only timestamp aliases were fetched and their SQL compared to their same-named local migrations; the alias SQL matches after comment, whitespace, and transaction-wrapper normalization. Production history must remain intact.

For this release, use an isolated Supabase release directory populated by `supabase migration fetch` from project `ohjhwyiffgzyatcmmdql`. Add only `20261020131544_project_management_completion.sql`. A linked dry run against that directory must list exactly this migration. Do not push the repository's historical alias filenames or mark remote entries reverted.

Require all of the following:

1. `supabase db push --linked --dry-run` succeeds and lists only the intended migration.
2. The authoritative backup restores cleanly in a disposable database.
3. The candidate migration applies to that restored snapshot.
4. Application checks, unit tests, build, local reset, database lint, and pgTAP all pass.
5. After deployment, verify PM/HOD/Staff permissions and the four workflows on the live site.

If any gate fails, leave production unchanged and restore from the complete SQL files plus the saved Storage object if recovery is required.
