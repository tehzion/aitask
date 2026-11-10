# Handoff: role UX gap review and Supabase performance

Written 10 Nov 2026 for the next agent. It covers one session: a gap review of the role UX work, then a read-only performance check of production Supabase, then a drafted (not applied) row-security speed-up.

## 1. Where things stand

| Item | State |
| --- | --- |
| Branch | `codex/role-enhancements-20261110`, one commit ahead of `origin/master` (`b6f4e7a`), not pushed, no PR |
| Role UX gap list (18 items) | Code and test items fixed and merged by another session in PRs #19 and #20 |
| Role UX features still to build | Built in `b6f4e7a` by another session; **not reviewed by this session** |
| Supabase performance | Diagnosed and confirmed; fix drafted, **not applied** |
| Draft file | `supabase/drafts/rls_read_speedup.draft.sql`, untracked |
| This document | Untracked |

Another session was committing in this same worktree during this work. Run `git status` and `git log` before you edit, and do not assume the tree is as described here.

## 2. Open work, in priority order

### A. Ship the row-security speed-up (main task)

The draft is ready for a real test. Nothing else in this list affects production stability as much.

1. Run the draft on a Supabase branch (creating one may add cost; get the owner's yes first).
2. On the branch, compare `EXPLAIN (ANALYZE, BUFFERS)` for a Project Manager, an HOD, a Staff member and a Client, before and after. Section 5 has the query.
3. Move the file to `supabase/migrations/<timestamp>_rls_read_speedup.sql`.
4. Update two database tests that match the old policy text literally:
   - `supabase/tests/database/client_read_privacy.test.sql` line 66 expects `private.aitask_member_role(workspace_id)<>'Client'` inside the comment/approval branch.
   - `supabase/tests/database/project_manager_hod_role_model.test.sql` line 68 expects some policy to contain `private.aitask_is_hod`.
5. Regenerate `supabase/schema.sql`, the schema fingerprint and the release manifest in `supabase/preflight`.
6. Apply to production in a quiet period, with the owner's approval. Altering a policy briefly takes an exclusive lock on `aitask_entities`, and the migration's two verification passes read the table once per member.
7. After it is live, reset query statistics so new numbers reflect only the new code (owner approval needed; it is a write).

### B. Second performance pass (not started)

- **Staff reads stay slowest** (about 500–600 ms after the draft). The remaining time is inside `private.aitask_can_view_client` and `private.aitask_can_view_project`, which rescan tasks per client and per project. Fixing this means rewriting the rules themselves, so it needs its own before/after equivalence check.
- **`public.aitask_get_workflow_task_context`** averages 2.0 s and has peaked at 7,978 ms. It runs on every full workspace load for non-client users (`src/lib/secureWorkspace.ts:1991`). Not profiled yet.
- **`public.aitask_read_notifications`** averages 542 ms, peak 5 s. Not profiled yet.

### C. Database housekeeping (needs owner decisions)

- **History growth:** `aitask_entity_history` is 81 MB of the 107 MB database (2,670 rows at about 29 kB each, full before and after copies). Needs a retention decision; see `AUDIT_HISTORY_RETENTION_REVIEW.md`.
- **Leftover backup tables:** `private.r3_backup_20261109_members`, `_entities`, `_workspaces`. Drop only after the owner confirms.
- **Advisor findings:** one foreign key without an index on `aitask_tutorial_feedback`; four never-used indexes; two permissive read policies on `aitask_entities` (left as is on purpose, because tests name both policies and merging them gives no speed gain).
- **No alerting:** timeouts are only visible by reading logs.
- **Two SQL errors on 9 Nov** with unknown origin: "column m.data does not exist" (09:30 UTC) and "operator does not exist: text[] @> jsonb" (17:40 UTC).
- **Signed-out request bursts:** 11 rounds of "permission denied" across every endpoint, last at 02:00 UTC on 10 Nov. This looks like the project's own access check; confirm with the owner.

### D. Repo housekeeping

- `CHANGELOG.md` has no entry for the 10 Nov role UX commits.
- The release notice (`src/lib/releaseNotice.ts`, id `2026-11-everyday-saves`) does not mention the role audit changes.
- `REMAINING_GAPS.md` dates from 17 Oct and lists blockers that now pass.
- Review `b6f4e7a` (client review queue, "My day", unlinked work, company health, contract value at risk) before pushing; this session did not look at it.
- The security advisor was not run in this session.

## 3. What was verified in this session

Run on the earlier branch `codex/role-fixes-20261110` at commit `c528c28`, before the other session's fixes:

| Check | Result |
| --- | --- |
| `pnpm check` | Pass |
| `pnpm lint` | Pass |
| `pnpm test` | 1,114 of 1,114 pass |
| `pnpm verify:bundle` | Pass; eager JS 271.6 KiB gzip against a 300 KiB cap |
| `pnpm verify:release-db-alignment` | Pass, through `20261109193707_aitask_client_events` |
| Five touched Playwright specs | 27 of 28 pass; one screenshot test was flaky (later stabilised in `686e0a6`) |
| Full Playwright suite | Not run |

On the current tree, only `pnpm verify:migrations`, `pnpm verify:release-db-alignment` and `pnpm verify:i18n` (0 findings) were re-run. Re-run the rest before relying on them.

## 4. Supabase findings (production, read-only)

Project `AiTask`, ref `ohjhwyiffgzyatcmmdql`, Singapore, Postgres 17. This is the only linked project; there is no staging link.

**Healthy:** 13 of 60 connections, none idle in transaction, 0 deadlocks, 100% cache hit rate, 0.33% rollbacks, all four scheduled jobs succeeded in the last 24 hours, health advisor clean.

**At risk:**

- Reading `aitask_entities` averages 442 ms and has peaked at 7,984 ms, against an 8 s statement timeout for signed-in users. The table is 1,256 rows and under 1 MB.
- The API layer logged "Thread killed by timeout manager" 11 times in the 24 hours to 10 Nov 02:16 UTC.
- Timing averages are cumulative since 10 June 2026 (last statistics reset), so they include older code.

**Confirmed cause:** a query plan run as a Project Manager took 601 ms with 20,750 buffer hits, all in the row-security filter. The policies call `SECURITY DEFINER` helper functions once per row; the 12-row `aitask_members` table has been scanned 95 million times.

Useful facts for the fix:

- `aitask_members.auth_user_id` is unique, so each login belongs to one workspace.
- `aitask_entities` primary key is `(workspace_id, entity_type, entity_id)`; row security is enabled, not forced; owner is `postgres`.
- 11 members have a login: 1 Client, 1 HOD, 5 Project Managers (1 super admin), 4 Staff.
- There is 1 `service_cycle_payment` row and 0 service rows with a null `client_id`.

## 5. The draft

File: `supabase/drafts/rls_read_speedup.draft.sql`. It is kept outside `supabase/migrations` so the release alignment check stays green. Its header repeats the ship steps.

**What it does**

- Adds `private.aitask_rls_member_context()`: one jsonb per statement with the member's id, role, admin flags, client key and three permissions, built from the existing helpers.
- Adds four set functions (`aitask_rls_visible_tasks`, `_visible_projects`, `_visible_clients`, `_service_clients`), each built by calling the existing decision function once per candidate.
- Alters the read condition of two policies on `aitask_entities`: "members can read scoped entities" and "PM service records stay in portfolio". Names, roles and write checks are unchanged. Both cycle-payment policies are untouched.
- Records which rows every login can read before and after, and aborts if any row differs.
- Carries a commented rollback with the production policy text read on 10 Nov.

**Evidence so far**

The new conditions were run on production as plain SQL with the function bodies inlined (no DDL, nothing written) and compared with what real row security returns for all 11 logins. Every login saw identical rows.

| Role | Full workspace read today | With the new logic |
| --- | --- | --- |
| Staff (4) | 1,320–1,441 ms | 485–600 ms |
| HOD (1) | 1,238 ms | 301 ms |
| Project Manager (4) | 379–426 ms | 219–291 ms |
| Super admin (1) | 117 ms | 48 ms |
| Client (1) | 144 ms | 16 ms |

This proves the logic, not the deployed functions and policies. The draft SQL has never been executed.

**Plan query for the branch test** (read-only; pick a member by role):

```sql
begin;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select auth_user_id from public.aitask_members
          where role = 'Staff' and auth_user_id is not null order by id limit 1),
  'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers, costs off)
select workspace_id, entity_type, entity_id, parent_id, data, version, updated_at
from public.aitask_entities
where workspace_id = (select workspace_id from public.aitask_entities limit 1)
  and entity_type <> 'notification'
order by entity_type, entity_id limit 1000;
rollback;
```

## 6. Ground rules that applied here

- Production is the only database. Everything run against it in this session was read-only: advisors, statistics views, logs, and `EXPLAIN` inside a transaction that was rolled back.
- No DDL, no data changes, no statistics reset, no branch created.
- Applying a migration, creating a branch, dropping tables or resetting statistics each need the owner's explicit yes.
- The Supabase connector used was the one whose tools include `execute_sql`, `get_advisors` and `query_logs`. The GitHub connector failed to connect in this session; `gh` on the command line worked.
