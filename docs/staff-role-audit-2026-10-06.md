# Staff role audit — 6 October 2026

## Scope and outcome

Reviewed the Staff task sheet, comments, status changes, pending-save recovery, assigned service activity and file selection, desktop/mobile access, translated navigation, and deployed task authorization. The original audit baseline is commit `185aa9799428ab257fa8a448ee813170bb54c428`.

Six product problems were reproduced with synthetic local data and delayed/rejected commit responses. All six are now fixed. The findings below preserve the original observations; the implementation and final regression results are recorded at the end.

Production authorization checks used read-only helper calls inside a transaction followed by ROLLBACK. No production business records, account permissions, or attachments were changed. An authenticated Staff browser session against production and a successful real Storage upload were not exercised.

## Original confirmed findings (all fixed)

### P1 — Successful comment acknowledgement clears newer input

1. Open an assigned task as Staff.
2. Type `Submitted work note`, send it, and delay the commit response.
3. Type `Later unsent work note` while the request is pending.
4. Resolve the original save successfully.

The textarea becomes empty. Only `Submitted work note` is in the comments list. The later draft is lost because the handler unconditionally clears the current input after awaiting its earlier submission.

Evidence: [comment submission](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L105), [unconditional clearing](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L118), [editable textarea](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L260).

**Correction:** Capture the submitted text and draft revision; clear only the submitted revision. Keep newer input dirty and available for a separate submission.

### P1 — A response from task A can erase task B's draft

Send a comment on task A with a delayed save, close A, open B through the normal task list, and type a draft on B. Resolving A's save clears B's draft.

The task sheet remains mounted across task selection changes. Its effect resets local state on task ID changes, but the earlier async handler can still update the same component after the new task is open.

