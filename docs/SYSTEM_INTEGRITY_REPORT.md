# System Integrity Report — AiTask

**Date:** 2026-10-17

## 1. Assessment summary

| Dimension | Verdict | Basis |
| --- | --- | --- |
| Business logic integrity | PASS | No invalid-state path; frontend + DB guards consistent |
| Data lifecycle / historical accuracy | PASS | Append-only history; attribution degrades (not lost) on deletion |
| Concurrency | PASS | Optimistic versioning + idempotency receipts + status preconditions |
| Reporting / calculation | PASS | Canonical selectors fed by `deriveServiceProgress`; local-date aware |
| Audit trail & accountability | PASS | `aitask_audit_events` (service_role-only writes, admin read) + task history |
| Failure recovery | PASS | Idempotent retry, `discardMutation`, offline/online reconciliation |
| Long-term reliability | PASS (source) | 500/page entity pagination, indexed hot paths, bundle under budget; growth risk noted |

## 2. Long-term / large-dataset notes

- Workspace load pages `aitask_members` + `aitask_entities` (500/page) and reconstructs the notification feed separately — fine at current scale (174 tasks / 226 service entities); **whole-workspace-in-memory** is a growth risk for very large tenants (documented, not a current defect).
- Notification feed is cursor-paginated (`NotificationFeedPage`/`nextCursor`).
- Eager bundle near the 300 KiB gzip cap (measured 295.6 KiB in a prior audit) — within budget.
- No missing index found in static review of hot paths (verified only via manifest, not live `pg_stat_statements`).

## 3. Remaining risks

| Priority | Risk | Nature |
| --- | --- | --- |
| P1 | `pm_client_scope_and_ownership` + `department_scoped_visibility_cleanup` **not applied to production** (first closes a live PM cross-company injection) | Deployment (approval + backup gate) |
| P1 | ~~Client-approval ordering policy unconfirmed~~ **SIGNED OFF** (2026-10-17) | Resolved |
| P2 | Whole-workspace-in-memory load + 15 s poll for very large tenants | Scalability (documented) |
| — | Live multi-user / large-dataset / RLS re-verification not run offline | Verification gap (CI covers role flows) |

## 4. Production readiness

**CONDITIONALLY READY** — no release-blocking *business-logic, historical, concurrency, or reporting* defect remains. The conditionality is: apply the two pending production migrations behind the preflight/backup gate, and run the pgTAP/e2e suites in the deploy gate. (Approval-ordering policy: **signed off** 2026-10-17.)

## 5. Verification

`pnpm check` ✓ · `pnpm lint` ✓ · `pnpm verify:i18n` 0 ✓ · `pnpm test` **105 files / 814 tests** ✓ · `pnpm build` ✓.

---

### Companion reports
`BUSINESS_LOGIC_AUDIT.md`, `DATA_LIFECYCLE_REPORT.md`, `CONCURRENCY_TEST_REPORT.md`, `HISTORICAL_DATA_VERIFICATION.md`.
