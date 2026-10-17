# Supabase Verification Report

**Audit date:** 2026-10-17
**Scope:** current repository migration chain, schema/RLS/RPC/storage code, and disposable local execution. No production mutation or live deployment operation was performed.

## 1. Executed database evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Migration non-empty guard | Pass | 113 non-empty SQL migrations |
| Full migration application | Pass | Disposable local stack applied all current migrations in filename order, including `20261017091031`, `20261017113000`, and `20261017130000` |
| pgTAP suite | Pass | 67 files / 1,024 assertions |
| Schema lint | Pass | No schema errors |
| Advisors | Pass with informational results | Unused indexes and RLS-enabled/no-policy restricted tables; no fail-on-error result |
| Anonymous RPC/table probes | Pass | Protected command/service/task-chain/capability RPCs and secure tables rejected anonymous callers |
| Secure cutover probes | Pass | Legacy health/origin helpers and `aitask_app_state` unavailable anonymously |
| Live production RLS/grants | Not verified | No independent authenticated production connection was used |

## 2. Database integrity

- The polymorphic `public.aitask_entities` model is protected by entity-type checks, command preflight, optimistic versions, idempotent receipts, and trigger/RPC validation.
- Real FK chains cover workspace ownership and Auth-member linkage; many business references remain soft JSON/entity references and depend on guards and cleanup logic.
- Unique/idempotency and workspace/row optimistic-lock controls pass the full disposable pgTAP suite.
- The new `public.aitask_entity_history` table has useful indexes, actor snapshots, command correlation, and before/after JSON values.

### Confirmed history migration defect

`20261017113000_audit_value_history.sql` declares:

- `workspace_id ... references public.aitask_workspaces(id) on delete cascade`;
- `actor_member_id ... references public.aitask_members(id) on delete set null`;
- a `before update or delete` trigger that always raises `Entity history is append-only`.

These semantics conflict. Workspace deletion attempts a cascaded history delete; member deletion attempts an FK-maintenance update. Both are rejected by the trigger. The repository’s real local storage/Staff smoke helpers reproduced both failures. This is a **P1 regression** requiring a retention/ownership decision before rollout.

## 3. RLS and authorization

Static review and disposable pgTAP support the following:

- secure application tables have RLS enabled;
- anonymous direct reads and protected RPC execution are denied;
- authenticated writes are routed through guarded command/RPC paths;
- role and workspace scope checks are repeated inside security-sensitive functions;
- storage policies protect the private service-file bucket;
- security-definer functions use an empty search path in the reviewed migration chain;
- the history table is readable only through its Super Admin + MFA policy and has no authenticated write grants.

Live production policy/grant state remains **Unable to Verify** in this review. The committed repair manifest is not sufficient as an independent live check, especially because the current worktree contains three additional untracked migrations beyond its recorded 110-migration state.

## 4. Authentication, sessions, and Edge Functions

- Browser code uses the Supabase publishable/anon-compatible key, not a service-role key.
- Auth/session handling has explicit refresh, expiry, retry, and fail-closed paths in source/unit tests.
- `invite-aitask-member` verifies JWTs and uses server-side service credentials, but email changes and member deletion are compensating multi-step workflows. A failed rollback or Auth-first deletion can leave split state.
- The invite function scans Auth users in pages of 1,000 up to 100,000 users for uniqueness/recovery, which is a scalability risk.
- Edge-function deployment versions/configuration were not independently checked in this review.

## 5. Supabase operational conclusion

The database authorization architecture is strong and the disposable database gate is green. The current tree is nevertheless not production-ready because the new history migration breaks deletion semantics and the release manifest is stale. Correct those issues, rerun pgTAP plus lifecycle tests, reconcile the manifest, and perform an independent live RLS/grants/settings check before release.
