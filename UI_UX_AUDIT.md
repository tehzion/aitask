# AiTask UI/UX audit

**Review date:** 2026-10-17 (Asia/Kuala Lumpur)  
**Scope:** Super Admin, Project Manager, HOD, and Staff authenticated experiences.  
**Out of scope:** production data changes, security-policy changes, deployment, and the Client/public feedback experience except where shared shell behavior affects internal users.

## Executive result

No new P0 data-loss, misleading-success, or critical permission UX defect was confirmed in the source review. The application already has strong interaction safeguards: scoped route access, unsaved-change protection, draft recovery, retry/restore paths, modal focus trapping, role-specific navigation, and responsive shell behavior.

The action lifecycle pass implemented targeted P2 improvements in the shared feedback and modal layers:

- busy `Button` instances now use a wait cursor when disabled and marked `aria-busy`;
- confirmation actions expose their busy state to assistive technology;
- toast messages are announced atomically and decorative icons are hidden from the accessibility tree.
- success, warning, and error feedback uses differentiated visibility windows and repeated identical feedback is de-duplicated;
- common Cancel/Close/Back controls no longer mark modal drafts dirty through the shared capture handler;
- remaining raw confirmations for upload cleanup and invalid delivery-link removal now use the accessible `ConfirmDialog` primitive.

The result is conditionally ready from a UX code perspective. Focused browser checks pass on the warmed local runner; the complete route matrix remains outstanding because it exceeds the local runner budget. Existing repository evidence documents a prior successful responsive/Axe matrix; that evidence is clearly separated from checks executed in this review in [UI_UX_REGRESSION_REPORT.md](./UI_UX_REGRESSION_REPORT.md).

## Method and evidence

The audit used:

1. route, navigation, permission, component, and action-lifecycle inspection;
2. targeted UX guidance searches for error recovery, focus, form feedback, responsive tables, navigation state, and React interaction testing;
3. the existing role/route Playwright harness and its accessible queries;
4. current static checks and a focused credential test;
5. prior audit evidence already committed in `docs/ui-ux-audit-responsive-2026-09-18.md`, `docs/dashboard-followthrough-audit-2026-10-07.md`, and `docs/REGRESSION_TEST_REPORT.md`.

The application route contract is defined in `src/App.tsx:175-199`. Shared navigation and role labels are defined in `src/lib/navigation.ts:96-160`, while permission enforcement is centralized in `src/lib/access.ts` and applied through `RoleRoute` in `src/App.tsx:46-70`.

## Application surface map

| Surface | Primary user need | Shared actions and states |
| --- | --- | --- |
| Dashboard `/` | See the most important work for the current role | KPI cards, role-specific work queues, deep links, create-task entry points, loading/empty/error states |
| Tasks `/tasks` | Find, filter, inspect, assign, update, and review work | Search, filters, pagination/board views, task details, status, priority, assignee, comments, files, retry/recovery |
| Calendar `/calendar` | Understand dates and workload | date navigation, task date editing, unsaved draft protection, retry/restore after save conflict |
| Delivery tracker `/clients` | Monitor client/company delivery work | search, service/date/status filters, delivery links, task focus, review actions |
| Company/service workspace `/clients/:clientId` | Manage a scoped company’s plans, cycles, deliverables, and activity | tabs, plan/add-on/activity forms, uploads, client-visible review, recovery and history |
| Companies `/projects` | Manage companies/projects and ownership | create/edit/delete, project links, ownership-scoped visibility |
| Reports `/reports` | Review operational performance | charts, summaries, empty data states, production/dept views gated by permission |
| Approvals `/approvals` | Administer registrations, members, roles, and history | approval/rejection, role/dept/permission editing, confirmation, retry, history |
| Notifications `/notifications` | Read, filter, group, and follow up on updates | all/unread tabs, category filter, search, mark read/unread/all, safe destination links |
| Settings `/settings` | Maintain identity, password, theme, language, sync, and system configuration | profile/password forms, avatar upload, theme/language, backend status, recovery |
| Public/auth `/login`, `/account/password`, `/feedback` | enter or recover the workspace | labelled forms, loading/error states, password setup gate, public feedback flow |

## Findings by priority

### P0 — Critical

| ID | Finding | Result |
| --- | --- | --- |
| P0-01 | No new data-loss or misleading-success defect was confirmed in this pass. | No change required. Existing draft recovery and unsaved-change guards remain in place. |
| P0-02 | No new permission exposure was confirmed in the UI route/action layer. | No change required. Route visibility and action permissions remain role-scoped. |

