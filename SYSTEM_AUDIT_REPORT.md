# AiTask Full System Audit Report

Audit date: 2026-10-17
Repository: `tehzion/aitask`
Branch: `codex/audit-p0p1-2026-10-16`
Commit inspected: `c46bbcb` (`feat: complete role-based UI UX audit`)

## Executive verdict

The application has a substantial security and reliability foundation: the secure backend uses authenticated Supabase access, RLS, command/RPC boundaries, optimistic versions, session invalidation, paged workspace reads, private Storage, upload reconciliation, and client projections. TypeScript, ESLint, unit tests, production build, migration non-empty checks, i18n checks, and PWA checks all passed in this audit.

The system is not ready for an unconditional production-release sign-off. The release decision is blocked by:

1. Critical authorization behavior depends on the latest migration chain, while repository handover documents contradict each other about which migrations and Edge Functions are live.
2. Live Supabase state was not independently revalidated in this audit. The production verifier was deliberately not run because it includes an anonymous write probe; no production mutation was authorized or performed.
3. Focused local browser checks currently fail on mobile navigation focus and toast rendering. The broad browser run was interrupted after 30 failures and 294 tests did not run; most later failures were cascading from the local test server becoming unavailable.
4. The production build passes but reports a 540 kB minified `workspaceRuntime` chunk, above Vite's 500 kB warning threshold.

Confidence labels used below:

- **Confirmed**: directly observed in source, tests, or a local command result.
- **Potential**: credible risk that needs a targeted test or live verification.
- **Unverified**: cannot be proven from the repository alone or was intentionally not exercised against a live environment.

## Scope and method

Inspected the React/Vite/TypeScript frontend, Zustand state layer, local and Supabase backend adapters, Auth/session code, Edge Functions, Supabase schema and migration chain, Storage policies, PWA configuration, deployment configuration, tests, and existing release/handover documents.

Read-only or local checks performed:

| Check | Result |
| --- | --- |
| `pnpm check` | Passed |
| `pnpm lint` | Passed |
| `pnpm test -- --maxWorkers=1 --reporter=dot` | 107 files / 820 tests passed |
| `pnpm build` | Passed; Vite emitted a large-chunk warning |
| `pnpm verify:migrations` | Passed; 110 non-empty SQL migrations |
| `pnpm verify:i18n` | Passed; 0 findings across 171 source files |
| `node scripts/verify-pwa.mjs` | Passed |
| `node scripts/verify-bundle-size.mjs` | Passed initial-index budget |
| local Playwright smoke/accessibility checks | Two focused failures; see `TEST_COVERAGE_REPORT.md` |
| live Supabase verifier | Not run; it contains an anonymous write probe |

The working tree contained pre-existing uncommitted source, SQL, and documentation changes during the final checks. This audit did not reset, revert, or overwrite those changes. The reports describe the current working tree and commit context, not an assumed clean checkout.

## Architecture map

```text
React routes and components
        |
        v
Zustand workspace store + action/recovery state
        |
        +--> local browser mode (demo/localStorage)
        |
        +--> secure Supabase mode
              |
              +--> Supabase Auth/sessionStorage
              +--> RLS-protected members/entities/workspace tables
              +--> SECURITY DEFINER command and service RPCs
              +--> private Storage bucket for service files
              +--> Realtime access changes + 15 s/presence reconciliation
              +--> Edge Functions for onboarding and feedback
```

The secure workspace is intentionally a polymorphic `aitask_entities` table with typed `entity_type`, JSONB `data`, version fields, parent/client/assignee denormalization, and RPC-mediated writes. That gives a consistent sync protocol, but it concentrates data integrity and authorization in triggers, helper functions, and migration ordering rather than ordinary relational foreign keys.

## Functional and workflow audit

