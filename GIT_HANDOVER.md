# Git Handover — AiTask

> Historical pre-release snapshot. See [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) and current Git history for the takeover commits and authorized branch push. Do not assume the old ahead count or clean-tree claim remains current.

**Prepared:** 2026-10-17

## Repository state

| Item | Value |
| --- | --- |
| Current branch | `codex/audit-p0p1-2026-10-16` |
| Remote | `origin` = `git@github.com:tehzion/aitask.git` |
| Local HEAD | `6376897` (docs: record product sign-off on client-approval ordering policy) |
| Working tree | **clean** (no modified/staged/untracked files at time of writing) |
| Ahead of `origin/codex/audit-p0p1-2026-10-16` | **8 commits** |
| Other local branches | `codex/boss-pm-ui-audit` (ahead 1, behind 37 vs origin/master), `codex/delivery-review-blindspots` (in sync) |

## Unpushed commits (oldest → newest)

```
fca797f  fix(audit): reconcile action gating, sync retry, and edge request bounds   (pre-existing)
415fc4f  test(pm): cover duplicate company-name service scope                       (pre-existing)
7ac0b25  fix(release): record department-scoped visibility cleanup migration        (pre-existing)
d00da70  fix(auth): resolve zero-permission redirect loop to notification centre    (this session)
2671418  fix(ui): classify technical errors through SystemMessage                  (this session)
90f52fd  docs: record multi-role audit and production readiness verification        (this session)
67a8d22  docs: record data synchronisation and dashboard accuracy verification      (this session)
6376897  docs: record product sign-off on client-approval ordering policy           (this session)
```

## Recommended commit grouping (already grouped logically; no re-ordering required)

- **Code fixes:** `fca797f`, `415fc4f`, `7ac0b25`, `d00da70`, `2671418`.
- **Documentation:** `90f52fd`, `67a8d22`, `6376897`.
- These are already clean thematic commits. Do **not** rebase/squash onto `origin/master` unless explicitly requested.

## Files requiring review before push

- `src/lib/access.ts` / `access.test.ts` — AUTH-04 fix (fallback → `/notifications`).
- `src/components/{TaskReviewSettings,TaskOutputFiles,ClientDeliveryFocus,ClientServiceWorkspace}.tsx`, `src/pages/ClientWorkspace.tsx` — error-feedback routing.
- `src/lib/{messages,userFacingMessage,userFacingMessage.test}.ts` — `errors.fileUnavailable` mapping.
- `supabase/migrations/20261016160000_pm_client_scope_and_ownership.sql`, `20261016170000_department_scoped_visibility_cleanup.sql` — **pending production migrations**.

## Git risks / notes

- **Do not force-push**; a plain `git push -u origin codex/audit-p0p1-2026-10-16` is expected. Then open a PR.
- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`, `.env.production`). `.env.production` is tracked and contains **only** the publishable key + public URL (no secrets). No service-role key is tracked.
- `dist/`, `node_modules`, `.vercel`, `test-results`, `supabase/.temp`, `.release-backups`, `tmp/` are gitignored.
- The `docs/` directory now contains many audit/report files (intentional deliverables).
- There is no staging remote configured that the local repo can reach without re-provisioning credentials (see `SUPABASE_HANDOVER.md` §staging).
