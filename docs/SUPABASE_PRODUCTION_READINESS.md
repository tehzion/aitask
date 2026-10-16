# Supabase Production Readiness — AiTask

**Date:** 2026-10-17

## 1. Summary

| Dimension | Verdict |
| --- | --- |
| Architecture | Sound (polymorphic entity model, denormalized hot-path columns, correct indexes) |
| RLS / security | Comprehensive, role-correct, search-path-safe, no `USING (true)` |
| Auth & lifecycle | Supabase Auth + publishable-key-only client; self-escalation blocked by trigger; role changes refresh via realtime |
| Data integrity | Sound; soft-FKs accepted by design; idempotency + optimistic concurrency |
| Realtime | Narrow + polling reconciliation; leak-free |
| Performance | Efficient at scale; P3 growth items only |
| Storage | Private bucket, 4 policies, 100 MB, 5 MIME types |
| Migrations / recovery | Ordered + reproducible; backup/restore runbook documented |

## 2. Issues discovered

| Priority | Issue | Type |
| --- | --- | --- |
| P1 | `pm_client_scope_and_ownership` **not applied** — live PM cross-company edit/delete/re-own hole in SECURITY DEFINER RPC | Security (deployment) |
| P1 | `department_scoped_visibility_cleanup` **not applied** | Security (deployment) |
| P2 | Base `secure-auth-schema.sql` has unscoped PM access when applied without migrations | Drift/footgun |
| P2 | `service_role` write on `aitask_members` (documented least-privilege) | Hardening |
| P3 | 4-arg RPC overloads bypass workspace lock; whole-workspace-in-memory; `JSON.stringify` equality | Compatibility/scalability |

## 3. Issues fixed

- None required this pass — the Supabase integration is correct. (Prior phases fixed: error-feedback rendering, AUTH-04 redirect loop; the two security migrations are authored but **deployment-gated**.)

## 4. Migrations created

- None this pass. The two pending security migrations (`20261016160000_pm_client_scope_and_ownership`, `20261016170000_department_scoped_visibility_cleanup`) are authored and validated but **not applied to production** (requires approval + preflight/backup gate).

## 5. Security vulnerabilities resolved (source)

- PM cross-company injection → fixed in `pm_client_scope_and_ownership.sql` (pending production).
- Department-scoped visibility leak → fixed in `department_scoped_visibility_cleanup.sql` (pending production).
- Client-visible completion auto-approve (DB override) → fixed in `client_visible_completion_review.sql` (applied).
- Service transitions frontend-only → fixed in `service_transition_guard.sql` (applied).

## 6. Remaining risks

1. Two pending migrations (one P1 security) — deployment approval required.
2. Leaked-password protection disabled; no scheduled backups (Free plan).
3. Live RLS/grants/`pg_stat_statements` not independently re-verified this session.

## 7. Production readiness

**CONDITIONALLY READY.** The Supabase backend is secure, consistent, performant, and correctly integrated for all four roles. Release is conditional on: (1) applying the two pending migrations behind the preflight/backup gate, (2) ~~product sign-off on the approval-ordering policy~~ **signed off 2026-10-17**, (3) running pgTAP/e2e + an independent live RLS/grants re-check in the deploy gate.

## 8. Verification

`pnpm check` ✓ · `pnpm lint` ✓ · `pnpm verify:i18n` 0 ✓ · `pnpm test` **105 files / 814 tests** ✓ · `pnpm build` ✓ · `pnpm verify:migrations` 109 non-empty ✓.
