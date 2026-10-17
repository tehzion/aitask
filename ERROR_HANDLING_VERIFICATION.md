# Error Handling Verification

**Date:** 2026-10-17
**Scope:** System-wide user-facing messages, error classification, Supabase transport boundaries, realtime feedback, and role-aware browser verification.

## Outcome

User-facing system feedback now passes through a shared safety boundary. Technical transport, database, authentication, storage, runtime, and realtime failures are classified into concise, actionable messages. Existing product validation and workflow guidance remain intact, and diagnostic details are kept out of rendered UI.

## Centralised improvements

- `src/lib/userFacingMessage.ts` now classifies error objects by status, Supabase/Postgres code, and technical message patterns.
- `userFacingText()` provides safe English strings for non-React service and store layers without rewriting already user-friendly validation copy.
- `SystemMessage`, `Toast`, and the `I18nProvider` all use the same presentation boundary, covering direct translator calls and toast content.
- Edge Function, RPC, notification, member-management, password-setup, release-notice, storage, and file-upload/download paths no longer return raw technical messages to UI state.
- Realtime channel errors (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) show a deduplicated warning that live updates are temporarily unavailable while normal refresh continues.
- Existing toast duplicate suppression and persistence acknowledgement remain in place, so success feedback is emitted only after a confirmed save.

## Classification coverage

| Technical condition | User-facing result |
| --- | --- |
| Failed fetch, network loss | Check the connection and try again |
| Expired/invalid refresh token or JWT | Sign in again to continue |
| HTTP 403, `42501`, RLS/permission denial | Permission guidance; no table or policy name |
| HTTP 404, `PGRST116`, missing record | Information may have been removed or is no longer available |
| `23505` / duplicate key | Matching record already exists |
| `23503` / foreign-key dependency | Record is linked to other work |
| `23514`, invalid syntax, check/not-null violations | Review the fields and try again |
| Storage object missing | File is no longer available |
| Upload/attach/storage failure | Upload or attachment could not be completed |
| Timeout / HTTP 408 or 504 | Request took too long; retry |
| HTTP 429 / rate limit | Wait briefly and try again |
| RPC/PostgREST/runtime/5xx failure | Action could not be completed; retry or contact an administrator |

User-authored names, task titles, notes, and valid application validation messages are not translated or replaced by this classifier.

## Affected modules

- Message catalog and presentation: `src/lib/messages.ts`, `src/lib/userFacingMessage.ts`, `src/components/SystemMessage.tsx`, `src/components/I18nProvider.tsx`, `src/components/Toast.tsx`
- Secure Supabase boundaries: `src/lib/secureWorkspace.ts`, `src/lib/secureMemberMutations.ts`, `src/lib/secureNotifications.ts`, `src/lib/securePasswordSetup.ts`, `src/lib/secureReleaseNotices.ts`, `src/lib/secureReleaseNoticeResponse.ts`
- File and save recovery: `src/lib/serviceFiles.ts`, `src/lib/taskOutputUpload.ts`, `src/hooks/useSaveAction.ts`, `src/store/index.ts`
- Realtime feedback: `src/lib/supabaseClient.ts`, `src/lib/supabaseRealtime.test.ts`
- Regression fixtures and classification tests: `src/lib/userFacingMessage.test.ts`, `src/lib/serviceFileIntegrity.test.ts`, `e2e/ui-message-audit.spec.ts`

## Four-role verification

The browser message audit passed for each internal role in both English and Simplified Chinese:

- Super Admin / Boss: 2 locale route matrices passed.
- Project Manager: 2 locale route matrices passed.
- HOD: 2 locale route matrices passed.
- Staff: 2 locale route matrices passed.

The Client portal was also included and passed in both locales. The same run verified network failure recovery, permission denial recovery, duplicate/database rejection, conflict recovery, software-update feedback, and render-crash recovery without exposing technical strings.

## Regression evidence

- `pnpm check` — pass.
- `pnpm lint` — pass.
- `pnpm test -- --maxWorkers=1 --testTimeout=15000 --reporter=dot` — **107 files, 830 tests passed**.
- `pnpm build` — pass. Existing warnings remain for stale Browserslist data and large generated chunks.
- `pnpm exec playwright test e2e/ui-message-audit.spec.ts` — **24/24 passed**.
- Focused error/Supabase/realtime tests — passed.
- `pnpm verify:i18n:strict` — pass; 0 findings across 171 source files.
- `git diff --check` for changed implementation and test files — pass.

An initial default-timeout full-suite run recorded one known slow password-hash timeout under the full serialized suite. The test passed in isolation, and the complete final suite passed with a 15-second timeout; no product assertion failed.

## Supabase verification

Static and local Supabase-related coverage passed for error classification, secure command retry identity, storage/upload recovery, realtime subscription filters, realtime failure callbacks, permission classification, and message redaction.

The repository command `pnpm verify:supabase` was not used as a production verification gate. In this environment it failed before receiving a response, and its implementation includes authenticated remote probes plus a POST write probe. Running that against production would conflict with the instruction not to modify production data without approval. A staging project with explicit test credentials and approval is still required for live RLS, Storage, Realtime, Edge Function, and session-expiry verification.

## Remaining limitations

1. No live Supabase project was mutated or used for authenticated integration testing in this pass.
2. Remote RLS, Storage policy, Realtime delivery, Edge Function, and expired-session behavior require an approved staging environment.
3. Existing build warnings for Browserslist freshness and large chunks remain outside this error-handling scope.
4. Existing unrelated worktree changes were preserved and not folded into this implementation.

No production data, schema, policy, or deployment was changed by this work.
