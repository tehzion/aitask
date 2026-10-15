# HOD deep audit — latest production release, 14 October 2026

The audited checkout, remote `master`, and production build all identify **v3.0.0 at `ad888330046f89da78f01df3a58bc36a8f803bec`**. Production build time is 14 October 2026, 21:04 MYT. Four gaps remain: two authorization/reviewer-selection defects, an incomplete file-submission path, and an unchanged-status mutation edge case. No P0/P1 defect was confirmed within this audit's scope.

This is an audit, with recommendations and reproduction evidence. Application source, migrations, production records, roles and configuration were not changed. Database mutation probes ran only in a disposable local stack, inside rolled-back transactions; both disposable stacks were removed. Existing untracked `tmp/` content was preserved.

## Findings, in priority order

### 1. P2 — Database revision authority does not enforce the HOD's department

**Trigger:** a HOD has a legacy assignment to a task outside their departments. Viewing and routine editing such assignments are explicitly supported, but the frontend denies reviewer actions outside the HOD's department. A crafted authenticated task-update command can still return that task for revision.

**Reproduction:** a Video Editor HOD was assigned a Designer task waiting for review. The frontend `requestRevision` returned `ok: false` with “You do not have permission to request a revision.” Against the complete migrated local backend, that HOD's authenticated `task.update` request with `status: Revision` returned `ok: true`. The stored Designer task became `Revision`, with `revisionCount: 1`.

**Cause:** [frontend reviewer eligibility](../src/lib/taskWorkflowAccess.ts) requires HOD department membership, but the [latest stage guard definition](../supabase/migrations/20261013160804_task_dependency_review_invalidation.sql), line 215, exempts every HOD from Staff revision restrictions using `not v_hod`. Department membership is checked for approval, but not for returning work, incrementing revisions or recording rejection. The deployed function retains this behavior.

**Impact:** an editable out-of-department relationship grants reviewer authority beyond the UI's contract. It can withdraw another department's submitted work through the API. The local probe establishes the ordinary-task path; effects on every frozen downstream chain were not separately tested.

**Live exposure:** the read-only production query found **zero** current out-of-department HOD assignments. This remains a latent compatibility/authorization defect rather than an observed production incident.

**Recommendation:** apply department-aware reviewer eligibility to revision/rejection and withdrawal transitions, preserving the narrowly constrained automatic dependency-reset exception and intended Boss/PM authority. Add a regression that pairs permitted routine editing with denied out-of-department revision through authenticated commands and direct-table writes.

### 2. P2 — A HOD without a login suppresses the responsible PM's fallback

**Trigger:** a department has an HOD member record whose `auth_user_id` is null. The schema supports directory records without authentication links, and authentication-user deletion uses `ON DELETE SET NULL`.

**Reproduction:** the local fixture had an unlinked Management HOD and an authenticated PM who created and was assigned the task. Reviewer selection returned only the unlinked HOD. Submission succeeded and entered `Waiting Approval`; the responsible PM's subsequent approval was rejected with `VALIDATION`. Boss intervention or member configuration repair is required.

**Cause:** [canonical reviewer selection](../supabase/migrations/20261014111759_pm_review_fallback_and_workflow_inputs.sql), lines 5–16, treats any matching HOD record as a configured reviewer, regardless of whether it can log in. The existence of that record suppresses all ordinary PM fallback reviewers. The [local counterpart](../src/lib/taskWorkflowAccess.ts), lines 38–41, likewise does not distinguish a directory-only reviewer.

**Impact:** successful submission can create an operationally unreachable review queue. This is not a complete administrative lockout: Boss Koo can still review.

**Live exposure:** production currently has **zero** HOD records without login links. All ten waiting tasks have a selected reviewer.

**Recommendation:** define reviewer availability explicitly and exclude unlinked HOD records from canonical reviewer selection, or reject the configuration with an actionable explanation. Keep local simulation consistent while accounting for its deliberately synthetic demo users. Test auth unlinking as well as a null-link fixture.

### 3. P2 — Activity-file uploads do not provide a task-output submission path

**Trigger:** an assigned HOD or worker uploads their output through the service workspace's “Add activity” flow, then attempts to send a linked task for review without an external HTTPS output link.

**Evidence:** [the actual upload flow](../src/pages/ClientWorkspace.tsx), lines 330–338, saves the uploaded reference through `addCycleCommentAttachment`. It does not attach the file to a deliverable or task. [Submission evidence](../src/lib/staffWorkflow.ts), lines 11–28, recognizes task output links, permitted frozen review inputs, or deliverable attachments; cycle-comment attachments do not qualify. [The task output component](../src/components/TaskOutputFiles.tsx) provides downloads and input links, with no upload or output-linking action. No deliverable-file upload call site was found elsewhere in the frontend.

**Reproduction:** the browser diagnostic called the same activity-store actions with a simulated uploaded-file reference. Creating the activity and attaching its file both succeeded. The activity had one file and the deliverable had zero files. `Send for review` was rejected with “Add an output link or upload a deliverable file before sending this linked task for review or completing it.” This diagnostic verifies the reference-routing gap; it does not claim to exercise the upload transport. Actual local private-Storage uploads/downloads passed separately in the full database gate.

