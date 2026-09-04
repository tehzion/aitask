# AiTask client release notes

**Coverage:** the latest client releases: v2.1.4 (4 September 2026), v2.1.3 (3 September 2026), v2.1.2 (2 September 2026), and v2.1.1 (27 August 2026). v2.1.0 was a superseded release candidate and was not announced as a deployed client release.

## v2.1.4 — 4 September 2026

- **Reliable Staff progress updates.** Completing assigned deliverables now updates the related service cycle reliably, including the date recorded with the automatic cycle transition.
- **The same safe role boundaries.** Staff can continue updating delivery progress without gaining access to publish cycles manually or change unrelated client-service details.
- **Production database alignment.** The Staff protection introduced in v2.1.3 is now fully aligned in the live service, with existing client and business data preserved.

## v2.1.3 — 3 September 2026

- **Safer permissions for staff work.** The agency, its staff, and its reviewers keep a clearer boundary: staff can create and update work within their own assignments, and service delivery records accept only execution changes staff are allowed to make.
- **Trusted, task-linked notifications.** When work moves, the notification is linked to that task so staff see only relevant updates and unrelated notices are blocked.

## v2.1.2 — 2 September 2026

- **More dependable saving.** Client setup, companies, tasks, schedules, and shared retry controls now follow the same reliable save process.
- **Safer recovery after an interruption.** AiTask resumes the same pending change without creating duplicate client, plan, company, or task work.
- **Clearer action when something fails.** The original save error stays visible so users know what needs attention.

## v2.1.1 — 27 August 2026

- **A more focused client workspace.** Home, Deliveries, and delivery details make it clearer what needs review and what is coming next.
- **A faster path for every role.** Administrative, operations, production, account, and client teams now have clearer role-focused workspaces, with improved mobile use and broader Simplified Chinese coverage.
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
| v2.1.4 | Release tag `v2.1.4` | Staff cycle-progress correction, complete Staff authorization rollout, immutable forward migrations, production data-integrity checks, and exact deployment provenance; authenticated staging QA waived by the exact one-time direct-production gate. |
| v2.1.3 | Release tag `v2.1.3` | Staff command authorization, canonical task-linked notifications, service-catalog flows, Boss deliverables, registration approval, and Chinese coverage. |
| v2.1.2 | Release tag `v2.1.2` | Shared save/retry recovery, typed resubmission, original-error preservation, and production provenance; staging QA waived by one-time direct-production gate. |
| v2.1.1 | Release tag `v2.1.1` | Client and role workspaces, privacy, permissions, sync recovery, mobile polish, and Chinese coverage; one-time direct-production verification gate. |
| v2.0.0 | `6d2348b` | Service-plan, client-workspace, delivery, approval, and sync behavior; release notice and unit coverage. |
| v1.6.18 | `9934dab` | Workload reporting and task-assignment behavior; component and reporting tests. |

- Release-boundary integrity check passed with `git diff --check 0722323..6d2348b`.
- Changes committed after `6d2348b` are covered by v2.1.1. The immutable v2.1.0 candidate at `5cdcfb7` was superseded after its deployment gate stopped before production.
- The v2.1.2 source gate includes 194 tests, typecheck, lint, production build, PWA verification, local build provenance, disposable Supabase/pgTAP validation, and live production verification. The release workflow repeats those checks under the pinned Node.js 22.x and pnpm 10.4.1 toolchain.
- **27 August one-time release waiver:** authenticated staging-role QA is waived for v2.1.1 only. No production-authenticated test and no database migration are performed.
- **2 September one-time release waiver:** authenticated staging-role QA is waived for v2.1.2 only because the isolated staging environment was not yet provisioned. No database migration and no authenticated production test are performed; the release is verified against live production provenance after the Vercel Git integration deploys `master`. The exception does not apply to any later tag.
- **3 September one-time release waiver:** authenticated staging-role QA is waived for v2.1.3 for the same reason. v2.1.3 includes the staff command authorization migration, which is validated by the disposable-stack pgTAP gate before release; no authenticated production test is performed. The exception does not apply to any later tag.
- **4 September one-time release waiver:** authenticated staging-role QA is waived for v2.1.4 only. The two forward migrations are backed up, applied, and verified before the tag is created; no authenticated production test or business-data transformation is performed. Every later tag remains blocked on isolated staging.
- Do not announce v2.1.4 until the production migration history is aligned and live `/build-info.json` reports v2.1.4 with the exact `v2.1.4` tag commit.
