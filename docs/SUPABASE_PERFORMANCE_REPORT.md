# Supabase Performance Report — AiTask

**Date:** 2026-10-17 · **Static analysis only** (no live `EXPLAIN ANALYZE`; live DB not accessible this session).

## 1. Query profile

| Operation | Access pattern | Efficiency |
| --- | --- | --- |
| Workspace load | `aitask_members` + `aitask_entities` paged at 500 rows/page; notification feed reconstructed separately | OK at current scale |
| Notification feed | cursor-paginated (`NotificationFeedPage.nextCursor`) | PASS |
| Task/project/client lists | filtered in-app over the in-memory canonical workspace (single load) | Avoids per-row queries |
| Feedback results | indexed `(campaign, submitted_at desc)` | PASS |
| Search/filter/sort | client-side over canonical state (no N+1) | PASS |
| RLS predicate | `private.aitask_*` helpers indexed via `workspace_id` leading columns | OK |

## 2. Index coverage

- Hot-path indexes present (members workspace/auth; entities type/client/assignee/creator/parent + client_id/plan_id/cycle_id; feedback campaign/time/role; audit events).
- No missing index identified in static review; no obviously redundant index.

## 3. Identified inefficiencies (non-blocking)

| ID | Finding | Severity | Note |
| --- | --- | --- | --- |
| PERF-1 | Entire workspace loaded into memory; 15 s polling continues even when tab hidden | P3 | Growth risk for very large tenants; `visibilitychange` already reconciles reminders, not the poll |
| PERF-2 | `workspaceStatesEqual` uses order-sensitive `JSON.stringify` | P3 | Correctness-safe, micro-inefficient |
| PERF-3 | `useRecoverableForm` serializes the whole form each render | P3 | Draft persistence |
| — | Eager bundle near 300 KiB gzip cap | P3 | Measured ~295.6 KiB; under budget |

## 4. Dashboard query tracing

- Dashboards read canonical selectors over the in-memory workspace (`dashboardData.ts`, `staffDashboard.ts`, `pmDashboard.ts`, `clientPortal.ts`); no per-metric DB round-trip; consistent definitions across roles.
- No repeated/unbounded dashboard queries.

## 5. Verdict

Query profile is efficient for current scale (174 tasks / 226 service entities). No missing index or N+1 was found. The only recommendations are P3 scalability items; **no premature optimization applied**. Live `pg_stat_statements`/`EXPLAIN ANALYZE` verification remains recommended at next deploy.
