# Action-Level UI/UX Verification — AiTask

**Date:** 2026-10-17 · **Lifecycle standard:** *Click → Process → Save → Close → Confirm → Refresh → Continue*
**Method:** source review of every action handler/form/modal/dialog + executed unit gate. Live browser interaction not re-run in this session (no browsers); the `e2e/` suite runs in CI.

---

## 1. Shared infrastructure (verified)

| Mechanism | Implementation | Verdict |
| --- | --- | --- |
| Modal focus | `ModalShell.tsx` — auto-focus (`[autofocus]`/first focusable), Tab focus trap, top-of-stack Escape, focus return on close, scroll lock, `inert`+`aria-hidden` on root, modal stack for nested modals | PASS |
| Backdrop close | **Off by default** (`closeOnBackdrop=false`) to protect unsaved form data; opt-in for read-only modals | PASS |
| Unsaved-change protection | `useUnsavedChanges` + `useRecoverableForm` (persist/restore drafts) + `ModalShell` `onChangeCapture`/`onClickCapture` marks `onEdit` for button-driven controls | PASS |
| Duplicate-submit prevention | `useSaveAction` `owner` token rejects concurrent runs; buttons/fieldsets `disabled` while busy | PASS |
| Success-after-confirmation | `queueActionFeedback`/`acknowledgeActionFeedback` — success toast only after the persistence predicate is verified | PASS |
| Error feedback | `SystemMessage` → `userFacingMessage` (fixed this session, see §4) | FIXED & VERIFIED |
| Destructive actions | `ConfirmDialog` (danger tone, busy state disables both buttons, `SystemMessage` error) | PASS |
| Toasts | `useToastStore` — success/warning/error/info tones, `aria-live`, 3-toast cap, auto-dismiss | PASS |

## 2. Action lifecycle by module/role

| Module | Role | Action | Modal behaviour | Feedback | Data refresh | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Tasks | PM/HOD/Staff | Create task | Modal; auto-close + navigate on success; stays open on failure (values preserved) | "Saving task…" → "Task created"; `formError` inline | Task list + dashboard via store | PASS |
| Tasks | All | Edit task / status / priority / assignee / due date | Sheet/modal; `closeDisabled` while saving; unsaved-change confirm | success toast / inline error | `deriveServiceProgress` + selectors | PASS |
| Tasks | PM/creator | Delete task | `ConfirmDialog` (danger); record named | "deleted" toast; stays visible on failure | list/counters update | PASS |
| Tasks | HOD/PM | Approve internal review | Inline (no modal); busy state | "Review approved" | `isAwaitingInternalReview` recalc | PASS |
| Tasks | Boss | Approve with override | Inline + reason (required) | "Review override saved" | review provenance | PASS |
| Companies | PM/Boss | Create/edit company/project | Modal; auto-close on success; retry on failure | `client.companyCreated` / `project.created` | list refresh | PASS |
| Companies | PM | Delete company | `ConfirmDialog` (danger) | "Company deleted" | removes record + cleans Client accounts | PASS |
| Service | PM/Boss | Create/activate plan, manage cycle/deliverable | Modal/wizard (5-step); step state preserved | `plan.activated` etc. | plan/cycle/deliverable lists | PASS |
| Approvals | Boss | Approve/reject registrations | Inline; bulk with partial-failure message | `approval.registrationApproved` / `bulkApproveFailed` | pending count decrements | PASS |
| Members | Boss | Add/remove member, change role/permission | Modal + confirm on remove | "Member added/removed" | member list + nav refresh | PASS |
| Client | Client | Approve / request changes | Inline; `pendingSave` gating | "Client approved/revision" | approval history + stage | PASS |
| Files | Staff/HOD/PM | Upload/download output | Inline; "Uploading and saving…" → "Output file saved"; Retry output save | success/error (SystemMessage) | `outputAttachments` refresh | FIXED & VERIFIED |

## 3. Edge-case coverage (verified in source; relevant tests noted)

| Edge case | Handling | Evidence |
| --- | --- | --- |
| Double-click Save | `useSaveAction` owner token + `disabled={busy}` | `useSaveAction.ts` |
| Cancel during processing | Cancel/close blocked while `isSubmitting` (`requestClose` guard; `busy` disables dialog) | `CreateTaskModal.tsx:183`, `ConfirmDialog.tsx` |
| Close with unsaved changes | `window.confirm` / `useUnsavedChanges` | `CreateTaskModal`, `useUnsavedChanges` |
| Network interruption / Supabase error | Fail-closed read-only / retry with command-id idempotency; form preserved | `secureWorkspace`, `store` |
| Session expiration | `errors.sessionExpired` (SystemMessage) | `userFacingMessage.ts` |
| Record deleted by another user | `NOT_FOUND` → "no longer available"; no blind retry | `userFacingMessage`, `store` |
| Concurrent edits | optimistic concurrency → `CONFLICT` → "changed elsewhere" | `store`, `userFacingMessage` |
| Non-idempotent retry | idempotency receipts (`aitask_command_receipts`) before retry | `reliable_workspace_commands.sql` |

## 4. Implemented improvements (this session)

Only the **error-feedback** lifecycle required changes (prior phase, now part of action UX):

| Action | Issue | Fix | Result |
| --- | --- | --- | --- |
| Review-config save | raw technical error rendered | `TaskReviewSettings.tsx` → `SystemMessage` | FIXED & VERIFIED |
| Output upload | raw Storage error rendered | `TaskOutputFiles.tsx` → `SystemMessage` | FIXED & VERIFIED |
| Client approve/comment | pre-translated (lost classification) | `ClientDeliveryFocus.tsx` store raw | FIXED & VERIFIED |
| File download | pre-translated | `ClientServiceWorkspace.tsx` store raw | FIXED & VERIFIED |
| Activity upload/comment | raw `cleanup.error` concatenated | `ClientWorkspace.tsx` fixed message + `errors.fileUnavailable` mapping | FIXED & VERIFIED |

## 5. Regression results

| Check | Result |
| --- | --- |
| `pnpm check` / `pnpm lint` / `pnpm verify:i18n` | PASS |
| `pnpm test` | **105 files / 814 tests** PASS |
| `pnpm build` | PASS |

## 6. Remaining issues / limitations

- **Live browser interaction testing not re-run** (no browsers in this session). The `e2e/` suite (`app-smoke`, `accessibility`, `responsive-audit`, `action-save-gaps`, `role-ux-stabilization`, `ui-message-audit`, etc.) executes in CI and covers these action lifecycles with Playwright. Actions are therefore marked **PASS (source + unit)** not **PASS (browser)**.
- `CreateTaskModal` uses the native `window.confirm` for the unsaved-changes warning (functional; the app's `ConfirmDialog` is used for destructive actions). No functional defect.

## 7. Conclusion

Every authorised action across the four roles follows the complete lifecycle — validation → processing (loading + duplicate-submit guard) → Supabase confirmation → UI update → feedback → context preservation — with failure paths preserving input and offering safe, idempotent retry. **No confirmed critical or high action-level UX defect remains.** The only actionable gap found this session was error-message rendering, now fixed and verified.
