# AiTask Task Detail UI Revamp Report

**Date:** 2026-10-28
**Branch / base:** `claude/magical-fermat-ew80tq`, built on `3b1f276` (the commit `master` points to). Work commit: `450a0e6`.
**Track:** V1 stabilization of the existing product. No new feature, status, approval rule, database change or migration. Nothing was deployed and no production data was touched.

---

## 1. Current UI problems (audit of the running app)

Reproduced in the local workspace for Staff, HOD, PM and Super Admin (`docs/task-detail-revamp/before/`). The task panel is `StaffTaskFocus` (PM/HOD/Staff). Its "Full edit" view, and the Super Admin view, is `TaskDetailsModal`.

| Problem | Where | Evidence |
| --- | --- | --- |
| Progress shown twice ("30%" headline and "Task progress 30%" bar); three times in the full editor | Status card; editor header | `before/task-staff-linked-deliverable-1440-tall.png`, `before/task-superadmin-review-1440-tall.png` |
| Repeated context: "Delivery context" repeated client and service from the header and due date from the status card | Panel | same |
| "Work ownership" card for two names, plus "Assignment acceptance is not recorded." on every open task | Panel | all `before/task-*` |
| Output requirement repeated: body note *and* long footer sentence ("Add an output link or upload a deliverable file before sending this linked task for review or completing it.") | Linked tasks | `before/task-staff-linked-deliverable-*` |
| **"Output upload is unavailable — available only when this task is linked to a delivery"** card on every ordinary task, implying outputs matter for all work | `TaskOutputFiles` (panel and editor) | `before/task-pm-finalize-1440-tall.png` |
| Large always-open "Review responsibility" form for PMs | Panel and editor | same |
| Always-open "Revision Control" textarea in the footer, including on completed tasks | Panel footer, editor | `before/task-hod-review-*`, `before/task-pm-completed-*` |
| Footer showed a "Completed" chip that repeated the header status | Panel | `before/task-pm-completed-*` |
| Decorative icon on every section heading (Brief, Delivery context, Updates, History) | Panel | all |
| Full editor: "Assignment is unavailable" boxed notice shown even to users who can never assign | Editor | `before/task-superadmin-review-1440-tall.png` |

Measured scroll height of the panel content at 1440px (from `index-task.json`):

| View | Before | After |
| --- | --- | --- |
| Staff ordinary task | 1179 px | 714 px |
| Staff linked task | 1259 px | 890 px |
| HOD review | 1312 px | 714 px |
| PM finalize | 1649 px | 784 px |
| PM completed | 1565 px | 732 px |

---

## 2. Before/after screenshots

`docs/task-detail-revamp/before/` and `docs/task-detail-revamp/after/` contain the same captures. They are produced by the same seeded scenario (one project, an ordinary task, a delivery-linked task, waiting/approved/completed tasks) at 1440px (viewport and tall) and at 390px:
- `task-staff-ordinary-inprogress-*`, `task-staff-ordinary-pending-*`
- `task-staff-linked-deliverable-*`
- `task-staff-waiting-*`, `task-hod-review-*`
- `task-pm-finalize-*`, `task-pm-completed-*`
- `task-superadmin-review-*` (the full editor)

---

## 3. Layout improvements

| Area | Now |
| --- | --- |
| Header | Task title (wraps) and "Company · Service"; close button unchanged (Escape and button). |
| Summary | One line: status chip · priority · due/overdue (red when overdue) · revision count; then one progress bar with its percentage. Hidden for cancelled tasks. |
| People | Compact list: Assigned; Responsible HOD (when set) or Task contact; **Reviewer** with "Sent for review … ago" while waiting. Accept assignment, request help/handover, and clear blocker are small secondary buttons. |
| Review settings | Collapsed "Review settings" disclosure for users who manage review. It opens automatically only for a Super Admin on a waiting task, where the audited-override approval lives. |
| Details | Plain description, notes, and deliverable/service cycle when linked. "No description." placeholder; no empty card. |
| Attachments and links | One compact section marked **Optional** for ordinary tasks; existing link, output files and upload control (linked tasks only) inside it. |
| Activity | Updates as a simple list with the composer; **History** collapsed with an entry count. |
| Footer | Left: **Edit task**, and for reviewers **Request revision** (one click) + **Add note**. Right: the state's primary action (Start work / Send for review / Complete task / Approve / Confirm completion) or "Awaiting Review". |
| Full editor | Progress shown once; the header shows priority; availability notices are a quiet line, shown only to people who would otherwise have the action; "Attachments and links (optional)"; revision note in an optional disclosure. |

---

## 4. Removed repetitive content

- Large progress headline (kept the single bar); the editor's header bar for internal users.
- "Delivery context" block (client/service/due already shown); deliverable and cycle moved into Details.
- "Assignment acceptance is not recorded." Acceptance stays available as the "Accept assignment" action for the assignee.
- "Waiting for review" sub-card and "Ask the task contact … tracked separately" paragraph; replaced by the Reviewer line.
- Duplicate output requirement in the body *and* footer. The body states it once; the footer says only "Add the required output before submitting."
- "Output upload is unavailable" card on ordinary and closed tasks.
- "Completed"/"Cancelled" chip in the footer.
- Section-heading icons (status, alert and action icons kept).

