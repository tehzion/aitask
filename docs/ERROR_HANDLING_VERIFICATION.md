# Error Handling & User-Facing Message Verification — AiTask

**Date:** 2026-10-17 · **Branch:** `codex/audit-p0p1-2026-10-16`
**Objective:** ensure no raw technical error reaches users, every message is actionable, and error handling is consistent across all four roles.

---

## 1. Summary of Updated Error Messages

| Scenario | Before (risk) | After |
| --- | --- | --- |
| Storage download of a removed file (`The resource was not found` / `Object not found`) | Leaked raw Supabase message | "This file is no longer available. It may have been removed." (`errors.fileUnavailable`, en/zh) |
| Task review-config save failure (raw `commitPendingMutation` error) | Rendered via `t(error)` → raw `PGRST…`/RLS/network text | Routed through `SystemMessage` → `userFacingMessage` classification |
| Output-file upload failure (raw Storage error) | Rendered via `t(uploadError)` → raw `Failed to fetch`/RLS text | Routed through `SystemMessage` |
| Client delivery approve/comment error | `t(result.error)` pre-translation | Raw value → `SystemMessage` classification + translation |
| Cycle-activity file attach + cleanup failure | Concatenated raw `cleanup.error` into user text | Fixed user-friendly sentence (no raw leak) |

The message catalog already contained friendly, actionable mappings (`errors.permissionDenied`, `errors.connectionUnavailable`, `errors.sessionExpired`, `errors.duplicateRecord`, `errors.linkedRecord`, `errors.invalidData`, `errors.requestFailed`, …). This phase **closed the render gaps** that bypassed the classifier and added one missing file-not-found mapping.

## 2. Affected Modules

| File | Change |
| --- | --- |
| `src/components/TaskReviewSettings.tsx` | Render error via `SystemMessage`; normalize descriptor via `t()` at the save boundary |
| `src/components/TaskOutputFiles.tsx` | Render upload error via `SystemMessage` |
| `src/components/ClientDeliveryFocus.tsx` | Store raw commit/validation errors (render already `SystemMessage`) |
| `src/components/ClientServiceWorkspace.tsx` | Store raw download error (render already `SystemMessage`) |
| `src/pages/ClientWorkspace.tsx` | Store raw upload/comment errors; remove raw `cleanup.error` concatenation |
| `src/lib/userFacingMessage.ts` | Add storage "not found" → `errors.fileUnavailable` mapping |
| `src/lib/messages.ts` | Add `errors.fileUnavailable` (en + zh) |

## 3. Centralised Error-Handling Improvements

The existing architecture is already centralised and was preserved (no new dependencies):

- **`src/lib/userFacingMessage.ts`** — single classifier mapping technical strings (PostgREST `PGRST…`, `23503/23505/23514`, RLS violations, `Failed to fetch`, `JWT expired`, `TypeError`, `SyntaxError`, `[object Object]`, etc.) to `errors.*`/`feedback.*` message descriptors. Descriptors pass through unchanged.
- **`src/components/SystemMessage.tsx`** — canonical render path (`t(userFacingMessage(message))`). Now used for every error surface in scope.
- **`src/lib/messages.ts`** — stable en/zh message IDs with interpolation.
- **`src/lib/actionFeedback.ts`** — "register intent, never success": success toasts only fire after persistence acknowledgement (`applied(saved)`), so **failed operations never show success**.
- **`src/store/useToastStore.ts`** — error/warning toasts render via `SystemMessage`; distinct `alert`/`status` roles and `aria-live`.

The fixes removed the last render sites that used `t(error)` (translation-only, no classification) for values that could carry Supabase/transport errors.

## 4. Supabase Error-Handling Verification

| Error class | Classification | User message (verified) |
| --- | --- | --- |
| Session/JWT expired (`Invalid Refresh Token…`, `JWT expired`, `Auth session missing`) | `errors.sessionExpired` | "Your session expired. Sign in again to continue." |
| RLS / permission (`new row violates row-level security…`, `permission denied for table/function`) | `errors.permissionDenied` | "You do not have permission to make this change. …" |
| Duplicate key (`23505`) | `errors.duplicateRecord` | "A matching record already exists. …" |
| FK violation (`23503`) | `errors.linkedRecord` | "This record is linked to other work. …" |
| Invalid data (`23514`, `invalid input syntax…`) | `errors.invalidData` | "This change could not be accepted. …" |
| Storage not found (`Object not found`, `The resource was not found`) | `errors.fileUnavailable` (new) | "This file is no longer available. …" |
| Network (`Failed to fetch`, `NetworkError`, `Load failed`) | `errors.connectionUnavailable` | "Could not connect to the workspace. …" |
| Internal (`PGRST…`, `Could not find the function…`, `[object Object]`, `TypeError…`) | `errors.requestFailed` | "This action could not be completed. …" |

Verification: `src/lib/userFacingMessage.test.ts` (15 tests) asserts each raw technical string is replaced (the raw string never appears in output) in **both en and zh**. No SQL, schema names, stack traces, or Supabase codes are exposed.

## 5. Four-Role Verification Results

| Role | Error surfaces verified | Result |
| --- | --- | --- |
| Super Admin | Review-config override, upload/download, permission feedback | Pass (source + tests; errors are role-neutral) |
| Project Manager | Review-config save, task edit/assign, company/plan actions | Pass |
| HOD | Review-config, approval, task actions | Pass |
| Staff | Output upload, task status, review-update | Pass |

Messages are role-neutral and permission-aware: restricted actions produce `errors.permissionDenied` ("ask your workspace administrator…") without leaking which records exist or the underlying policy. Live e2e for role-specific surfaces was **not run** (no browsers); the render paths are unit-verified.

## 6. Regression Test Results

| Check | Result |
| --- | --- |
| `pnpm check` (tsc) | PASS |
| `pnpm lint` | PASS |
| `pnpm verify:i18n` | PASS — 0 findings / 170 files |
| `pnpm test` | PASS — **105 files / 814 tests** (+2 new storage-not-found cases) |
| `pnpm build` | PASS — production build + PWA |

No functional, security, or data-integrity regressions observed. The `userFacingMessage` classifier is idempotent for friendly strings (passes them through), so double-processing via `t()` + `SystemMessage` does not corrupt messages.

## 7. Remaining Issues / Limitations

- **Live browser e2e not run** (no browsers in this environment) — the render-path fixes are verified by typecheck + unit tests, not by visual assertion in a browser.
- **No external error-monitoring/APM** (only React `ErrorBoundary` + Vercel/Supabase built-in logs) — technical details are preserved server-side in logs, but there is no alerting pipeline. This is an operational item (see `PRODUCTION_OPERATIONAL_READINESS.md`), not a message-correctness defect.
- **Pre-translation at the `useSaveAction` boundary** (e.g. `t(result.error)` for descriptor-typed store results) remains; it is harmless because the render now classifies via `SystemMessage`, but a technical string that is *already in the zh dictionary* would lose the specific guidance (still user-friendly, never a raw leak).
