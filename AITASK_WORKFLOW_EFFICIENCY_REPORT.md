# AiTask Workflow Efficiency Report

Report date: 2026-10-18 (MYT)  
Repository: `tehzion/aitask`  
Branch: `codex/audit-p0p1-2026-10-16`  
Commit inspected: `90279d6`  
Scope: role-based interaction counts and workflow friction only. No feature implementation was approved or performed.

## How to read the counts

The counts are minimum happy-path interactions observed from the current UI code and existing Playwright workflows. One click, field fill, or select operation counts as one interaction. They exclude login/bootstrap, test fixtures, direct URL navigation, browser/OS file pickers, network wait time, and optional recovery steps. A route transition is counted separately when the UI moves to another application route.

These are not real-user timings. The repository does not contain reliable end-to-end timing instrumentation for these flows, so no duration is claimed.

Evidence sources include `e2e/client-wizard.spec.ts`, `e2e/pm-portfolio.spec.ts`, `e2e/hod-review-handoff.spec.ts`, `e2e/hod-remediation.spec.ts`, `e2e/client-workspace-v2.spec.ts`, `e2e/dashboard-followthrough.spec.ts`, `e2e/role-reports.spec.ts`, and the route/component implementations named in each row.

## Project Manager

| Workflow | Minimum interactions observed | Route transitions | Required fields/decisions in observed path | Friction and opportunity |
| --- | ---: | ---: | --- | --- |
| Create a company | 4: open `New client`, fill company name, fill email, save | 0; stays in `/projects` | Company name and email in the tested path | Good nested flow, but the next project/task action is a separate dialog. Preserve the “continue” prompt and carry the new company context forward. |
| Create a project | 4 after the company-created state: open `Create project`, fill project name, choose service, create | 0; nested in `/projects` | Company is carried forward; project name and service chosen | The company/project context is retained correctly. The flow becomes a chain of dialogs when followed immediately by task creation. |
| Create a task from an existing project | 5: open `New task`, select project, fill title, select department, submit `Create & open task` | 1 to `/tasks?taskId=...` | Project/company, title, department; start date is prefilled; service defaults | The happy path is short, but the modal exposes optional assets, links, notes, visibility, priority, service, and dates before submit. A quick first step would reduce scanning without removing the full editor. |
| Assign work to an HOD | 4 after the task is open: `Full edit`, `Edit`, choose assignee, `Save Changes` | 0 additional route transition | Assignee; current permission/department rules | Assignment is safe and tested, but the action is buried in full edit. A contextual delegation action would reduce discovery cost. |
| Monitor project progress | 2 in the tested drilldown: open a dashboard queue item, then confirm completion for a ready item | 1 to task detail in the queue test | No form fields for the completion action unless a workflow guard requires explanation | Dashboard and queue links are effective. The missing project-health/milestone model means PMs still assemble project status from several surfaces. |
| Review completed work / request revision | 3 minimum for the task-detail path: open task, fill optional revision note, submit `Request Revision` | 0 if task is already open; 1 when opened from a queue | Revision note is optional for internal request; client decision notes have different rules | Review history, files, comments, and status are present, but entry points are distributed across task detail, delivery tracker, notifications, and dashboard queues. |
| View reports | 1 navigation action from the shell | 1 to `/reports` | No required fields; report scope is implicit/current role | Reports are useful but task/due-work focused. A shared company/date scope across dashboard and reports would reduce cross-checking. |

### PM summary

The shortest meaningful PM creation path is already approximately five interactions after a project exists. The higher-cost problem is not raw click count alone; it is context switching between nested dialogs, full task forms, dashboard queues, reports, and service/workspace views.

## Head of Department

| Workflow | Minimum interactions observed | Route transitions | Required fields/decisions in observed path | Friction and opportunity |
| --- | ---: | ---: | --- | --- |
| View assigned tasks | 1: open a queue item from the HOD workbench | 1 to task detail | None | HOD scopes are clear (`My assignments`, `Delegated by me`, `Department work`). Preserve the scope model while making next actions more explicit. |
| Delegate work | 4 after opening the task: enter full edit, enter edit mode, choose assignee, save | 0 additional route transition | Assignee; department/assignment guards | Safe but hidden. A queue-row quick delegate action could reuse the same guard and reduce navigation into the editor. |
| Reassign staff | 4 in the same full-editor path | 0 additional route transition | Assignee and, where relevant, department | Reassignment is correctly locked by workflow state when necessary. Explain the lock beside the action rather than requiring the user to infer it from disabled controls. |
| Review a staff submission | 2 before the task is open in the tested handoff: open Notifications, click `View` | 1 to `/notifications`, then 1 deep link to `/tasks?taskId=...` | No field for approval; review status is the decision | Notifications successfully deep-link to the waiting task, but the notification feed is not a decision queue. Action Centre should expose the same work without duplicating events. |
| Request revisions | 3 minimum: open task, fill revision note, submit `Request Revision` | 0 if already in task detail | Optional internal revision note | The action is available and permission-aware. It competes visually with files, comments, internal review, and completion controls in one long detail surface. |
| Approve work | 2 minimum: open task, click `Approve` or `Approve internal review` | 0 if already in task detail | No required form field unless an exception/guard requires it | Approval is fast once found. The main opportunity is review queue discoverability and clearer evidence grouping. |
| Monitor department workload | 2: open dashboard workload view, open a staff member’s workload | 0 if dashboard is current route | None | Counts are clearly labelled and intentionally not presented as performance scores. Managers still need saved department views and review/overdue grouping. |

