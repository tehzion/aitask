# Action UX verification

**Review date:** 2026-10-17  
**Verification model:** Discoverability → Clarity → Interaction → Processing → Feedback → Result → Recovery.

This report records the common action contracts found in the application. `Pass` means the contract is implemented in source and supported by prior or focused evidence. `Not Verified` means a current live browser interaction was not completed in this environment. Current-turn browser verification was attempted against an isolated local demo build, but the browser tool could not reach the local Vite bind; no production account or data was used.

In the action-level table below, `FIXED & VERIFIED` means the implementation change is covered by source inspection plus passing type/lint/build or focused automated checks. It does not imply a live Supabase mutation was executed.

## Common action matrix

| Action | Roles | Discoverability / clarity | Interaction / processing | Success / result | Failure / recovery | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Sign in / password setup | all internal roles | labelled email/username and password fields; demo accounts only in local mode | submit lock and status region | route moves to dashboard or required settings | inline error; password setup preserves required gate | Pass — source + prior auth checks |
| Navigate to a module | all | role-specific sidebar/mobile labels and active state | links preserve browser navigation; main focus is moved on route change | destination renders in the same shell | access-denied screen provides a valid workspace path | Pass — `App.tsx`, `navigation.ts`, prior responsive audit |
| Global search | all where search is available | field label reflects destination; `/` shortcut; clear control | IME-safe input and URL query updates | list filters or navigates to the right search destination | empty result remains actionable; route state stays in URL | Pass — `Navbar.tsx`, Tasks/Clients/Notifications source |
| Create task | Super Admin, PM, HOD, Staff where permission grants | “New task” entry points and keyboard `N` shortcut | modal locks duplicate submission; fields are labelled and grouped | task is added, toast/status appears, context remains available | form error, pending-save recovery, retry/restore | Not Verified — current live browser path |
| Assign task | authorized managers/leads | assignee and department controls are explicit | save state disables conflicting actions | assignment and related notifications update | permission/sync error retains the draft and offers retry/restore | Not Verified — source and unit coverage only |
| Update task status | task-authorized roles | status control is visible in task focus | mutation lock prevents duplicate updates | status and progress update immediately after save | error state and pending-save recovery remain visible | Not Verified — current live browser path |
| Staff submit work/output | Staff | task focus exposes status, output, comments, and help actions | upload/save states lock exit and show progress | task/output/review state updates with confirmation | retained file/pending save offers retry; close guard prevents abandonment | Not Verified — source plus prior Staff audit |
| Add comment / request help | Staff and permitted collaborators | task detail composer and help mode are labelled | submit lock; comment/upload stages are announced | comment/blocker appears in activity and notifies correct recipients | error message keeps draft and exposes retry | Not Verified — source plus unit coverage |
| Internal review decision | HOD/authorized reviewer | review state and decision controls are scoped to task context | action disabled while saving; confirmation where decision is consequential | decision, history, and notification update | decision error stays in context with retry/restore | Not Verified — current browser path |
| Client-facing approval | authorized client/reviewer | delivery review action is presented on the delivery record | decision control locks during save | approval/rejection and feedback state are visible | decision error is announced; draft preserved | Not Verified for this four-role pass; shared source is present |
| Create/edit company/project | authorized roles | page-level primary action and edit controls | modal/sheet draft guard and duplicate-submit lock | record appears in current list and ownership scope | validation or sync errors preserve the entered values | Not Verified — source only in current pass |
| Delete destructive record | authorized roles | separated danger action and confirmation copy | confirm action is busy/disabled while executing | record disappears and success feedback is shown | failure leaves record and presents error | Pass at primitive level; live record path not verified |
| Approve/reject registration | Super Admin | Approvals queue and pending state are explicit | review panel locks while saving | member/registration list and onboarding state update | error remains in review panel; retry path is available | Pass — source + prior approval checks; current run timed out before completion |
| Edit member role/departments/permissions | Super Admin | dedicated tabs and labelled forms | save lock, role restrictions, confirmation for dirty form | member row and effective permissions refresh | error/retry, values preserved | Not Verified — current live browser path |
| Read/unread notification | all | bell badge, Inbox, All/Unread tabs, category filters | mark actions disable while updating and are announced | badge, row state, and unread list update | error region keeps the user in notification context | Pass — notification source/tests and prior browser coverage |
| Open notification destination | all | notification title and View link are actionable | read state is updated before navigation | safe internal route opens the relevant page/entity | inaccessible entity is labelled unavailable rather than leading to a dead record | Pass — `notificationRouteToPath`, notification tests/source |
| Save profile/password/settings | all | section headings, labels, helper text, explicit Save | form `aria-busy`, disabled controls, duplicate-submit protection | status message confirms saved result | error is inline and fields remain populated | Not Verified — current live browser path |
| Resolve sync conflict | all affected roles | persistent banner explains state and offers Retry/Restore | busy controls disable while pulling/saving | workspace returns to current or pending state | failure stays visible with another recovery action | Pass — `Layout.tsx`, `BackendFreshness.tsx`, prior recovery tests |

## Action-level verification table