---

## 5. Optional attachment behaviour

**Finding:** the evidence rule was already scoped correctly in every layer. Only the UI made outputs look mandatory.

| Layer | Rule |
| --- | --- |
| UI controls | `getTaskStatusControls` → `taskEvidenceError` |
| Store | `taskEvidenceError` (`src/lib/staffWorkflow.ts`), checked on Waiting Approval / Approved / Completed |
| Database | trigger in `20261013035142_staff_workflow_recovery.sql` (hardened in later migrations): `if v_linked then … raise check_violation` |

All three require a valid output link or an uploaded deliverable file **only when the task is linked to a service deliverable** (`deliverableId`, or listed in a deliverable's `taskIds`).

Ordinary tasks (calls, meetings, follow-ups, admin) were never blocked, and still aren't:
- Staff can send them for review without a file.
- With approval disabled, they complete them directly (unit tests and e2e scenarios A, D).
- Optional links still work (scenario B).

The UI now says so: "Attachments and links · Optional — Add files or links in Edit task if needed."

No business rule, RPC or database constraint was changed, so no backend change and no production action is needed.

---

## 6. Explicit evidence requirements preserved

Delivery-linked tasks (generated or linked service-deliverable chains) are client-delivery work. Their output is what proves the deliverable, and the production database trigger enforces it, so the requirement is **kept**.

The panel states it once, specifically: "This task delivers a client deliverable. Add its output before sending it for review." It confirms "Output added for this deliverable." once satisfied. The footer shows the concise "Add the required output before submitting.", and Send for review stays disabled until output exists. The store rejects the transition either way (scenario C, unit tests).

Making evidence optional for linked tasks would require a new, approved database migration and a product decision. This is listed in section 11.

---

## 7. Approval and completion verification

No status or rule was added. The panel uses the existing guided action (`getStaffGuidedAction`) and permission checks (`getTaskStatusControls`, `taskTransitionError`, `canRequestTaskRevision`, `canApproveInternalReview`).

| Scenario | Result |
| --- | --- |
| A – ordinary task: start → send for review, no attachment | Pass; Reviewer line shows the HOD |
| B – optional link added in Edit task, then submit | Pass |
| C – linked task without output | Pass; Send for review disabled, store rejects |
| D – approval disabled: assignee sees **Complete task**, no review step | Pass |
| E – approval required: Staff submits → HOD **Approve** → PM **Confirm completion** | Pass |
| F – HOD **Request revision** with note → Staff sees "Revision 1" → resubmits | Pass |
| G – completed, refresh, reopen: status Completed, no submit actions, history intact | Pass |
| H – Staff on a waiting task: no Approve/Request revision; store rejects Approved/Completed | Pass |

PM/HOD review controls appear only when the existing rules authorise that user (Approve for the HOD in scenario E; none for Staff in H). Reviewer names use the lane logic from the dashboard work (`getInternalReviewLane`).

---

## 8. Role-based testing

| Role | Covered by |
| --- | --- |
| Staff | Scenarios A–D, F–H; responsive and Axe tests |
| HOD | E (approve), F (revision); existing `hod-*` specs |
| PM | E (confirm completion); `pm-portfolio`; `hod-remediation` review settings (expanded explicitly) |
| Super Admin | Full editor screenshot; `hod-remediation` audited override (settings auto-open) |
| Client | Unchanged client views (`ClientDeliveries`, editor client path keeps its progress bar); client privacy covered by `ui-revamp` spec |

---

## 9. Responsive results

`e2e/task-detail.spec.ts` checks the panel at 320, 390, 768, 1024 and 1440px with a long title:
- no horizontal overflow;
- the title wraps inside the panel;
- the footer's primary button is within the viewport and keyboard-focusable;
- Escape closes the panel;
- Axe is clean inside the dialog at 390 and 1440px.

The existing SideSheet width (`sm:max-w-xl`) is sufficient once the cards are removed. All captured views report 0 px horizontal overflow.

---

## 10. Automated regression results

RESULTS_PLACEHOLDER

---

## 11. Remaining risks

- **Delivery-linked tasks still require output.** This is intentional and enforced in production. If the business wants linked tasks to be completable without proof, that needs a product decision and a new, reviewed migration (the trigger in `staff_workflow_recovery` and its successors). It was not changed here.
- **Full editor.** It is lighter but still long (review settings, links form and client approval live there). A deeper restructure was out of scope.
- **Browser suite baseline.** The same pre-existing failures as the previous report (section 10 of `AITASK_UI_UX_REVAMP_REPORT.md`) remain in this environment and need a run on the reference release host.
- **CI on `master`.** Two jobs fail independently of this work: the database job replaying migration `20261023150000_hod_task_execution_permissions` ("HOD assignment boundary was not found"), and the PWA offline Reports deep-link test.

---

## 12. Production readiness

| Dimension | Status |
| --- | --- |
| UI/UX (task detail) | Ready for review |
| Functional (this change) | Verified locally (unit and scenario e2e) |
| Security | Unchanged; no permission or backend change |
| Operational / deployment | **NO-GO unchanged.** The go-live audit gates (migration alignment, hosted verification, owner approval) and the failing `master` CI jobs remain open. |

This change is not deployed. It sits on the feature branch, ahead of `master`.
