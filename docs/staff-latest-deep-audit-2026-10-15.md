# Staff role deep audit — 15 October 2026

The deployed Staff experience has **three confirmed P2 defects**. No P0/P1 defect or Staff access-boundary violation was found in the checks below. These findings are pending fixes; this audit changed no application code or production data.

## Version and scope

- Production: https://aitask-virid.vercel.app, version `3.0.0`.
- Audited commit: `7cafb1c78a9bcb7b8ee17e405f1a9278ed41a7cf`, built `2026-10-15T00:23:58.385Z` (08:23 MYT).
- Staff dashboard/My work, All work, task focus and full editor, task updates, assignment acceptance, help/review requests, output files, save/reload/retry recovery, task authorization, company/service visibility, and backend permissions.
- Browser and database checks used an isolated export of the deployed commit. Concurrent PM changes in the shared checkout were excluded. Source line numbers below refer to that commit and may move in the current checkout.
- Production checks were read-only. Synthetic accounts, tasks, and uploads were confined to disposable local fixtures; the local Supabase stacks were removed afterward.

## 1. P2 — Closing a task during an output upload abandons its attachment save

**Trigger:** A Staff member chooses a file in task focus, then closes the task sheet while “Uploading and saving output…” is visible.

**Observed:** The sheet closes without protecting the active upload. The Storage request completes, but the file is not attached to the canonical task. The component's retry state disappears with the sheet, so the Staff member has to upload again to submit the output.

The reproduction held an actual authenticated Storage POST, closed the actual task sheet, then released the request. Storage contained **one object**, while the task had **zero output attachments**. This is a missed task submission, not evidence of permanent Storage corruption: the existing durable file registry/reconciliation may recover or clean up the storage reference.

**Cause:** `TaskOutputFiles` owns its upload busy state, while `StaffTaskFocus` protects only its own saves and drafts. Closing unmounts the upload owner; the session/owner guard correctly rejects the now-stale continuation before it attaches the uploaded file.

- `src/components/TaskOutputFiles.tsx:25` — separate `useSaveAction` upload state.
- `src/components/StaffTaskFocus.tsx:94`, `:192`, `:300` — unsaved/exit guards omit that upload state.
- `src/lib/taskOutputUpload.ts:23` — stale ownership stops canonical attachment after Storage upload.

**Fix direction:** Include active output uploads in task-sheet exit and navigation protection, including switching to the full editor. Keep a recoverable uploaded reference for genuine failures. Preserve the account/session fencing; removing that guard would introduce a different problem.

**Evidence:** [Real Auth/Storage reproduction](audit-evidence/staff-latest-2026-10-15/delayed-upload-reproduction.mjs). The shared output component also warrants equivalent close/navigation coverage in other role surfaces.

## 2. P2 — All work urgency and relative dates remain stale across local midnight

**Trigger:** A Staff member leaves All work open while the local date advances.

**Observed:** A pending task due on the new day remains in “Up next”, “Needs action” remains zero, and the card continues to say “Due in 1 day”. Refreshing or another relevant render eventually corrects it; the date boundary itself does not.

The browser clock was paused at **23:59:59 on 14 October in Asia/Kuala_Lumpur**, with one task due 15 October. After advancing two seconds, the clock was `2026-10-14T16:00:01.000Z` (00:00:01 MYT), but Needs action was still **0**, expected **1**.

**Cause:** `StaffAllWork` calls `getTodayInputDate()` during rendering without subscribing to date changes. The Staff `/tasks` route mounts that component directly, so the date hook in the other tasks workspace does not help. Staff My work/dashboard already uses `useLocalToday`; the confirmed defect is in All work.

- `src/components/StaffAllWork.tsx:93` — render-only date used by the urgency queue.
- `src/pages/Tasks.tsx` — Staff route renders `StaffAllWork`.
- `src/hooks/useLocalToday.ts` — existing mechanism available for the fix.

**Fix direction:** Use the existing local-date hook in All work so queue placement and relative-date labels refresh at midnight and when the page regains focus/visibility.

**Evidence:** [Clock reproduction](audit-evidence/staff-latest-2026-10-15/midnight-reproduction.spec.ts), [screenshot after midnight](audit-evidence/staff-latest-2026-10-15/midnight-stale-queue.png). The new diagnostic fails its final expected Needs action count against the deployed source.

## 3. P2 — Review-update requests miss the HOD shown as the task contact

