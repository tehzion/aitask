# AiTask Platform Feature Audit

Audit date: 2026-10-18 (MYT)  
Repository: `tehzion/aitask`  
Branch: `codex/audit-p0p1-2026-10-16`  
Commit inspected: `90279d6`  
Audit mode: read-only product and architecture audit; no product feature implementation or deployment was performed.

## Executive finding

AiTask already has a substantial operational core. The current application contains role-scoped task, project, company, service-plan, service-cycle, deliverable, approval, notification, file, reporting, onboarding, and recovery workflows. The secure Supabase path uses authenticated access, RLS, command RPCs, optimistic concurrency, private Storage, server-owned reminders, scheduled service-cycle generation, and immutable entity-history capture.

The Phase 4–7 brief describes a next layer of operational visibility and repeatability. Most of those capabilities are not absent because of missing screens; they are missing as first-class domain concepts. The most important gaps are:

1. Reusable task templates and recurring standalone tasks are not implemented. Existing workflow templates create frozen service-delivery chains, which is a different capability.
2. There is no centralized, permission-aware Action Centre. Dashboard briefs, role workbenches, and Notifications cover parts of the need but do not provide one actionable queue.
3. Projects have tasks and deadlines but no project-health rules, milestone entity, or timeline/Gantt view.
4. The client workspace exposes current service progress, activity, files, and review actions, but there is no dedicated approval centre or approved-deliverables library.
5. Service-cycle automation is materially implemented for monthly plans, but SLA measurement, configurable renewal reminders, and client-friendly monthly service reports are not first-class features.
6. Reporting is task/due-work focused. It does not yet provide explainable project health, service-level reporting, or validated profitability.
7. Current local UI verification has one confirmed failure: the auto-open onboarding overlay intercepts the mobile navigation action in `e2e/app-smoke.spec.ts`. This is in the current dirty worktree and should be resolved before using that flow as a release gate.

No major architectural change should start until the P0/P1 controls and the backlog below are accepted.

## Scope and method

The audit inspected:

- React Router routes in `src/App.tsx`, navigation, page components, and role-specific workbenches.
- Zustand state/actions, domain types, access selectors, notification selectors, service-management helpers, and task-reporting calculations.
- Supabase baseline schema, all versioned migrations, RLS policies, command/service RPCs, Storage policies, pg_cron definitions, and database tests.
- Existing unit/component, Playwright, and database-test inventories.
- Existing audit, release, security, deployment, and handover documents. Several are historical and contain stale counts or contradictory release conclusions; that documentation drift is itself a release-control finding.

The worktree was already dirty when the audit started. Existing user changes were preserved and not reset or overwritten.

## Architecture observed

```text
React/Vite routes and role-specific workbenches
        |
        v
Zustand workspace store and optimistic action/recovery state
        |
        +--> local/demo mode (browser state and local service-cycle catch-up)
        |
        +--> secure Supabase mode
              |
              +--> Authenticated Auth session
              +--> RLS-protected workspace/member/entity tables
              +--> command and service RPCs with versions/idempotency
              +--> pg_cron service-cycle and deadline-reminder jobs
              +--> private client-service-files Storage bucket
              +--> client portal projection and restricted file access
              +--> audit events and immutable entity history
```

The secure backend uses a polymorphic `public.aitask_entities` table with JSONB payloads and typed `entity_type` values. Service entities are added through migrations rather than separate relational tables. This preserves the existing sync protocol, but concentrates integrity and authorization in migration order, triggers, helper functions, and RPCs.

## Feature audit

Status meanings: **Implemented** means a usable path exists in the current code; **Partial** means a meaningful slice exists but the requested capability is incomplete; **Missing** means no first-class implementation was found.

