# AiTask Bug Report

Audit date: 2026-10-17
Status: audit only; no fixes applied

## Findings

| ID | Severity | Confidence | Area | Finding / impact | Evidence and reproduction | Recommended disposition |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | P0 | Confirmed source risk; live unverified | Supabase authorization | PM company/client scope is migration-dependent. Without the ownership migration, a SECURITY DEFINER service-command path can mutate another company's client data. Department-scoped roles can also retain global-view permissions until cleanup migration runs. | Inspect `supabase/secure-auth-schema.sql` broad PM defaults and the comments/guards in `supabase/migrations/20261016160000_pm_client_scope_and_ownership.sql` and `20261016170000_department_scoped_visibility_cleanup.sql`. | Read-only verify live migration/function/policy state and execute negative cross-company tests in disposable/staging data before release. |
| BUG-002 | P0 | Confirmed repository inconsistency | Release control | Handover documents disagree on pending versus deployed migrations/functions, migration counts, and verification totals. Release operators cannot infer the authoritative security state. | Compare `HANDOVER.md`, `SUPABASE_HANDOVER.md`, and `DEPLOYMENT_REPORT.md`. | Publish one generated release manifest; mark older handovers historical/superseded. |
| BUG-003 | P1 | Confirmed code path | Account email change | Auth email is changed before the member row. If the member RPC fails and rollback also fails, the account is left inconsistent while the user sees an error. | `supabase/functions/invite-aitask-member/index.ts:171-220`. | Add durable pending state and compensating reconciliation; alert on rollback failure. |
| BUG-004 | P1 | Confirmed code path | Member deletion | Auth user is deleted before the workspace member RPC. A DB failure leaves an orphan member with disabled login and requires manual retry. | `supabase/functions/invite-aitask-member/index.ts:222-250`. | Use durable deletion state/queue or reverse ordering with idempotent cleanup. |
| BUG-005 | P1 | Confirmed test failure | Accessibility | Mobile menu opens but Dashboard is not focused, violating the expected keyboard focus contract. | Run `pnpm exec playwright test e2e/accessibility.spec.ts --project=desktop-chrome`; failure at `e2e/accessibility.spec.ts:85`. | Make focus transfer deterministic; test `document.activeElement` after menu open and after inert is applied. |
| BUG-006 | P1/P2 | Confirmed test failure | Notifications/PWA overlays | Info toast injected after online/update events is not rendered in the mobile overlay test. | Run `pnpm exec playwright test e2e/app-smoke.spec.ts --project=desktop-chrome`; failure at `e2e/app-smoke.spec.ts:369` for “Mobile overlay QA”. | Add a focused ToastContainer test; inspect portal target lifecycle and store module identity. |
| BUG-007 | P1 | Confirmed code path | Configuration | Explicit `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=true` can enable bypass on a hosted origin. | `src/lib/auth.ts:79-88`; production checks in `vite.config.ts` do not reject the flag. | Fail production builds when enabled, or force false outside localhost/local backend. |
| BUG-008 | P1/P2 | Confirmed code path | Edge Function performance | Invite and email changes scan up to 100,000 Auth users in pages of 1,000. | `supabase/functions/invite-aitask-member/index.ts:51-61` and calls at `:190`, `:330`, `:350`. | Replace with indexed/direct uniqueness lookup or a durable email reservation table. |
| BUG-009 | P2 | Confirmed build warning | Performance | `workspaceRuntime` is 540.12 kB minified / 157.11 kB gzip. Vite warns, but the current bundle verifier only budgets initial index JS. | `pnpm build` output on 2026-10-17. | Split eager runtime and add authenticated-route chunk budgets. |
| BUG-010 | P2 | Potential | Feedback abuse prevention | Rate-limit identity trusts `cf-connecting-ip` or the first `x-forwarded-for` value. If the Edge deployment does not normalize these headers, clients may spoof identities and bypass per-IP limits. | `supabase/functions/aitask-feedback/index.ts:50-56`. | Verify platform header behavior; prefer a platform-trusted request identity or add abuse controls independent of client headers. |
| BUG-011 | P2 | Potential | Data integrity | `aitask_entities.data` is JSONB and polymorphic. Many domain constraints are enforced by triggers/RPCs rather than relational FKs or typed columns. A missed entity-type path can admit structurally invalid state. | `supabase/secure-auth-schema.sql` entity table and guard; migration-specific triggers/RPCs. | Add exhaustive entity-type contract tests and targeted relational constraints for high-value references. |
| BUG-012 | P2 | Potential | CSP/privacy | CSP allows `style-src 'unsafe-inline'`, broad `https://*.supabase.co` connectivity, and third-party `https://i.pravatar.cc` images. This may be intentional but weakens least-privilege policy and adds a third-party request surface. | `vercel.json` CSP header. | Narrow hosts and replace third-party avatars with controlled assets where feasible; document inline-style requirement. |
| BUG-013 | P2 | Confirmed run limitation | Browser verification | The broad Playwright run started 324 tests but the local Vite server became unavailable; 30 tests failed and 294 did not run. Most later failures were `ERR_CONNECTION_REFUSED` or fixture setup failures. | `pnpm test:e2e` with local server; final exit 130. | Treat as incomplete coverage, not 30 product defects. Stabilize test server lifecycle and rerun. |
| BUG-014 | P3 | Confirmed code/design | Notifications route | `/notifications` is intentionally not wrapped in `RoleRoute`; it is available to every authenticated account as a fallback destination. This is safe only if the feed RPC/local selector always scopes results correctly. | `src/App.tsx:196`; `src/pages/Notifications.tsx:130-190`; existing comment in `src/lib/access.ts`. | Retain only with explicit server/client visibility tests for zero-permission and cross-account users. |

## Confirmed controls / not bugs

- `src/lib/serviceFiles.ts` validates file type and 100 MB size before upload and retains uncertain uploads for reconciliation.
- Storage is configured as private with scoped path policies and MIME restrictions in the migration chain.
- Session changes abort or invalidate pending workspace operations.
- No runtime XSS sink was found in `src` by the source search used in this audit.
- Unit suite, type checks, lint, build, migration non-empty, i18n, PWA, and initial bundle checks passed.

## Suggested acceptance criteria

Before closing P0/P1 findings:

1. A PM cannot read, create, rename, update, re-own, or delete another company's client through UI, direct RPC, or forged command payload.
2. A department-scoped custom role cannot use stale `viewAllTasks` or `viewAllClients` permissions.
3. Email and member deletion operations are recoverable and eventually consistent with a visible admin state.
4. Mobile menu opening deterministically focuses the first reachable navigation item and restores focus on close.
5. Toasts render in the mobile overlay stack after online/PWA events.
6. The full browser suite and disposable Supabase integration suite complete without server/bootstrap failures.
