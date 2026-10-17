# Next Agent — Start Here

> Historical pre-release handover. Its clean-tree, test and pending-deployment claims are superseded by [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md), which records the verified takeover and 2026-10-17 Supabase rollout.

**Read this first. Full detail is in the other handover docs.**

## 1. What the project is

AiTask — a React/TypeScript/Vite SPA (marketing-agency task, project, and service-delivery management) backed by Supabase (Postgres + RLS + command RPCs). Four roles: **Super Admin, Project Manager, HOD, Staff** (+ Client portal). Version `3.0.0`, Node 22 / pnpm 10.4.1.

## 2. What has been completed

A full audit + remediation chain is done and **committed** (but **not pushed**). Code is production-correct: all prior P0/P1 defects fixed, error handling centralized, data sync verified, and 814 unit tests pass. The working tree is **clean**.

## 3. What has changed (unpushed)

8 commits ahead of `origin/codex/audit-p0p1-2026-10-16` (see `GIT_HANDOVER.md`). Source changes: `d00da70` (AUTH-04 redirect loop), `2671418` (error-message classification). Plus many `docs/*.md` audit reports and the handover docs.

## 4. What needs to be deployed (in order — do NOT skip)

1. **2 pending Supabase migrations** (behind backup/preflight gate):
   - `20261016160000_pm_client_scope_and_ownership` — **P1 security** (live PM cross-company injection).
   - `20261016170000_department_scoped_visibility_cleanup`.
2. **Redeploy 2 edge functions** after setting `AITASK_ALLOWED_ORIGINS`/`AITASK_PUBLIC_URL`.
3. **Push + PR**, then Vercel deploy, then verify.

## 5. What needs to be verified after deploy

- All four roles log in and see correct data/actions.
- RLS/grants hold (run `verify:supabase`, pgTAP, live re-check).
- Cross-role sync ≤15 s; dashboards accurate; notifications correct; uploads work.
- `/build-info.json` matches the tagged version + commit.

## 6. What to do first

1. Read `GIT_HANDOVER.md` + `SUPABASE_HANDOVER.md`.
2. Confirm local gate green (`pnpm check && pnpm lint && pnpm test && pnpm build`).
3. Create a production backup, then apply the 2 migrations via the preflight gate in `docs/production-rpc-mismatch-recovery.md`.
4. Only then push, open a PR, and deploy.

## 7. What must NOT be changed

- RLS policies, RPC signatures, or schema without a migration + approval.
- The client-approval ordering policy (`fca797f`) — **product signed off 2026-10-17**; do not silently revert.
- Production data, `.env*` files, or migration history (never "repair"/replay history).

## 8. What requires explicit approval

- Applying migrations / deploying / pushing (this handover intentionally does none of these).
- Enabling leaked-password protection or backups (Supabase plan change).
- Any change to the base `secure-auth-schema.sql` (it is unscoped for PM on its own — only the full migration chain is safe).

## 9. Status at handover

| Dimension | Status |
| --- | --- |
| Development | Requires Attention (code done; 2 migrations pending) |
| Git | Unpushed commits (8, clean tree) |
| Supabase | Pending migrations (2) |
| Vercel | Build verified (local) |
| Recommendation | **CONDITIONAL GO** — unblock by applying the 2 migrations + redeploying edge functions + running the deploy gate |