| Feature | Current status | Identified gap | Recommendation | Priority |
| --- | --- | --- | --- | --- |
| Dashboard | Implemented / Partial | `Dashboard`, `OperationsGlance`, `ServiceRoleDashboard`, and `TeamWorkload` provide role-specific metrics and queues. There is no unified action queue or project-health surface. | Reuse the existing selectors and workbenches to build Action Centre and health summaries instead of replacing dashboards. | P1 |
| Company management | Implemented / Partial | Client profiles, ownership, company/project monitor, and scoped client workspace exist. Lifecycle/archive semantics are not a dedicated capability. | Define archive/deactivation policy before adding lifecycle UI; preserve existing ownership and deletion guards. | P1 |
| Client management | Implemented / Partial | CRUD, ownership, client portal projection, service plans, cycles, comments, and files exist. A client approval centre and final approved-files library are absent. | Add read models over existing deliverables, approvals, and Storage references with strict client projection rules. | P1 |
| Project management | Partial | Project CRUD and task/project association exist, but a project is mostly a record plus deadline; no milestones, health rules, or timeline. | Add project health and milestones as additive entities/read models first. | P1 |
| Task management | Implemented / Partial | Table/board/list views, create/edit, filters, assignment, delegation, statuses, attachments, review, revision, dependencies for generated workflows, and recovery exist. Standalone templates, estimated duration, and recurring-task configuration do not. | Add task-template and recurrence models without changing current task transitions. | P1 |
| Department management | Partial | Department values, multi-department members, custom roles, department-scoped visibility, and task department checks exist. There is no department work queue/reporting model beyond derived task counts. | Reuse `taskReporting.ts` for department reporting; do not represent counts as employee productivity. | P1 |
| Staff assignment | Implemented | Assignment eligibility, role checks, reassignment restrictions, HOD handoff, notifications, and server guards exist. | Keep assignment mutations behind existing command/RLS paths; add Action Centre entries for unassigned work. | P1 |
| Task delegation | Implemented | HOD/manager delegation UI and workload-aware assignee choices exist in task details. | Add audit-visible delegation events to the central activity projection and Action Centre. | P2 |
| Approval and revision workflows | Implemented / Partial | Internal review gates, client approval/revision, evidence rules, approval history, and task work history exist. Queues are distributed across dashboards, task pages, and notifications. | Build centralized approval queues from existing task/deliverable projections; preserve current transitions. | P1 |
| Service plans | Implemented / Partial | Packages, frozen plan revisions, pricing snapshots, dates, billing day, contract end, add-ons, and permissions exist. Service templates do not model delivery frequency, expected turnaround, or optional limits as explicit reusable fields. | Extend service-package metadata additively or introduce a service-template layer only after agreeing on the distinction from packages. | P1 |
| Delivery cycles | Implemented | Monthly cycle generation, deliverable creation, scheduled plan revisions, status transitions, completion derivation, idempotency checks, audit events, and pg_cron definitions exist. | Add operational run status/failure visibility and renewal/reminder policy; do not create a second generator. | P1 |
| Notifications | Implemented / Partial | Notification feed, unread/read state, recipient deduplication, rate limits, server deadline reminders, and user-facing inbox exist. Notifications do not equal an actionable work queue. | Extend notification metadata/selectors for Action Centre; avoid creating a parallel notification store. | P1 |
| Reports | Implemented / Partial | Four-week due-work report, weekly trend chart, department performance table, client timing view, and CSV export exist. No project health, SLA, client-service summary, or validated profitability report exists. | Add report read models and filters incrementally; make missing data explicit. | P1 |
| File management | Implemented / Partial | Private Storage, upload reconciliation, type/size validation, client projection, and client-visible file rules exist. There is no dedicated final-deliverables library organized by approval date/version. | Build the library from approved deliverable attachments and existing secure download paths. | P1 |
| Calendar | Implemented / Partial | Calendar and due-date views exist with task filtering. There is no project timeline or milestone visualization, and no proven mobile equivalent for a Gantt view. | Start with a lightweight task/milestone timeline plus mobile list view; avoid a heavy Gantt dependency. | P2 |
| User roles and permissions | Implemented / Security-sensitive | Base/custom roles, permission keys, department scope, server guards, RLS, client projections, and many negative tests exist. Effective behavior depends on the full migration chain and live deployment state. | Publish one authoritative live release manifest and run a disposable/live-read-only authorization matrix before new tables. | P0 |
| System administration | Implemented / Partial | Settings, member lifecycle, role administration, onboarding/tutorials, release notices, sync/recovery state, and feedback administration exist. Threshold configuration, job run visibility, and full operational audit administration are absent. | Add narrowly scoped admin controls only after thresholds and retention semantics are approved. | P1 |