### HOD summary

HOD workflows are efficient after the correct scope or notification is found. The main friction is discovery: delegation lives inside task editing, review is split between notifications and task details, and workload metrics link to task filters rather than saved department views.

## Staff

| Workflow | Minimum interactions observed | Route transitions | Required fields/decisions in observed path | Friction and opportunity |
| --- | ---: | ---: | --- | --- |
| Find assigned tasks | 1: open the focused task from `My work` | 1 to `/tasks?taskId=...` | None | `StaffMyWork` already answers “what do I work on?” better than a generic task list. Keep it as the primary personal surface. |
| Accept an assignment | 1 action after task open | 0 additional route transition | No form field | The state is visible in the task/work queue. An unread/new-assignment cue would help when several items arrive together. |
| Update task progress/status | 2: open status control and select a status | 0 if task list/detail is open | Status; workflow guards may require a confirmation | Status controls are available in both list and detail contexts. Preserve the current disabled reasons and feedback while reducing duplicate navigation. |
| Upload deliverables | Not reliably countable from source | Depends on entry point | File picker/upload context; output evidence may be required | The file picker is an OS interaction and should not be turned into a fabricated click count. The UI already exposes upload state and retry; mobile should keep the selected file context visible. |
| Add a comment/update | 2: fill work update and submit/send | 0 | Comment text | Comments are simple and recoverable. No @mentions or unread-comment indicator was found; add only a lightweight indicator if notification volume demonstrates need. |
| Submit work for review | 1–2 after evidence is ready: use the guided submit action, with an optional work note | 0 | Status/action; output evidence can be required | The workflow guard is explicit. The user benefit is highest from showing exactly what evidence/reviewer is missing beside the action. |
| Respond to a revision | 2 minimum: open revised task and update/submit the next guided status; comment is optional | 1 when opened from a queue | Status/action, optional comment | The queue labels revisions, but personal saved filters would make repeated revision work easier to retrieve. |

### Staff summary

Staff has the strongest existing “today” experience through `StaffMyWork`. The improvement target is not another page; it is persistent filters, clearer new/revision cues, and a tighter task detail hierarchy for evidence, update, and submit actions.

## Client

| Workflow | Minimum interactions observed | Route transitions | Required fields/decisions in observed path | Friction and opportunity |
| --- | ---: | ---: | --- | --- |
| Access the client workspace | 1 navigation action from Home to a workspace/delivery surface | 1 when moving from `/` to `/clients` or `/clients/:clientId` | None | Home already surfaces review work and client-safe counts. A central approval queue would remove the need to choose between Home, Deliveries, and Notifications. |
| Find pending deliverables | 1 to choose `View all review requests` from client Home, then 1 to open a specific delivery when needed | 1 to the delivery surface, then a detail deep link | None | The review count is useful. Keep it as the primary call to action and add a stable approval-centre destination. |
| Review a delivery | 1 to open the delivery detail after it is listed | 0 additional route if already in the tracker; otherwise 1 deep link | No form fields to inspect | Client detail groups preview/files, decision, feedback, and history. On mobile, the decision section should remain easy to reach without scrolling past unrelated history. |
| Request changes | 4 in the tested path: open delivery, choose `Request changes`, fill decision note, submit `Request changes` | 0 additional route after detail is open | Decision note is required; validation focuses it and provides `aria-describedby` | This is a good guarded flow. The duplicated label “Request changes” for opening the note and submitting is understandable but could be differentiated as “Add change request” then “Send request”. |
| Approve a delivery | 3 in the tested path: open delivery, fill optional decision note, choose `Approve delivery` | 0 additional route after detail is open | Decision note optional | Approval persists history and status correctly. The surface should retain the clear “awaiting PM final completion” state after approval. |
| Leave feedback | 2: fill feedback and send | 0 | Feedback text | Current client/internal visibility is safe. Unread feedback status could help internal reviewers, but avoid a second messaging system. |
| View completed work | 1–2: open client workspace and choose the relevant delivery/service view | 0–1 depending on current location | None | Approved outputs are available through current delivery/file surfaces, but a final deliverables library remains a platform backlog item. |

### Client summary

Client review is already relatively direct and has strong privacy/recovery coverage. The biggest reduction in effort is discoverability: one approval-first queue and an approved-deliverables library, rather than more controls inside individual projects.

## Cross-role friction patterns

1. **Context is often carried correctly but not surfaced as a reusable default.** Project/company/assignee prefills work; saved views would extend the same principle across sessions.
2. **The same action can be found in multiple surfaces.** Dashboard, task list, notifications, delivery tracker, and client workspace each provide a valid path; users need a clear primary path and consistent deep links.
3. **Long forms and detail sheets remain the main effort hotspots.** The current controls are generally labelled and touch-sized, but optional fields compete with essentials.
4. **Reliability feedback is technically mature but spatially distributed.** Draft recovery, retry, restore, and sync banners are valuable; their vocabulary and placement should be standardised.
5. **Mobile layout passes do not prove mobile interaction is perfect.** The route matrix passes with no overflow, while the onboarding overlay demonstrates that an interaction-blocking regression can survive layout/a11y checks.

## Highest-impact sequence

1. Stabilization-owned onboarding overlay correction and regression test.
2. Permission-scoped global record search built on existing selectors.
3. Progressive quick task creation with a preserved full editor.
4. Saved filters, view preference, and role-relevant defaults.
5. My Work/Action Centre boundary and deep-link alignment.
6. Task detail hierarchy and lightweight collaboration cues after the daily workflow improvements.
