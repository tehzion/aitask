# Remaining Gaps

**Audit date:** 2026-10-17
**Release posture:** no-go until P1 items are resolved or explicitly accepted by the release owner.

## P1 — release blockers

| ID | Module | Gap | Impact | Evidence | Action |
| --- | --- | --- | --- | --- | --- |
| HIST-001 | Supabase history | Append-only history trigger rejects FK-driven workspace cascades and member `ON DELETE SET NULL` maintenance | Workspace/member deletion can fail; cleanup and lifecycle operations are unsafe | Disposable smoke helpers fail with `Entity history is append-only` | Define retention semantics and correct FK/trigger interaction; add deletion pgTAP coverage |
| REL-002 | Release control | Manifest covers 110 migrations while current tree contains 113 | Release alignment gate fails; production state cannot be inferred from repo metadata | `pnpm verify:release-db-alignment` fails | Reconcile manifest, current SQL, rollout aliases, and production history |
| TEST-003 | Unit gate | Five tests expect raw backend/validation text while code returns safe localized descriptors | CI cannot establish a green release | 107 files: 823 pass / 5 fail | Update contract/tests together and rerun all unit tests |
| UX-004 | Browser gate | Auth/bootstrap assumptions and accessibility/save-recovery flows are not green | Role journeys and keyboard behavior are not independently verified | 324-test run aborted after observed failures; isolated specs fail | Repair deterministic fixtures, then rerun full Playwright suite |
| CFG-005 | Build security | Hosted builds do not reject explicit password-reset bypass | A misconfigured hosted deployment could bypass account setup | `auth.ts` allows explicit true; Vite guard omits the flag | Add production build assertion and CI test |
| OPS-006 | Operations | Live/staging RLS, backups, Auth protection, monitoring, and four-role smoke are not fully evidenced | Cannot claim operational production readiness | No authenticated live session in this review; prior reports list access/plan blockers | Restore access, verify read-only, and document owner/rollback evidence |

## P2 — important hardening

| ID | Gap | Impact | Action |
| --- | --- | --- | --- |
| PERF-007 | Eager `workspaceRuntime` is 547.63 kB raw / 159.54 kB gzip | Slower authenticated startup on constrained devices | Split store/runtime graph and add per-entry budgets |
| REL-008 | Email/member operations use compensating multi-step Auth/RPC flows | Partial failures can leave inconsistent Auth/member state | Add durable reconciliation state and alerts |
| PERF-009 | Invite/email uniqueness scans all Auth users in pages | Latency grows linearly with tenant size | Use indexed lookup/reservation or server-side uniqueness strategy |
| DATA-010 | Polymorphic JSONB entity model uses soft references | Missed guard path can admit invalid references | Add exhaustive entity contract tests and targeted relational constraints |
| LIFE-011 | Member/client/project hard-delete semantics lack archive/tombstone policy | Historical reporting and reactivation are limited | Obtain policy decision before building archive projections |
| SEC-012 | Feedback IP rate-limit identity depends on forwarded headers | Header trust configuration could affect abuse resistance | Verify platform normalization and add independent abuse controls |
| SEC-013 | CSP permits `unsafe-inline`, broad Supabase wildcard, and third-party avatar host | Larger browser request/style surface | Narrow hosts and document required inline styles |

## P3 — maintainability/optimization

- Retire four-argument command RPC overloads when old clients are gone so every mutation has workspace-version protection.
- Reduce the size and duplicated predicates in `src/store/index.ts`.
- Pause background polling while hidden if product freshness allows it.
- Add a dedicated `/health` endpoint or formally document the existing provenance/sync-status substitute.

## Operational gaps

- No scheduled database backups are evidenced for the current plan; manual logical backup discipline must be owned and tested.
- Leaked-password protection is reported disabled by the existing operational evidence; confirm the current Supabase plan/settings.
- External APM/error alerting is not configured; built-in Vercel/Supabase logs are not equivalent to an alerting SLO.
- Release documents disagree on migration counts and prior test totals; one authoritative generated manifest is required.