## Requested capability verification

| Capability from brief | Evidence found | Assessment |
| --- | --- | --- |
| Task templates | `ServiceWorkflowTemplate`, `WorkflowTemplateManager`, frozen workflow snapshots, and `generateDeliverableTaskChain` exist. | **Partial, not a standalone task-template feature.** No reusable single/multi-task template with preview, relative deadline, estimated duration, or duplicate-generation guard exists. |
| Recurring tasks | `Task.isRecurring` and `recurrenceFrequency` are accepted/sanitized; `CreateTaskModal` currently writes `false`/`None`. Monthly service-plan cycle generation is separate. | **Partial data shape only.** No weekly/monthly/custom standalone recurrence record, pause/resume, timezone, occurrence ledger, or task-occurrence UI exists. |
| Action Centre | Dashboard cards, role workbenches, `getNeedsAttentionTasks`, and Notifications expose fragments. | **Missing as a central page/read model.** Build from actionable selectors and existing notification metadata. |
| Project health | No project-health implementation or health threshold model found. | **Missing.** Use explainable counts/reasons; do not introduce an arbitrary AI score. |
| Workload management | `TeamWorkload`, `taskReporting.ts`, person/department views, overdue/waiting-review counts, and non-performance-score labels exist. | **Implemented for task-count visibility; partial for requested workload.** No duration estimates, capacity model, or hours reporting exists. |
| Project milestones | Task progress/workflow milestones exist conceptually, but no project milestone entity or owner/target-date UI exists. | **Missing as a project feature.** Add an additive milestone model linked to projects/tasks. |
| Project timeline/Gantt | Task calendar and date filters exist; no Gantt/timeline code was found. | **Missing.** Prefer a lightweight desktop timeline and mobile agenda/list. |
| Client approval centre | Client workspace and task-level review controls exist; `ClientDeliveries` groups delivery stages. | **Partial.** Add a central review queue and revision-history view while retaining current approval rules. |
| Final deliverables library | Approved/client-visible deliverables and secure files are available through service workspaces/activity. | **Partial.** Add an approved-only library with version/approval metadata. |
| Service templates | `ServicePackage` and `ServiceWorkflowTemplate` provide reusable package/workflow structures. | **Partial.** Missing explicit service frequency, turnaround, responsible department, and optional service limits as a coherent template contract. |
| Automated service cycles | Local catch-up and database pg_cron generator create monthly cycles/deliverables with conflict-safe inserts and audit entries. | **Implemented for monthly service plans; partial for operational observability and failure handling.** |
| Renewal reminders | Dashboard shows active plans ending within 30 days; no configurable 30/14/7 reminder ledger was found. | **Partial.** Add server-owned, idempotent renewal reminder claims. |
| SLA/delivery tracking | Due-work and client timing reports exist. No SLA definition or separation of internal/client-wait time exists. | **Missing.** Add opt-in SLA policy and event timestamps before reporting SLA performance. |
| Monthly service reports | Client/service dashboards expose cycles, deliverables, activity, and CSV task reporting. | **Partial.** No generated client-friendly monthly summary in English/Simplified Chinese based on a defined report period. |
| Operational/department/client reporting | Dashboard and Reports provide task and due-work metrics; service role dashboard provides plan/delivery cards. | **Partial.** Add company/date filters and service report read models; avoid employee ranking by completion count. |
| Financial reporting | MYR service pricing snapshots and package totals exist, but no labour cost, actual cost, revenue recognition, or margin model exists. | **Feasibility only.** Do not display profitability until cost/revenue sources are defined and validated. |

## Security and data-integrity findings

### Controls confirmed in source

