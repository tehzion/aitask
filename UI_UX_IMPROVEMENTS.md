# UI/UX improvements

**Review date:** 2026-10-17  
**Design direction:** preserve the existing Calm Operations visual language; improve interaction clarity and accessibility without introducing a new design system.

## Implemented in this review

### Shared busy-action feedback — P2

Files:

- `src/components/ui.tsx:33-48`
- `src/components/ConfirmDialog.tsx:46-50`

Change:

- The shared `Button` primitive reads its `aria-busy` state and applies a wait cursor while the action is disabled.
- Confirmation actions now pass `aria-busy={busy}` while an async destructive or consequential action is in flight.

User benefit:

- The visual cursor confirms that a click is being processed instead of merely unavailable.
- Assistive technology can distinguish “busy processing” from an ordinary disabled control.
- The existing duplicate-submit prevention and “Saving…” copy remain unchanged.

### Atomic toast announcements — P2

File: `src/components/Toast.tsx:28-46`

Change:

- Toasts now set `aria-atomic="true"` so the message is announced as one complete unit.
- Status/error icons and the dismiss icon are explicitly decorative.

User benefit:

- Screen readers receive the meaningful feedback message rather than separate decorative glyph output.
- Success, warning, info, and error toasts keep their existing live-region urgency and dismissal behavior.

### Action lifecycle consistency — P2

Files:

- `src/store/useToastStore.ts`
- `src/components/ModalShell.tsx`
- `src/components/UploadRecoveryPanel.tsx`
- `src/components/DeliveryReviewPanel.tsx`

Change:

- Feedback duration now reflects urgency: errors remain visible longest, while repeated identical messages are refreshed instead of stacked.
- Shared modal click handling ignores common non-draft controls, preventing false “discard unsaved changes” prompts when the user cancels, closes, goes back, or restores a draft.
- Upload cleanup and invalid delivery-link removal use the shared accessible confirmation dialog, keep the dialog busy while work is in flight, and preserve the recovery action on failure.

User benefit:

- Users have enough time to read failures and do not get duplicate completion noise.
- Cancel and recovery actions behave as labeled, without creating misleading dirty state.
- Consequential actions have consistent focus management, busy feedback, and retry-preserving failure behavior.

## Existing strengths intentionally preserved

The implementation continues to reuse the current components and behavior:

- `ModalShell` owns focus trapping, Escape handling, inert background content, body-scroll locking, and focus restoration.
- `Layout` owns the skip link, route-change focus, responsive navigation, sync banners, and global toasts.
- `uiTokens.ts` provides the shared 44px control height, focus ring, disabled state, and semantic surface tokens.
- `navigation.ts` filters navigation by role and relabels HOD work by department scope.
- `access.ts` sanitizes protected permissions and applies portfolio/department scoping.
- task, calendar, service-plan, upload, and notification flows retain pending-save recovery instead of silently discarding work.

## Priority backlog after this review

| Priority | Candidate | Why it remains open |
| --- | --- | --- |
| P1 | Run the full four-role browser action matrix in a warmed preview/CI runner | Local Vite `/login` navigation exceeded the Playwright/browser-tool boundary in this environment. |
| P1 | Apply and verify the two pending Supabase migrations | Requires deployment approval, backup/preflight, and live database access. |
| P2 | Add component-level tests for shared toast/button semantics | The repository has no DOM testing-library harness; behavior is currently covered by source and browser tests. |
| P2 | Standardize remaining legacy class-based screens onto `inputBase`, `buttonBase`, and semantic tokens | Broad cleanup is not necessary to resolve a confirmed defect and would enlarge regression scope. |
| P3 | Refresh `caniuse-lite` data | Maintenance warning only; not a UX defect. |

## Acceptance criteria for the next pass

- Every role’s primary action is tested before, during, after success, after failure, and during recovery.
- No duplicate submission is possible for an async button.
- Every failure includes a specific recovery action or preserved draft.
- Toasts and inline errors are announced without stealing focus.
- Mobile routes remain free of horizontal overflow at 320px, 375px, 390px, and 414px.
- Keyboard users can enter, complete, cancel, and recover from every modal/sheet workflow.
- No production data or security policy is changed by UX verification.
