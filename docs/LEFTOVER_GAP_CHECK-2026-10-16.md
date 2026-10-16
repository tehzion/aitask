# AiTask — Leftover Gap Check

**Date:** 2026-10-16 · **Branch:** `codex/audit-p0p1-2026-10-16` (HEAD `52ab3b1`, tree clean)
**Purpose:** Verify no audit finding, stale reference, or half-done work remains after the P0/P1 fixes, Phase C, and the DA-01 deep-audit fix.

**Gate:** `pnpm check` ✓ · `pnpm lint` ✓ · `pnpm verify:i18n` ✓ · `pnpm verify:migrations` ✓ (105 non-empty) · `pnpm test` 100 files / 772 tests ✓ · `pnpm build` ✓.

---

## 1. Housekeeping sweep (clean)
- Working tree clean; no uncommitted files.
- **No `TODO`/`FIXME`/`HACK`/`XXX`** markers anywhere in `src`.
- **No stale references** to removed code (`legacySnapshot`, `pages/Projects`, `LegacySnapshotRuntime`, `loadSupabaseSnapshot`/`saveSupabaseSnapshot`, `Project.totalTasks/completedTasks`). The remaining `completedTasks`/`totalTasks` hits are unrelated local variables derived from tasks/clients in `Dashboard.tsx`/`Clients.tsx`.
- Edge-function symbols used by the new results rate-limit all exist (`hashIdentity`, `requestIdentity`, `submitRateLimit`, `submitRateWindowSeconds`, `aitask_consume_feedback_rate_limit`).

## 2. Audit findings — addressed (verified)

| Area | Findings closed |
| --- | --- |
| Deployment prep | OPS-01 — empty migration repaired (231-line migration) + `verify:migrations` guard |
| Client approval | DBG-01, DBG-03, DBG-10, DBG-11, DA-01 |
| Review queues | DBG-02 |
| Service state | DBG-06, DBG-07 |
| Derived/stale data | DBG-04, DBG-05 |
| Notifications | DBG-08 (verified already guarded), DBG-12 |
| Permissions | AUTH-01, AUTH-06 |
| Data/sync layer | SYN-01, SYN-03, SYN-04 |
| Security (code) | SEC-02 |
| Staff UX | UI-01, UI-02 |
| Phase C | C1, C2, C3, C4, C5, C6, C7 |

## 3. Leftover gaps — OPEN

### 3a. Code (deferred, documented as P2/P3)
| ID | What | Severity | Why not fixed |
| --- | --- | --- | --- |
| DBG-09 | Dead `completionPercentage` ternary at `store/index.ts:2333-2337` (overwritten at `:2358`) | Low (cosmetic) | No current bug; removing it has minor progress-history risk |
| AUTH-02 | `/notifications`, `/clients/:clientId`, `/account/password` bypass `RoleRoute` | Medium | `/notifications` is intentionally open; the others self-gate |
| AUTH-03 | Client default permissions exceed curated navigation | Low | Cosmetic (pages self-handle) |
| AUTH-04 | `getDefaultAccessiblePath` can loop for a zero-permission role | Low | Needs for a role with no access at all |
| AUTH-05 | Legacy dept/role strings (`Videoshooting`, `Editor`, `Super Admin`) and split labels | Low | Data-compat risk; normalized at read |
| SYN-02 | Optimistic version truth lives only in the module-level `baseline`, not on store entities | Medium | Architectural; works today, latent drift |
| ARC-01 | 5.9k-line `store/index.ts` monolith | Medium | Architectural |
| ARC-03 | Duplicate predicates (`isTaskCompleted`, `isTaskOpen`, `isTaskLinkedToDeliverable`) | Low | Refactor; no behaviour impact |
| PERF-01/02/03 | Startup near bundle cap; `JSON.stringify` equality; per-render form serialization | Low | Optional |
| DBG-13 | Local demo prices zeroed before secure save | Low | Intentional divergence; needs a doc note |

### 3b. Verification / deployment (blocked or out of scope here)
| ID | Gap | Blocker |
| --- | --- | --- |
| OPS-01 / SEC-02 | Migrations + feedback edge function **not deployed** | `supabase` CLI unauthenticated (`Invalid access token`); no DB password |
| SEC-01 | Live `aitask_app_state` grants / service-role grants unverified | No live project access |
| — | pgTAP DB suite and Playwright e2e not run | No linked Postgres; no browsers |
| — | Deno edge functions not locally type-checked | `deno` not installed |

## 4. Conclusion
The branch contains **no leftover half-done work** and the gate is green. The open items are (a) intentionally deferred P2/P3 polish and architecture work, and (b) the deployment/verification backlog, which is blocked on Supabase credentials. Nothing in section 3a blocks a release of the current fixes; section 3b must be completed before the migrations/RPC changes reach production.