Evidence: [task ID reset](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L62), [save completion](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L116), [shared task sheet](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffAllWork.tsx#L222).

**Correction:** Bind each async operation to the task ID and session generation that started it. Ignore stale completions for another task; also prevent closing or switching during a submission unless the pending operation is handled explicitly.

### P1 — Retry leaves the submitted comment draft and can cause duplicates

Send a comment and simulate missing save confirmation. The optimistic comment is inserted and the draft is retained. Click `Retry my changes` and resolve the retained operation successfully.

The draft still contains the already-submitted text, and the original error remains visible. Sending that remaining draft creates a second comment with identical content. The reproduction produced two separate `Retry this work note` comments.

This is a UI submission/reconciliation issue: it does not prove that the Supabase retry command itself duplicates records.

Evidence: [comment failure path](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L116), [generic retry control](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/BackendFreshness.tsx#L98), [duplicate comment screenshot](/private/tmp/staff-audit-duplicate-comment.png).

**Correction:** Track the pending comment ID and submitted draft revision. Reconcile successful retry and discard outcomes with the task sheet; clear the acknowledged revision and its stale error while preserving newer input.

### P1 — Service activity acknowledgement discards newer notes and files

As ordinary Staff on assigned UrbanEats service work, submit a text activity with a delayed save. While saving, replace the update text and select `later-staff-note.pdf`. Resolve the earlier text-only save.

The sheet closes. Reopening it shows an empty note and zero selected files. The newly selected file was never part of the submitted operation and is discarded by its completion handler.

Evidence: [activity acknowledgement](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/pages/ClientWorkspace.tsx#L291), [clearing text/files and closing](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/pages/ClientWorkspace.tsx#L302), [editable activity controls](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/pages/ClientWorkspace.tsx#L1046). The retry handler also clears the current note and file without comparing them to the pending submission.

**Correction:** Capture the submitted note, visibility, file and draft revision. Clear/close only when the current form still represents that revision, or disable those fields while saving. Preserve newer notes/files on both normal acknowledgement and retry.

### P2 — Escape silently discards an unsent task update

On mobile, enter `Unsaved Staff update`, then press Escape. The task sheet closes with no confirmation. Reopening the task shows an empty draft. `hasUnsavedChanges()` returned false while the note was entered.

Evidence: [task reset](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L62), [unguarded close](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L156).

**Correction:** Register comment drafts and in-flight work with the existing unsaved-change hook. Apply a consistent guard to Escape, Close, task switching and Full edit. Consider per-task draft recovery.

### P2 — Rejected status changes still announce success

Change an assigned task from Pending to In Progress and reject the commit. The sheet displays the rejection, but the toast store contains the success message `task.statusUpdated` for In Progress.

Evidence: [status commit](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/components/StaffTaskFocus.tsx#L100), [optimistic success toast](https://github.com/tehzion/aitask/blob/185aa9799428ab257fa8a448ee813170bb54c428/src/store/index.ts#L2728).

**Correction:** Announce persistence success only after commit/retry acknowledgement. Show pending feedback while confirmation is uncertain. Review the other task mutation toasts that use the same optimistic pattern.

## Enhancements

- Distinguish pending, confirmed, failed and discarded work updates in the list. A pending optimistic comment currently looks like a saved comment.
- Keep recoverable drafts per account and task, with a clear restore/discard choice when returning to work.
- Expand task history beyond client review events and the latest `Task updated` timestamp: show status transitions, actor and time when supported by recorded data.

## Original audit verification

- **148 unit tests passed across 12 files** on the final baseline: task/role access, Staff task restrictions, assigned service access, task assignment, task/service saves, file integrity and recovery, notifications, secure workspace commands and member permissions.
- **13 browser scenarios passed:** role/task isolation, Staff desktop/mobile navigation, Chinese filters, keyboard tabs, dashboard accessibility, approvals denial, service workbenches, price isolation and upload-unavailable recovery. The upload-recovery fixture in this existing suite uses Boss; the additional delayed service activity/file-selection reproduction uses ordinary Staff.
- **Eight recorded browser observations** cover six product findings plus desktop/mobile task-sheet accessibility. Both axe scans returned zero violations, and neither viewport had horizontal document overflow.
- **Live Supabase task authorization:** three ordinary Staff accounts × 185 tasks = 555 account/task combinations. Zero view-scope mismatches, zero edit-scope mismatches, and zero effective grants of member administration, registration approval or global task-edit permission. HOD accounts were excluded from this ordinary Staff comparison; explicit view-all and department-scoped grants were included in the expected predicates.
- Test fixture startup initially encountered a stale development module after unrelated commits arrived in the shared workspace. The audit server was restarted. Reproductions used the fresh server and stable textarea selectors. Product code and unrelated workspace work were preserved.

[Raw synthetic reproduction results](/Users/user/Downloads/aitask-master/docs/staff-role-audit-evidence-2026-10-06.json).

## Implemented fixes

- Task comments retain the submitted text and comment ID. Successful saves and retries clear only that submitted text; newer input remains available. Successful retries also clear stale errors and prevent duplicate submission.
- Task ID, operation generation and workspace session checks isolate async completions from another task or account. Both the Staff sheet and Full edit comment flow use submission ownership checks.
- Escape, Close and Full edit protect unsent task updates with a discard confirmation. Active saves cannot be closed. Discarding a pending operation reloads confirmed data before closing.
- Service activity acknowledgements compare the submitted note, file and visibility with the current form. Newer notes, selected files and visibility remain visible after normal saves and retries. Missing/discarded pending activities cannot report success; validation of a newer draft does not block acknowledgement of an earlier submission.
- Task status success and completion celebrations occur only after persistence acknowledgement, including retries. Rejected status changes no longer emit success feedback.
- Generic workspace retry/discard actions remain supported; successful external retries reconcile pending task comments.

The optional enhancements above remain recommendations. This release does not add persistent per-task draft recovery or expanded task history.

## Final verification after fixes

- **422 unit tests passed across 62 files.**
- **57 browser regression scenarios passed**, including **16 new Staff save/recovery scenarios** covering delayed saves, retry acknowledgement, duplicate prevention, stale task responses, desktop/mobile discard guards, failed status feedback, Full edit comments, external retry/discard, and newer service notes/files/visibility.
- TypeScript checks, scoped ESLint, production build, translation verification (zero findings across 124 source files), and `git diff --check` passed.
- Release/database migration alignment passed. Live Supabase checks confirmed the task command RPC is available and 78 migrations are applied.
- No database migration or Edge Function update is required; the fixes use the existing persistence and retry APIs.

The raw reproduction JSON remains historical failure evidence. Passing regression scenarios are recorded in `e2e/staff-save-recovery.spec.ts`.
