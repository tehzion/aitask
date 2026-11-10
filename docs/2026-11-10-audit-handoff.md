# AiTask audit handoff: open gaps

As of 10 Nov 2026. For whoever runs the next deep audit and research pass (a person or an agent).

**Update 10 Nov (later):** PR #16 is merged and live; the click-savers, save-stability, gap-fix and role UX work ships in the next PR, and the telemetry table is on live (collection off until the flag is set). Status per gap is in the register below.

**Bottom line (original):** the team-feedback fixes and the save-stability work are built and tested locally, but none of the frontend changes were live yet. The biggest unknown is what errors real users hit in the browser: the server logs show no failed saves in the last 72 hours, and the app sent no client-side error telemetry.

---

## 1. Where each change stands

| Change | Where it is | Live? |
|---|---|---|
| R1–R3 database migrations (PM review for every project, HOD delegation, delete guards) | Applied to live Supabase `ohjhwyiffgzyatcmmdql`, history through `20261109141920_r3_s1_project_approval_pm` | Yes (database only) |
| Team-feedback frontend: month housekeeping, shared work counts, name corrections, faster saves, PM review everywhere | PR [tehzion/aitask#16](https://github.com/tehzion/aitask/pull/16), branch `codex/team-feedback-r1-20261109`, head `745fcc0` | **No.** PR open. `verify` and `database` are green; `verify-staging` is red (broken secret) |
| Click reduction items 1–5: act from the list, bulk month decisions, suggested links, remembered Create task choices | Branch `codex/click-savers-20261110`, **uncommitted** | No |
| Save stability: no "Retry my changes" for dropped connections | Same branch, uncommitted | No |
| Staffing gaps panel for the Boss | Same branch, uncommitted | No |
| Item 6: quantity/price corrections with Y.L approval | Not started | No |
| Click item 7: daily digest | Not started, waiting for Y.L approval | No |

Production `master` is at `77ea96b`. **The live frontend is therefore older than the live database.** Audit item A1 below checks that this mismatch causes no errors.

---

## 2. Gap register

Risk: **H** = users hit errors or lose work · **M** = wrong or stale information, or blocked work · **L** = polish or housekeeping.

| ID | Area | Gap | Evidence | Risk | Next step | Owner |
|---|---|---|---|---|---|---|
| G1 | Release | PR #16 not merged; live frontend is older than the live database | `gh pr view 16`: OPEN, checks green except `verify-staging` | H | **Done 10 Nov:** PR #16 merged (4874dda) and deployed. | Repo admin |
| G2 | Release | Click-saver and stability work is uncommitted on a local branch | `git status` on `codex/click-savers-20261110` | H | **Done 10 Nov:** committed and shipped in the click-savers PR. | Dev |
| G3 | CI | `verify-staging` fails on every PR | `STAGING_VERCEL_TOKEN` secret is invalid | M | Recreate the secret in GitHub repo settings | Repo admin |
| G4 | Observability | No client-side error telemetry, so the banners users saw cannot be measured | Server `edge_logs`/`postgres_logs`, last 72 h: no failed saves (only expected 401s from the security check) | **H for the audit** | **Done 10 Nov:** `aitask_client_events` applied to live (`20261109193707`); collection turned on in Vercel production 10 Nov (`VITE_AITASK_CLIENT_TELEMETRY=true`, redeploy `aitask-fhayk2gjk`). | Dev |
| G5 | Saves | A save still being resent after 8 s is reported to the form as done (`queued`). If the server later **rejects** it, the banner appears after the form has closed | `commitPendingMutation` returns `{ ok: true, queued: true }` | M | **Done 10 Nov:** if a save the form was told is queued is later refused, a toast says so and the banner explains. | Dev + PM |
| G6 | Saves | A server that keeps answering "retry" (not a network fault) means "Still saving…" forever, with no escalation | `scheduleAutomaticRecovery` has no attempt limit for transient codes | M | **Done 10 Nov:** after 5 min the note reads "Still not saved. Keep this tab open; it keeps trying." | Dev |
| G7 | Saves | Background refresh failures are now silent, so data can go stale without anyone noticing | `pullBackendNow` silent catch | M | **Done 10 Nov:** after a failed background refresh, the status shows "Last updated N min ago" with Refresh once data is 5+ min old. | Dev |
| G8 | Saves | Real conflicts (two people edit the same field) still show "Retry my changes", by design | `isMergeableConflict` | L–M | Use telemetry (G4) to measure how often; check the same user in two tabs | Dev |
| G9 | Offline | New edits are blocked while offline; only saves already in flight survive | Offline test: quick actions disappear while offline | L | Product decision: keep, or support offline edits | PM |
| G10 | Code loading | Only 3 save modules are preloaded. Other lazy modules (notifications, client portal, release notices, reports) still fail for the rest of the page's life if first used offline | Browser module cache keeps failed dynamic imports; `src/lib/chunkRecovery.ts` covers only some cases | M | **Done 10 Nov:** the remaining everyday lazy modules are fetched 3 s after the workspace loads. | Dev |
| G11 | Tests | The real-Supabase scenario tests (lost reply, 20 s outage, offline, Staff list actions, timings) live in a scratch folder, not in the repo or CI | `localdb.spec.ts` outside the repo | H | **Partly done:** specs are in `e2e/localdb/` (run against a local Supabase, see its README). No CI job yet: it needs a Supabase stack in CI. | Dev |
| G12 | Tests | The full e2e suite is flaky under load (accessibility, app-smoke, responsive-audit, tutorial pass when run alone) | Local 2-shard runs | M | Quarantine or stabilise; check CI retry counts | Dev |
| G13 | Performance | Eager JS bundle is 270 KiB gzip against a 300 KiB cap | `scripts/verify-bundle-size.mjs` | L | Keep new copy in `pageCopy.ts`; watch the headroom | Dev |
| G14 | i18n | New Chinese strings (click reduction, staffing gaps, save messages) were written without native review | `src/lib/pageCopy.ts`, `src/lib/i18n.ts` | L | Native-speaker review | Team |
| G15 | People | Video Shooting has **0 Staff**; 16 of Mabel's 27 active projects have no Staff; she has 7 open tasks waiting on her to assign | Live read-only SQL, 10 Nov | M | **Tooling done:** Staffing gaps rows now open Members filtered to that department, with pending sign-ups first. Adding Staff is still a people task. | Y.L / PMs |
| G16 | People | 16 active projects have no HOD (accepted: the PM assigns directly) | Live read-only SQL, 10 Nov | L | The staffing gaps panel now lists them | Y.L |
| G17 | Live repro | Mabel's "HOD can't assign / Staff can't send for review" case has not been rerun on live | Needs her own sign-in | M | User signs in as Mabel: assign a Video Editor task to a Staff member, then Staff sends it for review | User |
| G18 | Data | 18 never-published and 9 overdue months were left to PMs | User decision, 9 Nov | L | The Months to tidy up panel (unshipped) lets PMs clear them in bulk | PMs |
| G19 | Feature | Item 6: quantity/price corrections approved by Y.L | Not built; needs a server command, a migration and an approval flow | M | Write a spec and agree the approval rules first | PM + Dev |
| G20 | Feature | Click item 7: daily digest | Waiting for Y.L approval | L | Approval first | Y.L |
| G21 | Security | Live passwords for two accounts were pasted into a chat on 10 Nov | Chat transcript | H | Both people change their passwords | Account owners |
| G22 | Housekeeping | Backup tables `private.r3_backup_20261109_*` are kept on live | R3 migration | L | Drop after 9 Dec 2026 | Dev |

---

## 3. Save reliability: how it works now (branch `codex/click-savers-20261110`)

| Failure | What the user sees | What the app does | Code |
|---|---|---|---|
| Connection drops or the server is slow | "Saving…", then after 3 attempts "Still saving. Your change is kept on this device." | Resends after 1, 3, 6, 10, 15, then every 30 s, with no limit. Edits stay allowed and are saved after it | `automaticRecoveryPolicy`, `scheduleAutomaticRecovery` in `src/store/index.ts` |
| Browser goes offline mid-save | "No connection. Your change is kept and will save when you are back online." | Resends as soon as the `online` event fires, or the tab becomes visible | `installAutomaticRecoveryListeners` |
| A save is still being resent after 8 s | The form closes normally | `commitPendingMutation` returns `queued: true` | `waitForSyncIdleOrQueued` |
| Page reloaded with a change still waiting | "Saving…" | Resends the kept change by itself (it used to ask "Review and retry") | `resendRestoredChange` |
| First save of the session made offline | Previously every retry failed until reload | Save modules are preloaded when the workspace loads | `preloadSaveModules` in `src/lib/secureWorkspace.ts` |
| Capability check fails because of the network | Previously "The workspace needs a system update" | Treated as a connection problem | `isConnectionFailure` in `src/lib/secureBackendCapabilities.ts` |
| Background refresh fails (after a save, on a timer, on focus) | Previously a "connection needs attention" or retry banner | Nothing; it retries on the next cycle. A Refresh the user clicks still shows errors | `pullBackendNow` catch, `options.silent` |
| Someone else changed **other** fields | Nothing | Merged automatically, up to 3 times | `isMergeableConflict` |
| Someone else changed the **same** field | "Retry my changes" / "Restore saved data" | The user decides | unchanged |
| Server refuses (permission, validation, not found) | "Restore saved data" | Kept change is dropped after the user restores | unchanged |

**Verified locally on a real Supabase stack (10 Nov):** a 20 s outage saved 3.5 s after the connection returned; going offline mid-save saved within 3 s of reconnecting; a lost reply was resent with no duplicate; no retry, conflict or "needs attention" banner appeared in any of the 8 scenarios. Unit tests: 1084 pass.

---

## 4. Audit brief

Answer each question with evidence (a test, a log query, or a measured timing). Highest value first.

1. **What do users actually hit?** (G4) Add client telemetry, ship it, and collect a week of real banner and failure counts by type, role and device. Without this, every other answer is a guess.
2. **Old frontend + new database.** (A1, G1) Until PR #16 is live, can the current production frontend still create tasks, change status and send for review against the R3 server rules? Check the live `aitask_command_receipts` for rejected commands since 9 Nov.
3. **No duplicates under replay.** For every command type, including service commands, member mutations and file uploads, confirm a resent command is applied once. Start from `src/lib/secureCommandBatch.ts` and the server receipts table.
4. **Queued edits with a different command type.** An edit made while an earlier save is still being resent is saved under the earlier command type. Confirm the server accepts mixed service and generic operations (`partitionOperationsForRpc`).
5. **Session expiry during an outage.** If the access token expires while offline, does recovery end in FORBIDDEN and "Restore saved data" (losing the change) instead of refreshing the session?
6. **Long outages and sleeping tabs.** Mobile Safari and Chrome throttle timers in background tabs. Check a 30-minute outage and a phone locked for an hour.
7. **Deploy mid-session.** After a new Vercel deploy, do old tabs fail to load chunks? Check `chunkRecovery.ts` and the PWA service worker update path.
8. **Two tabs, same user.** The kept command is stored per user in browser storage. What happens when both tabs try to resend it?
9. **Live performance.** Measure save and load times on production data (747 notifications, 121 deliverables, 53 tasks) on a mid-range phone.
10. **Permissions on live.** Rerun Mabel's case (G17) and a Staff send-for-review on a PM-review project.
11. **New panels on a phone.** Check Months to tidy up and Staffing gaps at 375 px, with a screen reader and in dark mode.

**Method:**
- Run a local stack with fault injection: Playwright `page.route` aborts, `context.setOffline`, and CPU/network throttling.
- Run read-only SQL and log queries on live.
- Never write to live without approval.
- Never type real passwords into the live site; use the local QA accounts.

---

## 5. How to run it locally

```bash
pnpm exec supabase start -x studio,imgproxy,inbucket,mailpit,edge-runtime,logflare,vector,supavisor,storage-api,postgres-meta
```

- Database: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. API: `http://127.0.0.1:54321`.
- Dev server against the local stack: `VITE_AITASK_BACKEND=supabase`, `VITE_SUPABASE_URL=http://127.0.0.1:54321`, plus the local publishable key, then run Vite on port 4320.
- QA accounts: `boss@local.test`, `pm@local.test`, `hod@local.test`, `staff@local.test`. Their local-only test password is in the local seed.
- **Restart the dev server after editing `src/store/index.ts`.** After hot reload, `import('/src/store/index.ts')` in a test returns a fresh store, not the app's, so state checks pass falsely.
- Gate: `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm verify:bundle`, `pnpm exec playwright test` (2 shards × 2 workers locally; rerun failures alone).

## Sources

- Plan and decisions: `docs/2026-11-09-team-feedback-redesign-plan.md`
- Save recovery: `src/store/index.ts`, `src/lib/secureWorkspace.ts`, `src/lib/secureCommandBatch.ts`, `src/lib/secureBackendCapabilities.ts`
- Tests: `src/store/mixedSaveRecovery.test.ts`, `src/store/sessionIntegrity.test.ts`, `e2e/click-reduction.spec.ts`, `e2e/staffing-gaps.spec.ts`
- Live checks (read-only, 10 Nov 2026): Supabase logs (`edge_logs`, `postgres_logs`, last 72 h) and SQL on `aitask_members` and `aitask_entities`
