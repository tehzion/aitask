# Customer role parity audit — 2026-10-07

Customer uses the existing `Client` role. This audit checked its delivery actions and dashboard against the recent HOD, Staff, project manager, and Boss fixes.

## Shared behavior already inherited

Client uses the shared workspace session, permission checks, mutation queue, backend freshness controls, and access refresh coordinator. The recent session/access refresh fixes therefore also apply to Client. Customer-specific service and task visibility remains enforced by the scoped portal and existing access rules.

## Gaps fixed

- Delivery feedback and approval failures now offer retry and canonical reload. Retry saves the queued mutation without creating a second comment or decision.
- Exceptions release the saving state. Newer feedback or decision context entered during a slow save survives acknowledgment.
- Approval success feedback appears after persistence acknowledgment. A pending approval keeps its review badge and exposes its pending state.
- Closing with a pending mutation requires confirmation and successful canonical reload. A failed reload retains the dialog and draft.
- Late save and download results are guarded by account/session and component lifetime. They cannot announce success or clear drafts in another account.
- Workspace-wide retry/discard reconciles the delivery form without wiping newer text.
- Service and date filters persist in the URL; date-dependent grouping refreshes at local midnight.
- Current-cycle progress uses the selected Active/Paused plan and a Published/Completed cycle covering today. Past, future, and other-plan cycles remain available in history without becoming current progress.

## Verification

- Added 11 Customer browser regressions covering retry, exception recovery, approval acknowledgment, draft preservation, account switch, canonical reload, external retry, midnight, URL filters, current cycle, and mobile dark-mode closing.
- All 15 browser checks passed, including existing Customer privacy, service isolation, mobile, Chinese localization, and accessibility checks.
- Full unit suite: 459 tests across 68 files passed, including two new approval-toast regressions.
- TypeScript, ESLint, and strict translation audit passed.
- Production build and bundle budgets passed in a clean temporary checkout containing HEAD plus only the Customer source changes. The shared checkout builds successfully but its concurrent uncommitted changes put eager gzip JavaScript 121 bytes above the 307,200-byte cap; the isolated Customer build was 307,181 bytes. No budget was increased and no other chat's edits were changed.

## Live data check and limits

Read-only Supabase inspection confirmed that the configured Client company has a matching company profile. Its scoped portal currently returns zero visible tasks, plans, cycles, deliverables, and comments. Independent aggregate inspection also found zero matching client-visible tasks. The empty portal is consistent with those records; no company mapping or production record was altered.

Nonempty Customer flows and redaction were verified with local fixtures and the existing privacy tests. Live multi-account writes and websocket delivery were not exercised. These changes are local and have not been committed or deployed.

## Follow-up deep dive

The follow-up found and fixed further errors:

- Approval notes above the server's 2,000-character limit previously changed optimistic state before failing persistence. The store now validates before creating a decision; the form retains the complete note for correction.
- Customer feedback previously silently truncated at 2,000 UTF-16 units. Overlong feedback now returns a validation error without changing the task. Valid Unicode feedback is preserved using the server's character count.
- The store now requires a nonblank reason for a rejected decision, matching the form's existing requirement.
- Invalid due dates previously appeared as overdue or matched monthly filters despite displaying no usable date. Classification and filters now use parsed local dates; invalid values appear as undated.
- Malformed or reversed published-cycle dates are excluded from service history. Invalid contract reminders and focus-task due dates no longer reach date formatting.
- Local Customer decisions previously duplicated a notification when the assignee was also the owning project manager. Recipient IDs are now deduplicated across those audiences. Secure-mode notifications remain server-generated.

The validation and duplicate-notification regressions failed before the fixes and passed afterward. The full unit suite passed 479 tests across 69 files, and all 18 Customer browser tests passed (32.5 seconds). TypeScript, ESLint, and strict translations passed. The production build succeeds, but the latest shared checkout still exceeds the eager-JavaScript bundle cap (307,449 bytes gzip versus a 307,200-byte cap; 249 bytes over). This follow-up supersedes the earlier bundle result; no size budget was increased. Live data limits and local/uncommitted status remain as described above.
