# AiTask client release notes

**Coverage:** the four latest formal releases: v2.1.0 (27 August 2026), v2.0.0 (21 August 2026), v1.6.18 (9 August 2026), and v1.6.16 (2 August 2026).

## v2.1.0 — 27 August 2026

- **A more focused client workspace.** Home, Deliveries, and delivery details make it clearer what needs review and what is coming next.
- **A faster path for team members.** Staff can focus on their next action, then move into the full work queue when they need more context.
- **More dependable everyday work.** Saving, refresh, and retry behaviour better protects work when a connection or update interrupts a task.
- **Stronger privacy for client views.** Client delivery screens show the work relevant to their company while keeping internal delivery detail private.

## v2.0.0 — 21 August 2026

- **Service plans built around each client.** Teams can start from a package, adapt a copy, or create a tailored service scope from scratch.
- **Clearer monthly delivery.** Service cycles and deliverables make it easier to track what is included, completed, and still in progress.
- **More confident reviews.** Delivery work can follow defined steps through internal review and client approval, with a clear history of the outcome.
- **A steadier day-to-day workspace.** Saving and synchronising changes is more resilient, helping teams continue working when changes overlap or a connection is interrupted.

## v1.6.18 — 9 August 2026

- **Team workload at a glance.** Managers can see each team member’s open, overdue, due-soon, review-ready, and recently completed work.
- **Better planning by department.** Workload can be filtered by department and opened into an individual task view when a closer look is needed.
- **Faster task handoffs.** Creating a task for a team member carries the relevant assignment context into the new task.
- **More comfortable on every screen.** Workspace layouts and common task flows were refined for clearer use across desktop and mobile screens.

## v1.6.16 — 2 August 2026

- **A dedicated notification centre.** Assignments, deadlines, feedback, approvals, and workspace updates are now collected in one place.
- **Find the update that matters.** Search and category filters make it easier to focus on the right notifications.
- **Less repeated noise.** Related updates are grouped together, while individual items can still be expanded when detail is useful.
- **Stay in control.** Mark notifications read or unread, clear the full unread list, and open the related work directly from the notification.

---

## Internal audit note — do not include in client copy

### Scope verification

| Release | Formal release commit | Verification basis |
| --- | --- | --- |
| v2.1.0 | Release tag `v2.1.0` | Client/staff workspace, privacy, permissions, and sync recovery; staging and production release gates. |
| v2.0.0 | `6d2348b` | Service-plan, client-workspace, delivery, approval, and sync behavior; release notice and unit coverage. |
| v1.6.18 | `9934dab` | Workload reporting and task-assignment behavior; component and reporting tests. |
| v1.6.16 | `fe7cb19` | Notification-centre behavior and notification tests. |

- Release-boundary integrity check passed with `git diff --check 0722323..6d2348b`.
- Changes committed after `6d2348b` are covered by v2.1.0 and must be deployed from its matching release tag.
- The local quality gate passed 193 tests, typecheck, lint, production build, PWA verification, and local build-provenance verification. The release workflow repeats those checks under the pinned Node.js 22.x and pnpm 10.4.1 toolchain.
- **27 August release update:** v2.1.0 is the required version for the already-deployed post-v2.0.0 workspace changes. Do not announce the release until the live `/build-info.json` reports v2.1.0 and the matching Git commit.
