# Remaining Gaps

**Audit date:** 2026-10-17
**Release posture:** no-go until P1 items are resolved or explicitly accepted by the release owner.

## Status on 2026-11-10

Re-checked against the current tree. The tables below are the 17 Oct audit text, kept as written.
Only items with evidence from this check are marked.

| ID | Status | Evidence on 10 Nov |
| --- | --- | --- |
| TEST-003 | Resolved | `pnpm test`: 142 files, 1,119 tests pass. |
| CFG-005 | Resolved | `vite.config.ts` rejects `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS` in hosted production builds. |
| PERF-007 | Addressed | `pnpm verify:bundle` passes with per-entry budgets; eager JS is 271.8 KiB gzip against the 300 KiB cap. |
| REL-002 | Resolved | Production and repository migration history are identical (148/148) and `pnpm verify:release-db-alignment` passes, verified through `20261110114150_audit_history_actor_snapshot_without_avatar`. |
| HIST-001 | Partly resolved | Deleting a member's login now works (`auth_user_id` becomes null), checked locally. Deleting a workspace that has history is refused by design; see `AUDIT_HISTORY_RETENTION_REVIEW.md`. Needs the retention decision below. |
| UX-004 | Open | The full Playwright suite has not been run since the audit. In a targeted run, 7 of 8 specs touched by the 10 Nov role work pass. `client-workspace-v2.spec.ts:5` ("Client 2.0 is approval-first, mobile-safe, and fails closed") fails the same way on master before those commits: the app stays on "Loading AiTask…". |
| OPS-006 | Partly evidenced | A read-only production check on 10 Nov found health advisor clean, 13 of 60 connections used, 0 deadlocks, scheduled jobs succeeding. Backups, Auth protection, alerting and the four-role live smoke are still not evidenced. Workspace reads are slow under load: see `docs/2026-11-10-handoff-supabase-performance.md`. |

New since the audit: `aitask_entity_history` holds about 81 MB of the 107 MB production database and needs a retention policy.

## Status on 2026-11-13

- Release control: `20261113090000_hod_project_management` is applied to production. Repository and production migration names match exactly (153/153). The applied release manifest is `supabase/preflight/aitask_release_manifest_20261113z_hod_project_payment_applied_production.json`; `node scripts/verify-release-db-alignment.mjs` passes.
- This supersedes the 148/148 `REL-002` evidence above.
- Production cleanup: removed four QA/demo member accounts and the `TEST ONLY` client/project after a rollback-only dry run. The targeted rollback snapshot is `private.qa_cleanup_backup_20261113` (RLS enabled, no anon/authenticated access). Post-cleanup state: 8 members, 8 auth users, 0 orphan auth users, 43 clients, 43 projects, 53 tasks.

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
