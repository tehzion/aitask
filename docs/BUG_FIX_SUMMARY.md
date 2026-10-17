# Bug Fix Summary — AiTask (multi-role remediation)

**Date:** 2026-10-17 · Branch `codex/audit-p0p1-2026-10-16` (HEAD `7ac0b25`)

## Fixes implemented this phase

| Issue | Root Cause | Fix | Verification | Status |
| --- | --- | --- | --- | --- |
| **AUTH-04** — zero-permission role caused an infinite redirect loop | `getDefaultAccessiblePath` terminal fallback returned `'/'`, which `RoleRoute` denies for a role with no permissions; `AccessDenied` then links back to `'/'` | Fallback changed to `'/notifications'` (always-accessible, unguarded route) | `access.test.ts` new case; `pnpm test` 812 pass; `pnpm check`/`lint` green | **Fixed** |

## Fixes confirmed present (landed in prior commits; verified this phase)

| Issue | Fix | Evidence | Status |
| --- | --- | --- | --- |
| Staff output upload abandoned on sheet close (UI-01) | `TaskOutputFiles.onUploadStateChange` wired into `StaffTaskFocus` exit/close guards | `StaffTaskFocus.tsx:76,96,159,197-227,272,310`; `SideSheet.tsx:24,27` | Verified fixed |
| Staff "All work" dates stale across midnight (UI-02) | `useLocalToday()` subscription | `StaffAllWork.tsx:102` | Verified fixed |
| Review-update request missed HOD task contact | `resolveTaskUpdateRecipientIds` adds task contact when it can view the task | `store/index.ts:668-671` | Verified fixed |
| Completion auto-approves client (DBG-01) | keep `clientApprovalStatus='Pending'` for client-visible; DB trigger aligned | `store/index.ts:2394,2870`; `client_visible_completion_review.sql` | Verified fixed |
| "Awaiting client review" 3 ways (DBG-02) | canonical `isAwaitingClientReview`/`isAwaitingInternalReview` | `clientPortal.ts:36-42` | Verified fixed |
| Client approval reopens Completed (DBG-03) | `preserveCompletion` in `reviewClientApproval` | `store/index.ts:3032-3054` | Verified fixed |
| Service cycle/plan impossible transitions (DBG-06/07) | transition table + all-delivered gate + DB trigger | `store/index.ts:579-584,4245-4271`; `service_transition_guard.sql` | Verified fixed |
| Non-grantable permission checkboxes (AUTH-01) | `getGrantablePermissionGroups` + `sanitizeRolePermissions` | `access.ts:132-209` | Verified fixed |
| Feedback results unthrottled (SEC-02) | rate limit on results branch | `aitask-feedback/index.ts:209-225` | Verified fixed (source) |
| PM cross-company injection | `pm_client_scope_and_ownership.sql` | migration + pgTAP | **Fixed in source; NOT applied to production** |
| Department-scoped visibility leak | `department_scoped_visibility_cleanup.sql` | migration | **Fixed in source; NOT applied to production** |

## Not fixable in code (require approval / decision)

| Item | Why |
| --- | --- |
| Apply the 2 pending migrations | Requires deployment approval + preflight/backup gate |
| ~~Client-approval ordering policy (`fca797f`)~~ **SIGNED OFF 2026-10-17** | Resolved |
| Push 3 local commits | Git operation; not performed without owner instruction |

## Regression safety

No regressions introduced. Full gate green: `check` ✓ · `lint` ✓ · `verify:i18n` 0 findings · `verify:migrations` 109 non-empty · `test` **105 files / 812 tests** ✓ · `build` + PWA ✓.
