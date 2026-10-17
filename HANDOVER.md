# AiTask — Handover Document

> Historical pre-release handover. See [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md) for the verified takeover findings, current checks, approved backup waiver and completed Supabase rollout.

**Prepared:** 2026-10-17 · **Preparing agent:** prior development/audit agent · **For:** incoming deployment & maintenance agent
**Current branch:** `codex/audit-p0p1-2026-10-16` (HEAD `6376897`, ahead of origin by **8 commits**, working tree clean)

---

## 1. Project overview

AiTask is a marketing-agency **task/project/service delivery management SPA** for four roles plus clients:

| Role | Identity | Scope |
| --- | --- | --- |
| Super Admin | `isSuperAdmin` flag ("Boss Koo") | Unrestricted workspace |
| Project Manager | `role = 'Project Manager'` | Portfolio (owned clients/projects/tasks + assigned) |
| HOD | `role = 'HOD'` / `builtin-hod` custom role | Department |
| Staff | `role = 'Staff'` | Assigned + created tasks |
| Client | `role = 'Client'` | Own company (redacted portal) |

**Stack:** React 18 + TypeScript 5.8 + Vite 6 + Tailwind 3 + Zustand 5 + react-router 7 + `@supabase/supabase-js` 2.117. PWA via `vite-plugin-pwa`. Node 22.x, pnpm 10.4.1. **Version `3.0.0`.**

**Backend:** Supabase Postgres + RLS + `SECURITY DEFINER` command RPCs (`aitask_execute_command` / `aitask_execute_service_command`) over a polymorphic `aitask_entities` model, with optimistic concurrency + command-id idempotency. Edge Functions: `invite-aitask-member`, `aitask-feedback`. `pg_cron` scheduled jobs (service cycles, deadline reminders, rate-limit cleanup, monthly revision).

## 2. Architecture (key decisions)

- **Single source of truth:** Supabase is authoritative; the frontend is a canonical projection diffed against a module-level `baseline` and mutated via versioned commands. See `src/lib/secureWorkspace.ts`, `src/store/index.ts`.
- **Authorization core:** `src/lib/access.ts` (`getEffectivePermissions` → `hasPermission` → `can*` helpers), mirrored server-side by `aitask_has_permission` / `aitask_can_view_task` / `aitask_can_mutate_entity`.
- **Sync:** 15 s polling + `focus`/`visibilitychange`/`online` reconciliation; Realtime used only for member-access (permission) changes (`src/lib/supabaseClient.ts`).
- **Canonical selectors:** `isAwaitingClientReview`/`isAwaitingInternalReview`, `getTaskProgress`, `resolveDeliverableStatus`, `deriveServiceProgress`, `getPlanDeliverySummary`.
- **Feedback:** `SystemMessage` → `userFacingMessage` (technical→friendly mapping); `queueActionFeedback`/`acknowledgeActionFeedback` (success only after persistence confirmation).
- **Fail-closed:** if the deployed backend schema is older than the frontend expects, the app enters read-only `upgradeRequired` (or `retry_required` for transient errors).

## 3. Development status

- **Completed:** full audit chain (P0/P1 fixes, cross-role verification, error handling, data sync, UI/UX, Supabase). All prior audit defects fixed & re-verified.
- **This session's source changes (committed, unpushed):** `d00da70` (AUTH-04 zero-permission redirect loop), `2671418` (route technical errors through `SystemMessage` + `errors.fileUnavailable` mapping).
- **Verification (executed this session):** `pnpm check` ✓, `pnpm lint` ✓, `pnpm verify:i18n` 0 findings ✓, `pnpm verify:migrations` 109 non-empty ✓, `pnpm test` **105 files / 814 tests** ✓, `pnpm build` ✓ (PWA).
- **Not executed this session:** pgTAP (`supabase db test`), Playwright e2e, `verify:supabase*`, Deno edge-function type-check — no linked Postgres/browsers/live credentials. These run in CI (`ci.yml`).

## 4. Remaining work (deployment-gated — do not perform without approval)

1. **Apply 2 pending production migrations** (see `SUPABASE_HANDOVER.md`): `pm_client_scope_and_ownership` (**P1 security** — closes a live PM cross-company injection), `department_scoped_visibility_cleanup`.
2. **Redeploy edge functions** (feedback results rate-limit + invite CORS allowlist) after setting `AITASK_ALLOWED_ORIGINS`/`AITASK_PUBLIC_URL`.
3. **Push 8 commits + open PR**, run pgTAP/e2e + live RLS/grants re-check.

## 5. Known issues / risks

- **P2:** base `secure-auth-schema.sql` alone has unscoped PM access (`aitask_can_view_task → true`); hardened only by migrations. **Never deploy the base schema without the full migration chain.**
- **P2:** `service_role` holds `SELECT, UPDATE` on `aitask_members` (documented least-privilege).
- **P3:** 4-arg RPC overloads bypass the workspace-level version lock (legacy-client compatibility).
- **Ops:** Supabase Free plan → no scheduled backups, leaked-password protection disabled.
- **Policy (signed off 2026-10-17):** PM may complete client-visible work before client acceptance; client review remains a separate audited post-completion decision.

## 6. Deployment readiness

**CONDITIONALLY READY.** No release-blocking *code* defect remains. Conditions: apply the 2 pending migrations behind the preflight/backup gate, redeploy edge functions, run pgTAP/e2e + live RLS re-check. See `DEPLOYMENT_CHECKLIST.md`.

## 7. Next-agent responsibilities

Git push + PR; Vercel deploy; Supabase migration application (with backup/preflight); post-deploy verification. **Do not** modify production data/schema/RLS or deploy without owner approval.