**Impact:** file-only submission has backend support, but the current UI offers no path for the worker to place the uploaded file into the required output record. Existing file-only review tests seed deliverable files and therefore do not cover this missing worker interaction. HOD review of already-linked files works.

**Recommendation:** provide an explicit, scoped “Upload output” or “Attach activity file to this output” action. Associate it with a particular deliverable and preserve review-version/invalidation rules. Do not automatically count arbitrary cycle activity files as reviewed output. Until that path exists, explain the usable output-link route instead of directing users to an unavailable deliverable upload.

### 4. P3 — Resending an unchanged Approved status clears customer acceptance

**Trigger:** an approved and customer-accepted task receives an update explicitly containing its current `status: Approved`, even when the only other change is priority.

**Reproduction:** `updateTask(id, { status: 'Approved', priority: 'High' })` returned `ok: true`, kept status `Approved`, and changed `clientApprovalStatus` from `Approved` to `Pending`. The resulting payload also persisted through an authenticated command in the local backend. No output revision was requested.

**Cause:** [the full-update implementation](../src/store/index.ts), line 2826, calls the presence of `data.status` a status change. Lines 2864–2869 reset acceptance because `Approved` is omitted from `isReadyForClientReview`. The [status action](../src/store/index.ts), lines 2486–2490, has the same unchanged-status edge. The server protects newly forged acceptance but permits this withdrawal while status remains unchanged.

**Reachability limitation:** the current details editor submits its edit fields without `status`, so this is **not** a reproduced routine UI priority-save failure. It affects explicit current-status calls, older integrations or crafted updates; that narrower exposure is why it is P3.

**Recommendation:** preserve acceptance when status is unchanged and no revision is requested. Test both unchanged-status update entry points and canonical persistence. Protect against silent acceptance withdrawal in otherwise unrelated updates.

## Operational policy gaps, separate from defects

- **Self-review is permitted.** Of the ten production tasks waiting for review, five are assigned to the HOD who is also eligible to approve them. This is allowed by current code and is not evidence that those tasks have been self-approved. If an independent review is required, define a different reviewer/cover rule and an explicit override. Do not simply exclude the assignee without providing another reviewer.
- **Video review depends on one HOD account.** The production HOD covers Video Shooting and Video Editor; eight waiting tasks are in those departments. Ordinary PM fallback is suppressed whenever that HOD is configured. There is no absence schedule, temporary named cover, or permanent accountable-lead field. Boss Koo remains the available override. These are product capabilities rather than violations of the current documented model.

## Verification and scope

| Verification | Result |
| --- | --- |
| Latest version | Local checkout, remote `master`, public production build: identical `ad88833`, v3.0.0 |
| Full unit suite | **661 tests / 90 files passed** |
| Full disposable backend gate | **828 assertions / 52 database files passed**; schema lint, advisor error gate, postflight, and actual local Auth/REST/Storage/onboarding/workflow checks passed |
| Focused HOD browser regressions | **21 passed**: department/alias scope, delegation/deletion boundary, filters/deep links, dashboard/mobile checks, handoff notifications, role-gated frozen review and revision invalidation |
| Staff/HOD feedback browser regressions | **14 passed**: both languages, acknowledgement feedback, review enquiries, unavailable work, storage recovery and notification focus |
| Additional diagnostic browser cases | **2 completed**; observations record the defects, not expectations for correct future behavior |
| Static checks | TypeScript and full lint passed before the temporary diagnostic files were added; strict translation audit: **0 findings / 159 source files** |
| Production build and bundle | Passed; eager JS **298.4 KiB gzip / 300 KiB cap** |
| Production role scope | Read-only transaction with authenticated HOD request scope: **127 visible tasks, 8 waiting tasks, 8 canonically reviewable waiting tasks** |
| Production reviewer coverage | **10 waiting tasks, zero without a selected reviewer**, zero unlinked HODs, zero out-of-department HOD assignments |

Production checks used read-only SQL, including an authenticated database role/JWT request scope. They did not perform a real HOD Auth login, hosted browser save, or production mutation. The complete local browser suite was not rerun; the 35 existing browser scenarios above are the focused selection. Passing existing tests does not cover the newly reproduced gaps.

The hosted security advisor reported no ERROR notices. Existing privileged-RPC and no-policy private-table notices reflect the architecture's guarded RPC access/direct-access denial and were not treated as demonstrated vulnerabilities. The existing [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains an account-wide hardening item, separate from HOD behavior.

Evidence is retained in [verification metadata](audit-evidence/hod-latest-2026-10-14/verification.json), [frontend mutation observations](audit-evidence/hod-latest-2026-10-14/mutation-probe.json), [activity-file routing observations](audit-evidence/hod-latest-2026-10-14/activity-file-probe.json), [local database command results](audit-evidence/hod-latest-2026-10-14/database-probes.log), and [rolled-back SQL fixture](audit-evidence/hod-latest-2026-10-14/database-probes.sql). Temporary browser diagnostics remain under `tmp/hod-deep-audit-20261014/`. No source fix or deployment was made.


## Remediation follow-up

All four code defects and the independent-review, temporary-cover, and accountable-lead gaps have been addressed in the local source. [The remediation report](hod-review-remediation-2026-10-14.md) records implementation and passing validation. The original findings above describe the audited deployed version; production migrations and frontend rollout completed on 15 October 2026.
