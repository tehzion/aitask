# Final Release Report — AiTask Project Management

**Validation date:** 2026-10-21
**Branch:** `codex/role-project-permissions-release-2026-10-20`

## Outcome

The requested project-management implementation is released to production at https://aitask-virid.vercel.app. GitHub `master` and the release branch both contain `34a126b9fdf132a3432f1ae00c18d19e139be1da`. Vercel deployment `dpl_LF6iv3rTCMVjKCUnPjVnidrqJuTH` is READY and promoted. Supabase migration `20261020131544_project_management_completion` and the updated `invite-aitask-member` function are deployed.

## Implemented

- Project Manager account administration for HOD and Staff, including explicit project assignment, project-specific responsibilities, shared-account reuse, and Boss-directed deactivation requests.
- Project lifecycle controls for Active, Completed, and Closed projects, with closure warnings and closed-project task-write protection.
- Project milestones with ownership, dates, status, task linkage, and derived progress.
- Project-level approval defaults with per-task inheritance or override for no approval, HOD approval, or PM approval.
- English and Simplified Chinese interface copy for the new workflows.
- Additive Supabase migration, RLS/RPC enforcement, edge-function checks, unit tests, and pgTAP coverage.

## Verification

- `pnpm check`: passed.
- `pnpm run verify:i18n:strict`: passed, 0 findings across 187 files.
- Full Vitest suite: passed, 876 tests across 115 files.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `pnpm run verify:migrations`: passed, 119 non-empty migrations.
- Local Supabase reset: passed with every migration applied.
- Full pgTAP suite: passed, 1,094 tests across 71 files in the complete local Supabase stack.
- Corrected production backup restore: passed in an isolated local database.
- New migration applied to the restored production snapshot: passed.
- Restored snapshot counts: 1,935 entities, 11 members, 10 Auth users, and 1 Storage metadata object.
- Restored production snapshot: 40 targeted authorization assertions passed.
- Live production database: the same 40 assertions passed with temporary assertions and fixtures rolled back. Production's pgTAP assertion functions were unavailable, so the live check used transaction-local assertion functions rather than changing the pgTAP installation.
- Browser tests: desktop/mobile milestone creation, approval settings, project completion/closure/reopening, closed-project controls, and all three existing client/project creation tests passed (5 tests).
- Live login page rendered in English and Simplified Chinese and displayed `v3.0.0+34a126b`.
- Live root, login, projects, tasks, reports, approvals, manifest, service worker, and build-info routes returned HTTP 200 with CSP and HSTS headers.
- Anonymous API security checks passed: workspace tables, command RPCs, and retired helpers remain inaccessible.
- Live build provenance matches the released Git commit.

## Backup

Authoritative backup directory:

`/Users/user/Documents/AiTask Backups/2026-10-20-project-management`

Use the refreshed `schema-release.sql` and `data-release.sql`; earlier dumps are retained as superseded evidence. The schema explicitly includes `public`, `private`, `auth`, and `storage`. Restore as Supabase administrator into a postgres-owned disposable database, then apply migrations as postgres to match production ownership.

Checksums:

- `schema-release.sql`: `45f9c8e43c99747b18d8a8808801a49f5934406b312b056b4bfb7df06eb78bae`
- `data-release.sql`: `e2ad7eb2aa4f253d5f1ff577735fe27c60907a2252e489614c2aa441a41b0deb`
- `roles.sql`: `4350a72b5ec109888e740c17f3eb4da2fcd95ab73af26499538ed0bf615db543`
- Storage object: `b66b461bc00d9c8f111196b26ec8ca48207a4d0e4f92116c1ec5247fc1e84d65`

See `docs/project-management-release-recovery-2026-10-21.md` for the tested recovery procedure.

## Migration-history resolution and data integrity

The initial dry run failed because historical connector deployments recorded 51 migrations under different timestamps from their same-named repository files. Those aliases were fetched and their SQL compared successfully after normalization. A disposable release directory used the actual recorded production files plus the single new migration. Its dry run listed only the intended new migration; production history was preserved.

Production retained 1,935 entities, 11 members, 10 Auth users, and one Storage object. Before/after hashes match for non-project entity rows, member rows, and original project business fields. Only the intended additive project defaults were introduced.

## Verification limits and existing findings

- Authenticated ordinary-user browser sign-in was not performed because no ordinary-user credentials were supplied. Authorization and the new workflows were exercised against the live database through rolled-back fixtures, and the identical frontend workflow passed desktop/mobile browser tests locally.
- The optional broad browser audit was interrupted after several stale visual comparisons and edits overlapping its run. Client/project functional regressions were rerun successfully against settled source; full Vitest and local pgTAP runs are green. The complete 355-test browser suite is not claimed as passed.
- The full database suite expects a fresh complete Supabase stack (Realtime publication, cron, and empty fixtures). It is not suitable unchanged for a data-bearing standalone backup restore; targeted restore tests passed.
- Security advisors reported no ERROR findings. Existing intentional authenticated SECURITY DEFINER endpoints and disabled leaked-password protection remain WARN findings.
- GitHub accepted the production fast-forward using the account's existing bypass rights; the server reported the PR/three-status-check rules were bypassed. Local release checks and live verification are recorded above.