| Module | Role | Action | Modal Behaviour | Feedback | Data Refresh | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Auth | All internal roles | Sign in / password setup | No modal; labelled form keeps the user in context | Inline alert and submit busy state | Route changes only after authenticated state is established | PASS |
| Shared shell | All roles | Open/close modal, Escape, backdrop, focus return | `ModalShell` traps focus, restores the trigger, and blocks unsafe close while busy | No misleading completion message | Underlying context is preserved | FIXED & VERIFIED |
| Shared feedback | All roles | Show success/error/warning feedback | No modal | Atomic live regions; severity-aware TTL; duplicate messages are suppressed | No unrelated list reset | FIXED & VERIFIED |
| Tasks | Project Manager | Create and assign task | `CreateTaskModal` keeps the form open on failure and guards dirty close | Saving state, success feedback, actionable error/retry | Task list, counters, assignment scope, and notifications update from store/backend result | NOT VERIFIED |
| Tasks | HOD | Review, assign, or update department task | Task detail/review surfaces preserve context while saving | Busy controls plus review/status feedback | Department queue, task history, and notifications update after confirmation | NOT VERIFIED |
| Tasks | Staff | Update status, submit output, comment, or request help | Task focus protects pending uploads and unsaved work | Progress/saving state; preserved draft on failure | Task/review state and recipient notifications update after commit | NOT VERIFIED |
| Approvals | Super Admin | Approve/reject registration | Review action remains scoped to the approval record; consequential action is guarded | Inline result and success/error feedback | Queue, pending count, member state, and onboarding notification update | PASS |
| Members | Super Admin | Edit role, departments, or permissions | Dirty form is protected; protected permissions remain sanitized | Saving lock and inline error | Member row and effective access refresh after confirmation | NOT VERIFIED |
| Companies / Projects | Super Admin, Project Manager | Create, edit, or delete company/project | Create/edit modal has dirty-close protection; delete uses confirmation primitive | Saving/busy state; destructive confirmation and result feedback | Current list and related context update without an unnecessary reload | NOT VERIFIED |
| Client workspace | Super Admin, Project Manager, HOD | Create/edit service plan or cycle | Wizard/editor preserves entered values and recovery state | Validation, saving, success/error, and retry/restore states | Plan/cycle/deliverable views refresh from committed result | NOT VERIFIED |
| Delivery review | HOD, Staff, authorized reviewer | Link deliverable, approve, or request changes | Review panel stays open on failure; invalid-link removal uses `ConfirmDialog` | Inline decision feedback and no success on failed save | Task link, delivery status, history, and notifications refresh | FIXED & VERIFIED |
| Upload recovery | Staff | Check or discard unresolved uploads | Discard uses `ConfirmDialog`; it stays busy during cleanup and remains available on failure | Inline cleanup summary/error with retained-file detail | Pending-file list reflects cleanup result | FIXED & VERIFIED |
| Notifications | All roles | Mark read/unread or open destination | No modal; row action remains in the inbox | Badge/read state and live status update | Notification row, unread count, and safe destination stay synchronized | PASS |
| Settings | All roles | Save profile, password, theme, language, or sync preferences | Form remains available while saving; dirty changes are protected where applicable | Inline status/error and busy controls | Current-user/settings state updates after confirmation | NOT VERIFIED |
| Sync recovery | All affected roles | Retry, restore saved data, or resolve pending mutation | Recovery action does not silently discard pending work | Persistent banner with Retry/Restore and actionable failure | Workspace refreshes only after the chosen recovery result | PASS |
| Destructive records | Authorized roles | Delete member, task, project, package, or workflow | Record-specific confirmation, danger styling, Cancel, and busy lock | Result toast/inline error; record remains visible on failure | Record and related counters update only after confirmed deletion | NOT VERIFIED |

## Lifecycle evidence by concern

### Before action

- Role filtering is applied to navigation and routes.
- Required fields use labels, native constraints, helper text, or component validation.
- Destructive operations use `ConfirmDialog` or a deliberate draft-discard confirmation.
- Form drafts are retained in recovery storage for the longer service/task flows.

### During action

- Shared buttons use a minimum 44px target and disabled state.
- Many async forms expose `aria-busy`; the shared `Button` now adds a wait cursor when `aria-busy` is present.
- Toasts use severity-aware visibility windows and suppress identical duplicates while refreshing the existing message.
- Modal focus is trapped in `ModalShell`; Escape closes the top modal when the action is not locked.
- Common Cancel/Close/Back controls do not create false dirty state through modal click capture.
- Pending backend mutations are represented in the shell, task focus, calendar, and service workspaces.

### After success

- Store-backed lists/cards update from the mutation result or refresh.
- Shared toasts announce status without moving focus.
- Notification badges and read state update through dedicated read actions.
- Route/search/filter state is preserved where actions return to list views.

### After failure

- Errors are generally rendered close to the relevant form or action with `role="alert"`/`aria-live`.
- Retry, restore saved data, reload, or discard choices are present in the affected workflows.
- The source intentionally avoids treating an uncommitted local mutation as a successful remote save.

### Current-turn verification evidence

- `pnpm exec tsc -b --noEmit` — Pass.
- `pnpm lint` — Pass.
- `pnpm build` — Pass, with existing chunk-size and `caniuse-lite` maintenance warnings.
- `pnpm verify:i18n` — Pass, 0 findings across 171 source files.
- Focused action/auth/catalog/toast tests — Pass, 4 files and 23 tests.
- Full suite — Pass when serialized: 107 files and 820 tests with `pnpm test -- --maxWorkers=1 --reporter=dot`. The earlier concurrent run had timeout-sensitive failures; isolated reruns of the affected files also passed.
- Live browser action matrix — Not Verified because the isolated browser could not reach the local Vite preview.

## Evidence gaps requiring the next browser pass

The following interactions should be run in a warmed production preview or CI browser session and recorded with role, viewport, route, action, and result:

1. Super Admin: approve registration, edit a member role, create/delete a company, and resolve a sync conflict.
2. Project Manager: create a task, assign it to Staff, edit task dates, and verify the Staff notification.
3. HOD: open department work, update/review a task, and verify department-only visibility.
4. Staff: update status, upload an output, close during upload, retry a failed save, and add a comment/help request.
5. All roles: keyboard-only modal flow, narrow mobile flow, reduced-motion flow, and unread notification destination.
