# UI message audit — 13 October 2026

The fixes are local and have not been deployed by this audit. Other ongoing client/privacy and task-readiness work was preserved.

## Findings and fixes

| Finding | Result |
| --- | --- |
| “Use latest” sounded like a software update | Shared recovery actions now say **Restore saved data**. Revision refresh says **Reload saved data**. Calendar retains its specific **Restore saved dates** action. Chinese wording refers to saved data. |
| Workspace freshness and software refresh sounded alike | Workspace notices say **New saved data available**; the PWA notice says **App update available**. |
| English errors appeared inside Chinese forms | A shared `SystemMessage` renderer localizes 52 inline feedback areas, plus error/warning toasts. It covers task, company, plan, account, registration, notification, feedback and service editor messages. |
| Transport/database details could appear in normal UI | Known network, session, row-security, database constraint, JSON and runtime errors become localized messages with a next step. Structured errors cannot render as `[object Object]`. Application validation remains specific; underlying error codes and recovery behavior are unchanged. |
| Sync conflicts displayed internal identifiers/field names | The notice describes a changed saved record and labels recognized fields such as Due date and Output link. Unknown internal keys are omitted. |
| Compatibility notices promised an automatic update “for a moment” | The notice explains that a workspace update is required and directs the user to their administrator. It makes no promise about completion time. |
| Crash recovery exposed runtime details and implied unsaved work was safe | The fallback shows reload guidance and warns that unsaved changes may need re-entry. Runtime diagnostics remain available to the existing diagnostic event. |

The pictured permission denial remains an error condition. Its message is now localized and explains access review and date recovery; this audit does not grant permissions or hide genuine authorization failures.

## Coverage and evidence

- **24 new browser cases passed**: accessible-page navigation for Boss Koo, HOD, Project Manager, Staff and Client in English/light/desktop and Chinese/dark/mobile, plus Calendar network/permission recovery, error toasts, Full edit failures, software-update notices, readable conflicts and crash recovery in both languages.
- **75 distinct existing recovery cases verified** across administrator approvals, client review, creation, deletion/ownership, localization, service catalog, Staff date/Full edit recovery and Staff save recovery. The isolated combined run passed 73. Two stale fixtures were corrected to the current workflow and passed their focused reruns: clients review HOD-approved work, and Staff submit for approval instead of confirming final completion. No application permissions were relaxed.
- **99 distinct browser cases verified in total**. New probes also confirmed that user-entered text resembling an error remains unchanged.
- **594 unit tests across 82 files passed**, including error-formatting, translation/catalog and secure-workspace checks.
- Before committing, the independently exported UI-only staged snapshot passed TypeScript and **582 unit tests across 82 files**, with the separate privacy/readiness changes excluded.
- TypeScript, ESLint and strict translation coverage passed. The translation audit reported **zero findings across 145 source files**.
- Production build, bundle budgets and static PWA verification passed. Eager JavaScript measured **295.6 KiB gzip**, below the existing 300 KiB limit.
- The corrected Chinese permission-recovery dialog was inspected visually in light and dark themes.

Browser tests use local demo data and controlled failure injection. A separate immutable workspace copy and Vite cache were used for final recovery verification after shared-runtime interference affected the initial broad run. No authenticated production session or production writes are claimed.

## Main implementation

- `src/components/SystemMessage.tsx` and `src/lib/userFacingMessage.ts`: shared presentation of application feedback.
- `src/lib/messages.ts` and `src/lib/i18n.ts`: localized recovery, compatibility, configuration and conflict copy.
- `src/components/BackendFreshness.tsx`, `Layout.tsx`, `ErrorBoundary.tsx`, `Toast.tsx` and `src/App.tsx`: shared notices and fallback states.
- `e2e/ui-message-audit.spec.ts`, its test-only probe fixture, and `src/lib/userFacingMessage.test.ts`: regression coverage.