| Area | Current assessment | Confidence | Evidence |
| --- | --- | --- | --- |
| Authentication and session boot | Private routes wait for backend readiness, redirect unauthenticated users to `/login`, honor reset-password setup, and clear state on Auth sign-out or account change. | Confirmed | `src/App.tsx:45-54`, `src/App.tsx:110-156`, `src/lib/supabaseClient.ts` |
| Role/page access | Most primary routes use `RoleRoute`; client workspace and notifications deliberately use page-level checks. | Confirmed | `src/App.tsx:182-198`, `src/pages/ClientWorkspace.tsx:220-230`, `src/lib/access.ts:409-440` |
| Client workspace isolation | Client users are matched to their company; internal staff require service-client access derived from role, assignment, profile ownership, or project visibility. | Confirmed in code; live RLS unverified | `src/pages/ClientWorkspace.tsx:220-230`, `src/lib/access.ts:409-440` |
| Notification search/pagination | Feed requests use 50-item pages, cursor state, generation guards, and stale-response cancellation. | Confirmed | `src/pages/Notifications.tsx:130-190` |
| Secure workspace loading | Members/entities are paged in 500-row ranges, loaded with revision checks, and retried when the workspace changes during load. | Confirmed | `src/lib/secureWorkspace.ts:1646-1718`, `src/lib/secureWorkspace.ts:1807-1812` |
| Save/conflict/retry flows | Command batches, idempotency IDs, optimistic versions, retained pending commands, abort/session checks, and explicit retry/conflict states are implemented and unit-tested. | Confirmed in source/tests | `src/lib/secureWorkspace.ts`, `src/lib/secureCommandBatch.ts`, 820 passing unit tests |
| Service-file upload/download | Client validates size/type, uploads to a private bucket, records pending intent, reconciles uncertain results, and only removes owned/unreferenced files. | Confirmed in source; live policy unverified | `src/lib/serviceFiles.ts:210-260`, `src/lib/serviceFiles.ts:293-370`, Storage migrations |
| Onboarding and member lifecycle | Edge Function authenticates the actor and uses idempotent reservation/finalization RPCs for invites, but self-email and delete flows have cross-system failure windows. | Confirmed | `supabase/functions/invite-aitask-member/index.ts:171-250` |
| Feedback submission/results | Origin allowlist, bounded body, validation, uniqueness handling, rate limit, Auth review identity, and reviewer allowlist are present. | Confirmed in source; deployment/config unverified | `supabase/functions/aitask-feedback/index.ts:45-130`, `:200-300` |
| Responsive/accessibility | Most controls have labels, focus traps, inert background handling, and responsive layouts. Current browser checks expose mobile focus and toast regressions. | Confirmed failures | `src/components/Sidebar.tsx:152-194`, `src/components/Toast.tsx:58-76`, `TEST_COVERAGE_REPORT.md` |
| PWA/offline shell | Manifest, shell caching, cache boundaries, update handling, offline notices, and no Supabase data caching passed static PWA verification. | Confirmed | `node scripts/verify-pwa.mjs`, `src/lib/pwaUpdates.ts` |

## Priority findings

### SEC-001 — Migration-dependent PM authorization boundary

**Severity:** P0/P1 security gate
**Confidence:** Confirmed in source design; live state unverified

The base secure schema gives Project Managers broad defaults in helper functions such as `aitask_can_view_task`, `aitask_can_view_client`, and `aitask_can_view_project`. The latest ownership migration documents and patches a prior SECURITY DEFINER service-command path that could let an authenticated PM mutate another company's client data when the full scope checks were not applied. A later migration removes global-view permission leakage from department-scoped custom roles.

The safe state therefore requires the complete migration chain, especially:

- `20261016160000_pm_client_scope_and_ownership.sql`
- `20261016170000_department_scoped_visibility_cleanup.sql`

The repository proves the patches exist and are covered by SQL tests. It does not, by itself, prove the production project has those exact definitions. Resolve this before release with a read-only migration, function-definition, policy, and cross-company negative-test verification.

### OPS-002 — Contradictory deployment truth

**Severity:** P0 release-control
**Confidence:** Confirmed repository inconsistency; actual live state unverified

`HANDOVER.md` and `SUPABASE_HANDOVER.md` describe critical migrations and Edge Functions as pending/requiring redeploy, while `DEPLOYMENT_REPORT.md` claims all 110 migrations and both functions were deployed and read-only production verification passed. The same documents disagree on test totals and release status.

This is not a cosmetic documentation issue: the authorization outcome depends on the deployment state. Establish one authoritative release manifest generated from read-only live metadata, record migration aliases, function versions, environment names, and verification timestamps, then mark historical handovers as superseded.

### REL-003 — Auth/member email update can split into inconsistent systems

**Severity:** P1 reliability
**Confidence:** Confirmed code path

`update_self_email` changes the Auth email first and then calls `aitask_update_member_email`. On RPC failure it attempts a rollback. If the rollback fails, the function only logs the failure and returns an error; Auth and the member row can disagree.

Use a durable reconciliation state or a server-side operation with a compensating job and explicit “email update pending” status. Alert on rollback failure; do not rely on a log line as the only recovery signal.

