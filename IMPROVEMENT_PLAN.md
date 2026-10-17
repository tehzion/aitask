# AiTask Improvement Plan

Audit date: 2026-10-17
Ordering: security and release integrity first, then reliability, performance, and product polish

## P0 — Release gates

### P0.1 Establish authoritative deployment state

Owner: release/platform
Dependency: read-only access to the intended Supabase project

1. Generate a release manifest containing commit, 110 migration hashes, live migration aliases, function versions, policy/grant hashes, Storage configuration, and Auth security settings.
2. Reconcile `HANDOVER.md`, `SUPABASE_HANDOVER.md`, and `DEPLOYMENT_REPORT.md`; mark historical documents superseded.
3. Verify the PM ownership migration and department visibility cleanup are live.
4. Verify Edge Function source/version and environment names without printing values.
5. Store the manifest with the release artifact and make it the only deployment-status authority.

Exit criteria: a reviewer can answer “which authorization code is live?” from one immutable artifact.

### P0.2 Complete cross-company negative authorization suite

Use disposable/staging data only. Cover direct table reads, forged generic commands, service RPCs, Storage paths, client portal projections, notifications, and reviewer evidence.

Exit criteria: PM, HOD, Staff, Client, and zero-permission custom-role identities cannot cross their intended workspace/company/department boundaries; tests assert both denial and absence of side effects.

### P0.3 Close current browser regressions

- Fix deterministic focus transfer when mobile navigation opens.
- Fix ToastContainer/store/portal rendering for the mobile online/PWA overlay flow.
- Stabilize the Playwright web-server lifecycle so a failed local server does not turn remaining tests into connection-refused noise.

Exit criteria: focused accessibility and smoke tests pass twice from a cold server and once after a warm reload.

## P1 — Reliability and account lifecycle

### P1.1 Make Auth/member lifecycle operations durable

Replace the current two-phase email/delete operations with a state machine:

```text
requested -> database intent recorded -> Auth operation -> database finalize
                                      \-> retry/reconcile queue
```

Store operation ID, actor, target, previous/new values, attempts, and last error. Make every step idempotent. Expose pending/failed state to Super Admins and provide a repair action.

### P1.2 Remove full Auth-user scans

Use an indexed, server-side email reservation/identity table or a direct Auth lookup. Keep a unique normalized email constraint in the workspace domain. Preserve command-id idempotency for retries.

### P1.3 Fail closed for hosted reset bypass

Add a production build assertion:

```ts
if (mode === 'production' && buildEnv.VITE_AITASK_ALLOW_PASSWORD_RESET_BYPASS === 'true') {
  throw new Error('Password reset bypass is forbidden in production builds.');
}
```

Also add a CI test that verifies hosted runtime behavior when a malicious/accidental environment value is present.

### P1.4 Add observability for pending work

Track counts and age for pending commands, command receipts, retained member mutations, unresolved uploads, Auth/member reconciliation operations, and retry-required states. Alert on age thresholds rather than only request failures.

## P2 — Performance and maintainability

### P2.1 Split the eager runtime

The current build reports a 540 kB minified `workspaceRuntime` chunk. Move domain-specific stores/actions, reports, service operations, and role-only code behind route or feature imports. Add budgets for the initial shell, authenticated dashboard, and largest lazy chunk.

### P2.2 Reduce polymorphic JSONB integrity risk

Keep the shared entity protocol if desired, but introduce typed validators per `entity_type`, generated columns for high-value query fields, and explicit constraints for task/project/client/cycle ownership. Make the command RPC reject unknown fields and unknown entity-specific shapes.

### P2.3 Review live query plans

Use read-only `EXPLAIN` in a disposable/live-read-only process for:

- workspace entity page reads;
- notification feed search/unread/cursor queries;
- client portal projections;
- service-file authorization predicates;
- command receipt lookup.

Add indexes only from measured plans and row counts.

### P2.4 Tighten browser policy

Replace broad Supabase wildcards with the single project host where possible, document or remove `unsafe-inline`, and remove the third-party avatar host if product requirements allow.

### P2.5 Improve test harness isolation

- Use a unique local port per Playwright worker/run or reserve one port and ensure teardown.
- Fail fast with a clear server-health message if `/login` cannot load.
- Separate fixture/bootstrap failures from product assertions.
- Add a short smoke suite before the 324-test suite.

## P3 — Product and operational improvements

- Add admin UI for unresolved Auth/member/upload reconciliation.
- Add a visible “last verified against backend revision” indicator to support incident diagnosis.
- Add timezone-specific calendar tests around DST and user/workspace timezone changes.
- Add file-name/path Unicode, duplicate-name, cancellation, and 100 MiB boundary tests.
- Add multi-tab conflict tests with explicit stale-tab messaging.
- Add browser tests for network interruption during each CRUD flow, not only generic save recovery.
- Keep release and handover documents generated from the same manifest to prevent drift.

## Suggested execution sequence

1. P0 deployment manifest and live read-only verification.
2. P0 browser focus/toast fixes and cold/warm focused reruns.
3. P1 Auth/member durable lifecycle design and tests.
4. P0 disposable Supabase negative authorization suite.
5. P2 chunk/query/policy improvements.
6. Full static, unit, browser, database, build, and release-provenance gates.

No implementation was performed during this audit because the request explicitly required findings before fixes.
