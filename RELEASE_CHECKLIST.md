# Release Checklist

**Audit date:** 2026-10-17
**Decision:** **NO-GO / NOT READY FOR PRODUCTION**

## Code and test gates

- [x] Typecheck passes (`pnpm check`).
- [x] Lint passes (`pnpm lint`).
- [x] i18n coverage passes (0 findings).
- [x] 113 migration files are non-empty.
- [ ] Unit suite passes — **5 failures / 828 tests** after current error-normalization changes.
- [x] Production build succeeds.
- [x] PWA verification passes.
- [x] Bundle budgets pass; review the 547.63 kB eager runtime warning before scale-up.
- [ ] Full Playwright suite passes — run was aborted after early failures.

## Database and Supabase

- [x] All current migrations apply in a disposable local stack.
- [x] Full disposable pgTAP suite passes (67 files / 1,024 assertions).
- [x] Disposable schema lint has no errors.
- [x] Anonymous RPC/table/cutover probes pass.
- [ ] Fix and test immutable-history deletion semantics.
- [ ] Reconcile the committed release manifest with the current 113-migration tree.
- [ ] Independently verify production `pg_policies`, grants, RPC signatures, Storage policies, Auth settings, and deployed Edge Function versions.
- [ ] Run four-role authenticated staging smoke tests.

## Security and configuration

- [x] No service-role key is used in browser runtime source.
- [x] Production build requires Supabase mode, HTTPS Supabase URL, and modern publishable key.
- [ ] Production build rejects `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS=true`.
- [ ] Dependency vulnerability audit completed with registry access.
- [ ] Forwarded-IP trust and Edge Function rate-limit behavior verified on the deployed platform.

## Operations

- [ ] Fresh backup/recovery evidence recorded before rollout.
- [ ] Leaked-password protection status resolved and documented.
- [ ] Monitoring and alerting owner confirmed; built-in logs alone are not an SLO.
- [ ] Rollback procedure rehearsed for application and database changes.
- [ ] Release provenance verified against the deployed `build-info.json`.
- [ ] One authoritative release manifest replaces contradictory historical handovers.

## Required remediation order

1. Correct the history migration’s FK/append-only interaction and add workspace/member deletion tests.
2. Reconcile the 113-migration release manifest and rerun the disposable DB gate.
3. Align the five unit expectations with the approved safe-error contract.
4. Fix deterministic browser bootstrap/focus/save-recovery failures and complete the 324-test suite.
5. Add the hosted password-bypass build guard.
6. Restore staging access and perform authenticated four-role QA plus independent live Supabase verification.

No production data, schema, RLS policy, Edge Function, or deployment was changed during this review.
