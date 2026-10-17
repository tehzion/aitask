# UI/UX regression report

**Review date:** 2026-10-17 (Asia/Kuala Lumpur)  
**Environment:** macOS, Node 22.23.2, pnpm 10.4.1, local workspace runtime.  
**Data/deployment safety:** no production data, Supabase policy, or deployment was modified.

## Current-turn checks

| Check | Command / method | Result | Notes |
| --- | --- | --- | --- |
| Type check | `pnpm check` | Pass | Completed with no diagnostics in the current workspace run. |
| ESLint | `pnpm lint` | Pass | Completed with no diagnostics in the current workspace run. |
| i18n coverage | `pnpm verify:i18n` | Pass | 0 findings across 171 source files. |
| Focused credential test | `pnpm exec vitest run src/lib/localCredentials.test.ts --maxWorkers=1 --reporter=verbose` | Pass | 1 file, 5 tests passed; confirms the earlier concurrent PBKDF2 failure was not reproduced in isolation. |
| Full unit suite | `pnpm exec vitest run src --maxWorkers=1 --reporter=dot` | Pass | 106 files, 818 tests passed in a serialized run. An earlier concurrent run surfaced timing-sensitive failures; isolated reruns of the affected files also passed. |
| Browser role audit | `pnpm exec playwright test e2e/responsive-audit.spec.ts --project=desktop-chrome` | Not Verified | The full matrix is intentionally not counted as complete; it is a large 5-role × 4-mobile-viewport route sweep and exceeded the local runner budget. |
| Focused browser access test | same file with `--grep "keeps approvals Boss-only"` | Pass | 1 test passed in 28.3s on the warmed local runner. It verified Project Manager approval restriction and HOD department-work copy/search. |
| Focused password setup responsive test | same file with `--grep "password setup gate"` | Pass | 1 test passed in 11.6s across 320px, 390px dark/Chinese, and phone-landscape scenarios. |
| Production build | `pnpm build` | Pass | TypeScript and Vite/PWA build completed; Vite emitted existing chunk-size and stale `caniuse-lite` warnings only. |
| Live Supabase/RLS checks | `pnpm verify:supabase*`, pgTAP, authenticated production probes | Not Verified | Requires linked/live credentials and deployment approval. |

## Prior repository evidence (not re-executed here)

The repository already includes evidence of:

- a responsive route matrix for Boss Koo, Project Manager, HOD, Staff, and Client across mobile/desktop/tablet/landscape, themes, locale, reduced motion, and Axe checks;
- Staff upload/save recovery and midnight date-refresh regression coverage;
- notification popup/read/badge/destination behavior;
- dashboard follow-through and role-specific landing content;
- passing typecheck, lint, unit, build, i18n, and PWA checks in earlier reports.

Those records are useful evidence of the existing product baseline but are not counted as current-turn execution.

## Role regression matrix

| Role | Primary current-turn browser coverage | Source/test evidence | Current status |
| --- | --- | --- | --- |
| Super Admin | Login, dashboard, tasks, approvals, notifications, settings | `App.tsx`, `navigation.ts`, `access.ts`, approval/unit/e2e specs | Not Verified live in this turn |
| Project Manager | Login, portfolio dashboard, tasks, delivery, reports, notifications | portfolio scoping tests, dashboard audit, responsive audit | Not Verified live in this turn |
| HOD | Department dashboard/tasks, calendar, delivery, reports, notifications | HOD permission/review tests and responsive audit | Not Verified live in this turn |
| Staff | My work, tasks, calendar, output submission, notifications | Staff deep audit, recovery tests, task permission tests | Not Verified live in this turn |

## New patch verification

The following changes are source-verified and type/lint/build-compatible in the current workspace:

- `Button` applies `disabled:cursor-wait` when `aria-busy` is present.
- `ConfirmDialog` exposes `aria-busy` on the confirm action while `busy`.
- `Toast` uses an atomic live region and hides decorative icons.
- Toast timing is differentiated by severity and duplicate messages are suppressed.
- Modal draft capture ignores common non-draft controls.
- Upload cleanup and invalid delivery-link removal use `ConfirmDialog`.

The next clean browser run should assert these behaviors through accessible queries rather than implementation selectors. The existing React guidance in the local UI/UX skill also recommends behavior-oriented queries such as `getByRole` and `getByLabelText`.

## Release decision

**UX implementation:** conditionally ready.  
**Full regression sign-off:** conditionally complete for source, unit, lint, build, and i18n checks; live browser and Supabase/RLS verification remain outstanding.

Before deployment, run the existing responsive/accessibility matrix against a warmed preview. Keep the two pending Supabase migrations and live authorization checks behind the existing approval/preflight gate.