**Trigger:** A HOD assigns work to Staff, and Staff uses “Request review update” on a task waiting for approval.

**Observed:** The UI names that HOD as the task contact and tells Staff to ask the contact for an update. The comment saves, but the HOD receives no task-update notification. In the synthetic HOD-assigned/PM-created fixture, the only notification recipient was the PM, although the displayed task contact was the HOD.

**Cause:** The contact helper chooses the assigner or creator, regardless of their role. The review-request action uses the ordinary comment path, whose recipient resolver selects Boss recipients and a Project Manager. It excludes a HOD assigner. The backend notification normalizer also limits the corresponding assigner/creator recipient path to Project Manager, so fixing only the frontend recipient list is insufficient. The separate HOD submission handoff does not cover this subsequent review enquiry.

- `src/lib/staffWorkflow.ts:69` — contact selection.
- `src/components/StaffTaskFocus.tsx:251`, `:397`, `:403` — review enquiry/comment and contact instructions.
- `src/store/index.ts:599` — `resolveTaskUpdateRecipientIds`; PM-only selection at `:609`.
- `supabase/migrations/20261013055051_task_stage_progress.sql:323–361` — server notification recipient normalization.

**Fix direction:** Notify the authorized task contact/reviewer for these enquiries and align the backend recipient rules narrowly with that behavior. Preserve PM oversight and verify task-view eligibility; do not broadcast to arbitrary HOD accounts.

**Evidence:** [Notification reproduction](audit-evidence/staff-latest-2026-10-15/contact-notification-reproduction.test.ts). Production has four historical Staff-assigned tasks with HOD contacts, but none is currently open or waiting for approval. This limits current exposure; the supported delegation workflow can reproduce the defect again.

## Verification and clean checks

| Check | Result |
| --- | --- |
| Unit baseline | 676 tests across 93 files passed |
| Staff and task-authorization browser baseline | 79 cases passed |
| Disposable database regression gate | 880 assertions across 54 files passed |
| Database schema lint, advisors and postflight | Passed |
| New delayed-upload diagnostic | Confirmed one Storage object and zero task attachments after close |
| New midnight diagnostic | Failed expected queue refresh, confirming finding 2 |
| New contact diagnostic | Failed expected HOD recipient, confirming finding 3 |
| Live Staff/task scope | 567 combinations; zero view/edit mismatches |
| Live Staff/company scope | 249 combinations; zero assigned-service visibility mismatches |
| Staff privileged access checks | Zero protected admin or service-price/plan/cycle-management grants |
| Submitted task deletion checks | No Staff deletion grant for Waiting Approval, Approved or Completed work |
| Public AiTask tables | RLS enabled on all checked `aitask_*` tables |

The browser baseline covered Staff desktop/mobile flows, Chinese dark mode, accessibility, task action authorization, and existing save/conflict/retry recovery. The delayed-upload case additionally used real local authentication, REST and Storage rather than mocked persistence.

Live scope checks covered all **three auth-linked Staff accounts** against **189 tasks** and **83 companies**, using their configured permissions. A fourth ordinary Staff member has no linked Auth account and no open assigned work. That is an account-readiness observation, not a demonstrated access defect. No Staff-assigned production task lacks a company ID.

Passing existing suites does not invalidate the three new findings: their triggers were missing from the existing regression coverage. The production scope checks validate the recorded accounts and data at audit time, not every possible future role configuration. Staff production accounts were not used to create test tasks or upload test files.

## Evidence and reproduction notes

[Machine-readable verification](audit-evidence/staff-latest-2026-10-15/verification.json) records the deployed identity, check totals and observed diagnostic results. The screenshot and test sources contain synthetic fixtures only.

The archived diagnostics retain their original test-root imports. To replay against an isolated export of the audited commit:

1. Place the midnight Playwright file under `e2e/` and use the repository Playwright setup with the Asia/Kuala_Lumpur clock setting in the test.
2. Place the contact Vitest file under `src/store/` and run it with Vitest. Its expected HOD notification assertion fails on the audited source.
3. Place the delayed-upload script under `scripts/` and run it through the repository's disposable local Supabase rollout harness. It requires the harness's local URL, local keys and validation container; its safety guards reject a nonlocal target. Do not run this fixture against production.

Application fixes, database recipient changes, and deployment of Staff remediation are still pending. This report is the completed audit requested for the Staff role.
