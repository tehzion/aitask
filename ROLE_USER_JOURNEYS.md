# Role user journeys

**Review date:** 2026-10-17  
**Role model:** Super Admin is represented by the `isSuperAdmin` Boss Koo account; Project Manager, HOD, and Staff use the base roles in `src/types/index.ts` and permission resolution in `src/lib/access.ts`.

## Shared shell journey

1. The user signs in through `/login`.
2. `PrivateRoute` restores the account and sends password-reset accounts to `/settings`.
3. `Layout` provides the persistent sidebar, top search, theme/language controls, notifications, sync state, skip link, main-content focus, and responsive mobile navigation.
4. `RoleRoute` removes unauthorized route content and renders an access-denied recovery path.
5. Deep pages preserve route state in query parameters where search, filters, periods, or entity IDs matter.
6. Mutating flows use a loading lock, success/error feedback, and retry/restore or draft-recovery paths where the backend can fail.

## Super Admin journey

### Responsibilities

System-wide oversight, member and role administration, company/service configuration, project visibility, reports, and approval of registrations.

### Primary route map

| Route | Goal | Important actions |
| --- | --- | --- |
| `/` | agency/system pulse | inspect operational issues, monthly deliverables, workload, create a task, open filtered work |
| `/tasks` | workspace-wide task control | search/filter, inspect, edit, assign, update status/priority, delete where allowed |
| `/calendar` | scheduling oversight | inspect dates, edit task dates, recover a conflicted date save |
| `/clients` | delivery oversight | search/filter delivery work, open client workspace, create task |
| `/clients/:clientId` | company/service administration | manage service plans, cycles, deliverables, add-ons, activity, client-visible review |
| `/projects` | company/project administration | create/edit/delete companies or projects, preserve ownership scope |
| `/reports` | system reporting | review department/performance charts and summaries |
| `/approvals` | administration workbench | approve/reject registrations, add/delete members, edit departments, role permissions, history |
| `/notifications` | system updates | filter/group/read updates and follow safe destinations |
| `/settings` | account and system setup | profile/password, theme/language, sync diagnostics and recovery |

### Happy path

Dashboard → identify an operational issue → open a filtered task/client view → inspect the record → perform the guarded action → see immediate UI update and toast/status feedback → continue from the same context.

### Risk points and protections

- Destructive member/company/task actions use confirmation dialogs and are disabled while saving.
- Approval and role changes are restricted by `canApproveRegistrations`, `canManageUsers`, and related permissions.
- Sync conflict banners expose retry and restore-saved-data choices instead of silently overwriting work.
- Role configuration sanitizes protected permissions; non-Super Admin users cannot be granted Super Admin-only keys.

## Project Manager journey

### Responsibilities

Coordinate owned portfolio work, create and assign tasks, manage project/company records in scope, monitor delivery, and review team progress.

### Primary route map

| Route | Goal | Important actions |
| --- | --- | --- |
| `/` | portfolio delivery | review owned project/company progress, deadlines, blockers, and recent work |
| `/tasks` | portfolio work | search/filter owned work, create tasks, assign staff, edit permitted tasks, monitor status |
| `/calendar` | portfolio schedule | inspect and update dates in scope, recover a failed save |
| `/clients` | owned delivery tracker | search service/delivery work, open client workspace, create task |
| `/projects` | owned companies/projects | create and maintain portfolio records without widening ownership |
| `/reports` | portfolio reporting | inspect relevant operational metrics |
| `/notifications` | follow-up queue | read assignments, reviews, deadlines, and status changes |
| `/settings` | account settings | profile, password, theme/language, sync recovery |

`/approvals` is intentionally denied for a normal Project Manager; the UI explains that approvals are restricted rather than showing an empty admin screen.

### Happy path

Dashboard → open portfolio work → create or open task → choose project/company and assignee → submit once → receive success and notification → Staff sees the assigned work and the PM sees the updated record.

### Risk points and protections

- Portfolio scope is resolved by canonical client/project IDs with legacy name fallback only for records without IDs.
- Assignee and department choices are filtered before mutation.
- Task, company, and service-plan saves use pending mutation handling with retry/restore paths.

## HOD journey

### Responsibilities

Oversee department work, inspect staff workload, manage department-scoped tasks, review internal submissions, and surface items requiring attention.

### Primary route map

| Route | Goal | Important actions |
| --- | --- | --- |
| `/` | department work | see department queue, workload, due work, and review attention |
| `/tasks` | department tasks | search/filter department work, open task details, delegate/assign permitted work, review status |
| `/calendar` | department schedule | inspect team dates and workload |
| `/clients` | assigned delivery context | inspect department-visible delivery work |
| `/projects` | relevant companies/projects | open scoped project/company context |
| `/reports` | department reporting | review department performance and workload |
| `/notifications` | department actions | follow review, assignment, deadline, and status updates |
| `/settings` | account settings | profile, password, theme/language, sync recovery |

### Happy path

Department dashboard → switch to Department tasks/work → identify a waiting or blocked task → open task focus → make a permitted review/delegation/status action → confirm update and notification → return to the filtered queue without losing context.

### Risk points and protections

- HOD labels are changed to “Department work” and “Department tasks” when department-scoped.
- HOD permissions are sanitized against workspace-wide task/client visibility and service-administration permissions.
- Approvals administration is not exposed to HOD; internal review actions remain task-scoped.

## Staff journey

### Responsibilities

Understand assigned work, update progress/status, submit outputs, ask for help, comment, attach files, and track notifications.

### Primary route map

| Route | Goal | Important actions |
| --- | --- | --- |
| `/` | My work | see assigned queue, upcoming deadlines, progress, and next actions |
| `/tasks` | All work | search/filter visible department/assigned work, inspect task details |
| `/calendar` | Schedule | understand upcoming work and due dates |
| `/clients` | Delivery tracker | inspect assigned client/delivery context |
| `/projects` | Companies | open relevant company/project information when permitted |
| `/reports` | reporting | see reports available to the role |
| `/notifications` | Inbox | follow assignments, deadlines, reviews, feedback, and status updates |
| `/settings` | account | update identity/password/theme/language and resolve sync issues |

### Happy path

My work → open the next assigned task → read status, due date, dependencies, and review guidance → update status or submit output/comment → see saving/awaiting-save feedback → keep working or recover with retry if the connection fails.

### Risk points and protections

- Staff cannot edit ownership or perform management-only actions.
- Output upload state participates in task-sheet exit guards, preventing accidental abandonment.
- Draft recovery and pending-save notices preserve entered content and expose retry/restore choices.
- Relative dates use a local-day subscription so urgency labels refresh across midnight.

## Cross-role handoffs

| Handoff | Source role | Receiving role | Expected confirmation |
| --- | --- | --- | --- |
| Task assignment | Project Manager or HOD | Staff | assignment saved, Staff notification appears, PM/HOD record reflects assignee |
| Work submission | Staff | HOD/Project Manager | output/status saved, review state visible, reviewer notification created |
| Internal review | HOD or permitted reviewer | PM/Super Admin | review decision visible in history and the task remains in the correct workflow state |
| Client-facing review | authorized client/reviewer | PM/HOD/Staff | decision and feedback remain visible without exposing internal-only notes |
| Registration approval | Super Admin | new member | role/departments/onboarding result is clear and account access follows the selected scope |

## Journey quality summary

The role model is intentionally asymmetric: Super Admin has the broadest administration, PM has portfolio scope, HOD has department scope, and Staff has daily-work scope. The interface generally follows that model in navigation labels, route filtering, dashboards, and task visibility. The remaining verification gap is live execution of every happy path and failure path in a warmed browser session.
