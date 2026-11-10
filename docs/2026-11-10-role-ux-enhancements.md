# Role-based UX enhancements

As of 10 Nov 2026. Copy of the shared doc https://claude.ai/artifact/FRW7gPEjcodiCAjmr29RLx (the shared doc is the editable version).

These enhancements build on features already live, grouped by the role that benefits. None needs a new screen. If you only do five: **Assign from the list** (HOD), **bulk approve** (PM), **Today view** (Staff), **click a gap to act** (Boss) and the client **this month at a glance**.

## Boss

| Enhancement | Builds on | Why it helps |
| --- | --- | --- |
| Weekly company health line: per client, months overdue, months never published, no HOD, approvals waiting more than 2 days | Portfolio tab, Months to tidy up, Staffing gaps | Problems show up without opening each client |
| Click a gap to act: a Staffing gaps row opens Settings with that department already filtered | Staffing gaps panel, Settings → team | Goes from "Video Shooting has no Staff" to fixing it in one step |
| Contract value at risk next to "Plans at risk" | Commercial summary, plans at risk | Shows which risks matter most for the business |

## Project Manager

| Enhancement | Builds on | Why it helps |
| --- | --- | --- |
| "My day" order on Portfolio: approvals waiting on me → overdue tasks → months to publish → unlinked deliverables | PM Portfolio home, approvals, Months to tidy up | A fixed order, so nothing gets missed |
| Bulk approve when several items wait on the same project | Approvals page, list quick actions | Cuts the most frequent PM click, like bulk month decisions |
| Unlinked work warning: tasks this month that count toward no deliverable, with the suggested link | Suggested task links | Delivery counts stay correct without auditing each client |
| Remembered defaults made visible: "Last used: Designer, Mabel" with one click to clear | Remembered Create task choices | People trust the defaults because they can see them |

## HOD

| Enhancement | Builds on | Why it helps |
| --- | --- | --- |
| Waiting-for-me count on the sidebar badge: tasks needing assignment plus reviews | Delegation, notifications | Mabel's 7 waiting tasks become visible at a glance |
| Assign from the list: an "Assign to…" quick action on rows that need assignment | List quick actions (Start work, Send for review) | Assigning is the HOD's most frequent action and currently needs the task opened |
| "Do it myself" shown up front when the department has no Staff | The existing "No Staff in {department} yet" message | Removes the "can't assign" confusion in Mabel's case |

## Staff

| Enhancement | Builds on | Why it helps |
| --- | --- | --- |
| Today view by default: due today and in progress first, then the rest | Tasks list, "Next:" row | Staff open the app and see what to do now |
| Revision reason on the card: the reviewer's note shown in the list | Revision status, comments | No need to open the task to learn what to fix |
| Quiet save status next to the task, not a top banner | Automatic save retry | Staff on mobile data stop worrying about failed saves |

## Client (portal)

| Enhancement | Builds on | Why it helps |
| --- | --- | --- |
| This month at a glance: delivered vs planned per service, e.g. "Social Posts 6/8" | Deliverables, published months | Fewer "what's the status?" messages to PMs |
| Approve or request changes in one place for items waiting on the client | Delivery stages, review flow | Faster client turnaround, fewer chat threads |

## Everyone

- Same "Next" wording in every view: the list, the task and notifications all use the same action words (Start work, Send for review, Approve).
- A "What changed" release notice per role for this release, using the existing release notice.
- Shortcut hints on frequent buttons, using the existing shortcuts help.

## Notes for the assessor

- Some "Builds on" features exist only on the unpushed branch `codex/click-savers-20261110` (uncommitted): list quick actions (`src/hooks/useQuickTaskAction.ts`), Months to tidy up (`src/components/MonthsToTidyPanel.tsx`), suggested task links (`rankLinkCandidates` in `src/lib/deliveryLinks.ts`), remembered Create task choices (`src/lib/createTaskDefaults.ts`), Staffing gaps (`src/components/StaffingGapsPanel.tsx`) and automatic save retry (`src/store/index.ts`). Everything else is on `master`.
- "Mabel's 7 waiting tasks" comes from a read-only live check on 10 Nov 2026 (open tasks with `assignmentState = pending_hod`).