- `public.aitask_workspaces`, `aitask_members`, and `aitask_entities` use RLS in the secure schema.
- Service and workflow entity types are added through versioned migrations and command/RPC authorization checks.
- Client portal data is projected through dedicated server functions rather than exposing internal task fields wholesale.
- Client-service Storage is private, size/type restricted, and guarded by workspace/client/cycle checks.
- Task workflow identity, review evidence, deliverable readiness, and status transitions are guarded by database triggers and local counterparts.
- Server deadline reminders and service-cycle generation use service-role-only functions, pg_cron, claims/uniqueness guards, and audit entries.
- `aitask_entity_history` captures before/after data in the same transaction and has append-only protections; the latest retention follow-up avoids cascading away historical evidence.
- No product runtime use of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` was found by the existing security review.

### Risks or verification boundaries

- The polymorphic JSONB entity model does not provide ordinary foreign keys for all business relationships. New Phase 4–7 entities must use server-side validators, parent-scope checks, and explicit RLS/command tests.
- Security correctness is migration-order dependent. Historical reports reference different migration/test counts and disagree on production readiness. The current local chain contains 116 non-empty migrations; live state was not re-verified in this audit.
- `SECURITY DEFINER` functions are appropriate in the current architecture but must remain private/revoked or explicitly scoped. Every new privileged function needs fixed `search_path`, `auth.uid()`/workspace checks where relevant, least-privilege grants, and an advisor/pgTAP review.
- No live Supabase verifier or production mutation was run. Live RLS, RPC definitions, Storage policies, cron jobs, Auth settings, and Edge Function versions remain unverified here.
- New reporting queries must be scoped by workspace/company/client before aggregation; do not rely on frontend filtering for isolation.

## UX and localization findings

- Navigation is role-aware and mobile-aware, with route guards, responsive task/delivery views, focus management, empty states, loading states, confirmation dialogs, and English/Simplified Chinese dictionaries.
- Current focused Playwright result: `e2e/accessibility.spec.ts` passed; `e2e/app-smoke.spec.ts` failed at the mobile “Open more destinations” action because `OnboardingExperience` remains pointer-interactive over the navigation after auto-opening.
- The existing design has two overlapping attention surfaces—dashboard/workbench queues and Notifications. Action Centre should unify actionable selectors and deep links, not add a third notification transport.
- Workload UI correctly labels its signal as not a performance score and reports counts, not hours. Keep that constraint until task duration/capacity data is reliable.
- Translation coverage verification is green, but new feature work must add both English and Simplified Chinese copy and avoid translating user-entered names, client content, or task titles.

## Verification performed

| Check | Result | Evidence / boundary |
| --- | --- | --- |
| `pnpm check` | Passed | TypeScript project build with `--noEmit`. |
| `pnpm lint` | Passed | ESLint completed without findings. |
| `pnpm test -- --maxWorkers=1 --reporter=dot` | Passed | 111 test files / 845 tests. |
| `pnpm verify:migrations` | Passed | 116 non-empty SQL migrations. |
| `pnpm verify:i18n` | Passed | 0 findings across 180 source files. |
| `pnpm build` | Passed with warning | 2,826 modules; `workspaceRuntime` 553.88 kB minified / 161.70 kB gzip; PWA generated. |
| Focused Playwright: accessibility + app smoke | 1 passed / 1 failed | Accessibility passed. App smoke failed on onboarding overlay pointer interception at `e2e/app-smoke.spec.ts:803`. |
| Full Playwright suite | Not run | The focused failure should be resolved first. |
| Live Supabase verifier / production RLS | Not run | Deliberately outside this non-mutating audit; requires authorized environment. |
| Disposable database/pgTAP suite | Not run | Existing SQL tests were inspected; no new schema was introduced in this audit. |

## Audit decision

Proceed to backlog review and a narrow P0/P1 stabilization pass. Defer new database entities until:

1. Release/deployment documentation has one authoritative source of truth.
2. The onboarding overlay regression is fixed or explicitly waived with a test update.
3. The first implementation slice has accepted security/read-model boundaries and migration rollback/recovery criteria.

