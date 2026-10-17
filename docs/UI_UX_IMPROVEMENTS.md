# UI/UX Improvements — AiTask

**Date:** 2026-10-17

The codebase already ships a mature design system (`src/components/ui.tsx`), role-aware navigation (`src/lib/navigation.ts`), and centralized feedback (`SystemMessage` + `userFacingMessage`). This phase made **targeted, non-redesign** improvements focused on interaction correctness.

---

## Improvements implemented

| # | Area | Issue | Fix | Files |
| --- | --- | --- | --- | --- |
| 1 | Error feedback | Review-config save failure rendered raw technical error (`t(error)` without classification) | Render via `SystemMessage`; keep raw value so `userFacingMessage` classifies | `TaskReviewSettings.tsx` |
| 2 | Error feedback | Output upload failure rendered raw Storage error | Render via `SystemMessage` | `TaskOutputFiles.tsx` |
| 3 | Error feedback | Client delivery approve/comment errors pre-translated (lost classification) | Store raw; render via `SystemMessage` | `ClientDeliveryFocus.tsx` |
| 4 | Error feedback | File download error pre-translated | Store raw | `ClientServiceWorkspace.tsx` |
| 5 | Error feedback | Activity upload/comment errors pre-translated; cleanup error concatenated raw `error.message` | Store raw; replace concatenation with fixed user-friendly message | `ClientWorkspace.tsx` |
| 6 | Error classification | Storage "Object not found" / "The resource was not found" leaked | Add `errors.fileUnavailable` mapping (en/zh) + test | `userFacingMessage.ts`, `messages.ts`, `userFacingMessage.test.ts` |

## Rationale / rules followed

- Preserved existing architecture (no new dependencies, no redesign).
- Reused `SystemMessage` (the canonical render path) instead of `t()` for error values.
- Kept the `t()` normalization only where the store returns a `MessageDescriptor` (type-required), which `SystemMessage` still handles correctly.
- No new confirmation dialogs, no extra clicks, no removed functionality.

## Verification

| Check | Result |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS |
| `pnpm verify:i18n` | PASS — 0 findings |
| `pnpm test` | PASS — 105 files / **814 tests** (+2 storage-not-found cases) |
| `pnpm build` | PASS — production build + PWA |

No functional, security, or data-integrity regressions were introduced.