### P1 — High

| ID | Finding | Result |
| --- | --- | --- |
| P1-01 | The complete 5-role × 4-mobile-viewport route matrix was not completed within the local runner budget. Focused role-access and password-setup browser checks pass after the harness wait was made deterministic. | Not a confirmed product defect. Re-run the complete matrix in CI or a warmed production preview before release. |
| P1-02 | Live Supabase/RLS verification and the two pending production migrations are outside this local UX pass. | Deployment gate remains conditional; see existing remediation handover and regression report. |

### P2 — Medium

| ID | Finding | Result |
| --- | --- | --- |
| P2-01 | Busy feedback was not fully standardized at the shared button layer. Some callers supplied saving copy, but the shared primitive did not add a wait cursor, and `ConfirmDialog` did not expose `aria-busy`. | **Fixed** in `src/components/ui.tsx:33-48` and `src/components/ConfirmDialog.tsx:46-50`. |
| P2-02 | Toast announcements could be read as separate icon/content nodes, and the live region was not explicitly atomic. | **Fixed** in `src/components/Toast.tsx:28-46`. |
| P2-03 | Identical completion messages could stack, and all toast types shared a short three-second lifetime. | **Fixed** in `src/store/useToastStore.ts:14-64` with type-specific TTLs and duplicate suppression. |
| P2-04 | Button clicks inside modal editors could mark a draft dirty even when the button only cancelled, closed, navigated, or restored. | **Fixed** in `src/components/ModalShell.tsx:148-161` with explicit non-draft control handling. |
| P2-05 | Upload cleanup and invalid delivery-link removal used native browser confirmations without the shared focus/busy behavior. | **Fixed** in `src/components/UploadRecoveryPanel.tsx` and `src/components/DeliveryReviewPanel.tsx` with `ConfirmDialog`. |
| P2-06 | A complete action-by-action live browser sweep is not reproducible in this local run. | Remains a verification gap, not a confirmed product defect. |

### P3 — Low

| ID | Finding | Result |
| --- | --- | --- |
| P3-01 | The workspace contains a large, mature component surface with some legacy Tailwind class variants alongside semantic tokens. | Preserve existing behavior; continue incremental cleanup only when touching a component. |
| P3-02 | Existing browser output warns that `caniuse-lite` is six months old. | Maintenance task; does not block the UI audit. |

## Role-based verification matrix

`Pass` means supported by current source plus prior repository evidence or a completed focused check. `Not Verified` means the behavior is plausible or source-covered but was not completed in the current live browser pass. `Not Applicable` means the role is intentionally not granted that capability.

| UX area | Super Admin | Project Manager | HOD | Staff |
| --- | --- | --- | --- | --- |
| Navigation | Pass — role-filtered sidebar/mobile nav | Pass — portfolio-scoped nav | Pass — department labels and scoped nav | Pass — My work / All work nav |
| Dashboard | Pass — system/agency pulse and admin actions | Pass — portfolio delivery view | Pass — department work view | Pass — assigned queue view |
| Forms | Not Verified — source has labels, guards, errors | Not Verified — source has labels, guards, errors | Not Verified — source has labels, guards, errors | Not Verified — source has labels, guards, errors |
| CRUD actions | Not Verified — source guarded and recoverable | Not Verified — portfolio-scoped | Not Verified — department-scoped | Not Verified — assigned/created scope |
| Task workflows | Not Verified — source and unit coverage | Not Verified — assignment/portfolio paths | Not Verified — department review paths | Not Verified — status/submission paths |
| Approvals | Pass — Boss-only admin workbench is implemented | N/A — intentionally restricted | N/A — intentionally restricted | N/A — intentionally restricted |
| Notifications | Pass — unread count, grouping, destinations, read actions | Pass — same shared center | Pass — same shared center | Pass — same shared center |
| Error feedback | Pass — role-independent shared messages/recovery | Pass — shared | Pass — shared | Pass — shared |
| Loading states | Pass — shared loading/sync primitives; P2 patch applied | Pass | Pass | Pass |
| Responsive design | Pass — prior responsive matrix and overflow evidence | Pass | Pass | Pass |
| Accessibility | Pass — prior Axe evidence, semantic labels, focus management; P2 patch applied | Pass | Pass | Pass |

## Release recommendation

Do not deploy from this review alone. The UX implementation is focused and low risk, but release sign-off still requires:

- a warmed production preview or CI browser run across all four roles;
- current build verification;
- the documented Supabase migration/RLS gate and approval for any production rollout.

No production data, Supabase policy, or deployment was changed by this audit.