## Shipped 10 Nov 2026 (click-savers PR)

- **Boss:** Staffing gaps department rows open Members filtered to that department (`/approvals?tab=members&department=…`), with pending sign-ups for it shown first.
- **PM:** "Approve several at once" on Portfolio: only work you could approve in one click; confirm first; each approval saves on its own ("{saved} of {total} approved."). Return stays in the task because it needs a note.
- **HOD:** a badge on My work / Department work counts tasks to assign plus reviews where the HOD is the actual reviewer (tooltip "{n} to assign · {m} to review"). An "Assign to…" picker sits on list rows that wait on the HOD. With no Staff in the department, the task shows "Do it myself".
- **Staff:** Today order is overdue → due today → revisions → in progress → the rest, with blocked work last. The reviewer's latest revision note shows on the card.
- **Client:** Ready counts as completed in client counts ("x/y completed"); the dashboard lists this month by service (e.g. "Social Posts 6/8") when the month has more than one service.

## Shipped 10 Nov 2026 (everyone)

- **Quiet save status per task:** a task you change shows "Saving…" beside its status, "Waiting to save" when offline or blocked, then "Saved" for 5 seconds once a save lands (`src/lib/taskSaveMarks.ts`, `src/components/TaskSaveNote.tsx`). It appears on list rows, the Staff focus view and the task window. Memory only; the workspace status still covers anything unsaved.
- **Visible remembered defaults:** Create task shows "Last used: Designer, Mabel" while the reused department (and assignee) are still selected; Clear resets them and forgets the stored choice.
- **Same Next wording:** guides, onboarding and tutorials now name the buttons people actually see (Start work, Send for review, Resubmit for review, Approve) instead of "submit for approval".
- **Per-role release notice:** notice `2026-11-everyday-saves` replaces the August one, with separate copy for Boss, PM, HOD, Staff and client (English and Chinese). HOD is detected with the role templates, so custom HOD roles get the HOD copy.
- **Shortcut hints:** New task buttons show an "N" key on desktop, the search field shows "/", and sidebar links show "Shortcut: G T" (etc.) on hover. Controls carry `aria-keyshortcuts`.
- Not built yet: company health line, contract value at risk, "My day" order for PMs, unlinked-work warning, client approve-in-one-place.

## Role audit fixes (10 Nov 2026)

A pass through each role's home and lists, checked in the local demo.

- **One progress count:** the delivery tracker, client home and management report all count delivered work the same way (`isDeliverableWorkDone`, so Ready counts). The tracker's week and month views count the whole current month instead of only the items with a task.
- **Blocked work waits:** a Staff task whose earlier step is still open, or hidden and not confirmed done by the server (`workflowDependenciesReady`), shows "Waiting on: {step}" instead of Start work. It sorts last and never becomes the focus task. One-click Start follows the same rule.
- **HOD assigns first:** an HOD's own hand-out tasks count as needing action, and the focus button reads "Assign to…".
- **Workload label:** the shared employee workload uses the same week signal as the team view (available / balanced / busy / attention).
- **Reports:** on-time rates show "—" when nothing has been tracked yet instead of 0%.
- **Client & project monitor:** each company shows its project PMs as owners rather than "Unassigned".
- **Client step names:** clients see "Client Approval" rather than "8. Client Approval" on the home page and delivery tracker.
- **Send to client:** a PM approving a client-approval step sees "Send to client", since that is what makes the step visible to the client.
- **Staff focus card:** when the next step takes one click (Start work, Send for review), it is the main button, with Open task beside it.
- **Account & Finance home:** lists plans for their clients that end in the next 30 days, soonest first, each linking to the company.
- Not changed: an HOD sees other departments' Staff workload only through project membership, which is a server visibility rule.
