# Fix Verification Report

**Audit date:** 2026-10-17
**Scope:** previous audits, fixes, current dirty-tree changes, and executable evidence.

## Classification

- **Verified Fixed:** root cause and relevant tests were independently exercised.
- **Partially Fixed:** source and some tests pass, but an important boundary is unverified.
- **Regression Detected:** a new executable scenario fails because of the change.
- **Unable to Verify:** requires live credentials, staging access, or an unavailable external system.

## Findings

| Issue | Previous fix/current implementation | Result | Evidence |
| --- | --- | --- | --- |
| PM cross-company client mutation | `20261016160000_pm_client_scope_and_ownership.sql` plus scope tests | **Verified Fixed locally / live unable to verify** | Migration applied in disposable stack; PM scope pgTAP passed |
| Department-scoped visibility | `20261016170000_department_scoped_visibility_cleanup.sql` | **Verified Fixed locally / live unable to verify** | Full local pgTAP suite passed; production manifest requires reconciliation |
| Client-visible completion approval semantics | Completion preserves client review as pending; product policy allows post-completion client acceptance | **Verified Fixed** | Unit and DB transition tests pass; policy sign-off is documented |
| Service-cycle/client-plan transition rules | Store guards plus `service_transition_guard.sql` | **Verified Fixed in tested paths** | Relevant pgTAP passed; new narrow RPC still needs a focused regression test |
| Notification recipient/audience guards | Server audience guards, deduplication, cleanup migrations | **Verified Fixed in disposable DB** | Notification, cursor, unread, and cleanup pgTAP files passed |
| Secure cutover | Revoked anonymous table/RPC access and protected command paths | **Verified Fixed in disposable DB** | Anonymous probes passed for protected RPCs, secure tables, legacy health/origin helpers, and `aitask_app_state` |
| Workspace revision Realtime invalidation | New workspace publication migration and client subscription | **Partially Fixed** | Migration applied and source/unit tests pass; no deployed Realtime delivery test |
| User-facing transport/database error sanitisation | `userFacingMessage` and callers now map technical failures to safe localized copy | **Regression Detected** | 5 unit tests fail because existing expectations still require raw messages |
| Immutable entity/member history | New history table, triggers, append-only guard, command correlation | **Regression Detected** | Local storage/Staff smoke teardown fails on workspace cascade and member `ON DELETE SET NULL` history maintenance |
| Password-reset bypass | Runtime flag remains configurable | **Not Fixed** | Hosted build validation checks backend/key but not `VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS` |
| Mobile navigation focus | Timer-based focus in `Sidebar.tsx` | **Regression/Unable to Verify** | Accessibility test failed to find expected focus after menu workflow; broad suite was incomplete |
| Mobile toast overlay | Toast portal/store behavior | **Unable to Verify / test failure** | Existing audit notes a failed overlay scenario; no clean focused pass in this review |
| Edge feedback rate limits | Submit/results rate-limit RPCs | **Verified in source/unit scope** | Edge rate-limit tests and migration suite pass; deployed function version not independently checked |
| Auth/member multi-step operations | Compensation paths for email/member deletion | **Partially Fixed** | Code has rollback/retry paths, but rollback failure can leave Auth/member state split and full Auth-user scan is O(n) |

## Regression scope

No production data, schema, RLS policy, edge function, or deployment was modified. All database executions used disposable local Docker stacks. Existing dirty-worktree changes were preserved.