### REL-004 — Member deletion can leave an orphaned workspace member

**Severity:** P1 reliability
**Confidence:** Confirmed code path

`delete_member` deletes the Auth user before calling `aitask_delete_member_account`. If the RPC fails, the response says the login is disabled and asks the administrator to retry, leaving the workspace member row behind until recovery.

Prefer a transactional server-owned lifecycle marker followed by asynchronous Auth deletion, or make the DB row deletion the authoritative first step with a durable cleanup queue. Add an idempotent repair command and an admin-visible “pending deletion” state.

### PERF-005 — Full Auth user scan on invite/email changes

**Severity:** P1/P2 performance
**Confidence:** Confirmed code path

`listAllAuthUsers` requests pages of up to 1,000 users and can scan 100 pages for every invite and self-email change. This creates latency and edge timeout risk as the Auth population grows.

Replace full scans with a server-side uniqueness check, a direct filtered lookup if supported by the Auth API, or a workspace-side normalized email reservation table with a unique index.

### CFG-006 — Password-reset bypass can be enabled in a hosted build

**Severity:** P1 configuration safety
**Confidence:** Confirmed code path; exploitability depends on deployment configuration

`canUsePasswordResetBypass()` returns true when `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS` is explicitly enabled, even on a non-local host. The production build guard validates backend mode and Supabase URL/key but does not fail when this bypass flag is enabled.

Make hosted builds reject this flag at build time, or force it false whenever the runtime is not local and remove the hosted override path. Add a CI assertion over production environment names.

### UX-007 — Mobile navigation focus regression

**Severity:** P1 accessibility
**Confidence:** Confirmed by focused Playwright run

`e2e/accessibility.spec.ts` failed at line 85: after opening the mobile navigation, the Dashboard link was present but not focused. `Sidebar.tsx:158-162` schedules focus on the first anchor, but the current browser run received an inactive element. Verify whether inerting the app content, responsive `matchMedia` state, or a subsequent focus change wins the race; replace the timer with a deterministic focus effect or focus handshake.

### UX-008 — Mobile toast is not rendered in overlay scenario

**Severity:** P1/P2 usability/reliability
**Confidence:** Confirmed by focused Playwright run

`e2e/app-smoke.spec.ts:359-369` injects an info toast after `online` and `aitask:pwa-update-ready`; the clean smoke rerun could not find “Mobile overlay QA”. The Toast component subscribes to `useToastStore` and portals to a dynamically selected target, so inspect module identity, portal target lifecycle, and event ordering. Add a focused component/browser test that asserts the toast is visible and positioned above the mobile notification popup and update notice.

### PERF-009 — Large eager runtime chunk

**Severity:** P2 performance
**Confidence:** Confirmed build warning

The production build passes but emits `workspaceRuntime` at 540.12 kB minified / 157.11 kB gzip. The current bundle-budget script only checks the initial index JS budget, so this warning can regress route startup without failing CI.

Split the store/runtime graph further, keep role/page-specific logic lazy, and add a budget for each eager chunk and the first authenticated route.

## Security controls that passed source review

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` usage was found in application runtime code; test harnesses use dynamic evaluation only for local fixture loading.
- Production build requires Supabase mode, HTTPS Supabase URL, and `sb_publishable_` key.
- Service-role keys are referenced in Edge Functions/scripts, not frontend `VITE_` runtime code.
- Storage bucket is private, limited to 100 MiB, and restricted to PDF/JPEG/PNG/WebP/GIF in the migration chain.
- RLS, restricted grants, empty `search_path` on security-sensitive helpers, and secret-like JSON key rejection are present in the secure schema/migrations.
- CSP, frame denial, HSTS, referrer policy, and permissions policy are configured in `vercel.json`.

These are source-level conclusions. Live policy hashes, function deployment versions, Auth settings, Storage policies, and environment values remain unverified in this audit.

## Release decision

**Do not declare the current branch production-ready yet.** The minimum release gate is:

1. Reconcile deployment documents and publish one authoritative live manifest.
2. Read-only verify the critical migration/function/RLS state in the intended Supabase project.
3. Fix or explicitly waive the two focused browser failures with evidence.
4. Add a hosted-build guard for password-reset bypass.
5. Re-run the full local browser suite after the test-server/bootstrap issue is resolved, then run the disposable Supabase integration suite separately.

Detailed defects, Supabase findings, prioritized work, and coverage are in the companion reports.
