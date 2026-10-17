# Role × Module × Action × Data Access Matrix — AiTask

**Date:** 2026-10-17 · **Source of truth:** `src/lib/access.ts` (frontend authz core) + `supabase/migrations/*` `aitask_has_permission` / `aitask_can_view_task` / `aitask_can_mutate_entity` (backend authz) + `src/lib/departments.ts` (department scoping).
**Roles:** Super Admin (`isSuperAdmin` = "Boss Koo"), Project Manager, HOD, Staff. (Client exists but is out of scope for this four-role review.)

---

## 1. Role model & hierarchy

| | Super Admin | Project Manager | HOD | Staff |
| --- | --- | --- | --- | --- |
| Identity | `user.isSuperAdmin === true` | `user.role === 'Project Manager'` | `user.role === 'HOD'` or `customRoleId === 'builtin-hod'` | `user.role === 'Staff'` |
| Scope | Unrestricted (whole workspace) | Portfolio (owned clients/projects/tasks + assigned) | Department (`departments[]`) | Assigned + created tasks |
| Bypass helper | `isBossKoo(user)` → `true` for every `can*` | `isTaskInOwnedPortfolio`, `ownedClientIds/Keys`, `ownedProjectIds` | `isDepartmentScopedUser`, `isMemberInDepartment` | `task.assignedTo/createdBy === user.id` |

There is **no implicit "higher role sees everything"** rule — Super Admin is the only unrestricted role, and it is an explicit `isSuperAdmin` flag, not inferred from hierarchy.

## 2. Default permission sets (`access.ts:216-271`)

| Permission | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| Page access (`viewDashboard/Tasks/Calendar/Projects/DeliveryTracker/Reports/Settings`) | ✓ | ✓ | ✓ | ✓ |
| `viewAllTasks` / `viewAllClients` | ✓ (implicit) | ✗ (portfolio-scoped) | ✗ | ✗ |
| `createTasks` / `manageCreatedTasks` | ✓ | ✓ | ✓ | `createTasks` only |
| `createProjects` / `createClients` / `deleteClients` | ✓ | ✓ | `createClients`/`deleteClients` | ✗ |
| `manageServiceCatalog` / `manageTaskTemplates` / `manageClientPlans` / `manageServiceCycles` | ✓ | ✓ | ✗ | ✗ |
| `viewServicePrices` | ✓ | ✓ | ✗ | ✗ |
| `viewAssignedServiceClients` | ✓ | ✗ | ✓ | ✓ |
| `manageUsers` / `approveRegistrations` / `deleteUsers` / `viewApprovals` / `editTasks` / `viewProductionReports` | ✓ | ✗ (stripped by `sanitizeNonSuperAdminPermissions`) | ✗ | ✗ |

## 3. Data access by module

| Data | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| Tasks view (`canViewTask`) | All | assigned + created + owned-client + owned-project | assigned + created + department | assigned + created |
| Tasks edit (`canEditTask`) | All | assigned + created + owned-portfolio | assigned + created + department | assigned + created |
| Tasks delete (`canDeleteTask`) | All | creator or owned-portfolio (NOT transient delegation) | department (with delegation authority) | only open (not Waiting Approval/Approved/Completed), creator/assigned |
| Clients view (`getVisibleClientNames`) | All | owned + visible-work | visible-work (assigned) | visible-work (assigned) |
| Clients edit/delete | All | own profile or task-linked | own-assigned only | own-assigned only |
| Projects (`canEditProject`/`canDeleteProject`) | All | `createdBy === user.id` | via department work | via assignment |
| Service plans/cycles/packages/prices | All | All (portfolio-scoped via `isServiceClientInScope`) | ✗ | ✗ |

## 4. Actions by module

| Action | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| Create task | ✓ | ✓ | ✓ | ✓ (own dept) |
| Assign/reassign | ✓ | ✓ (portfolio) | ✓ (dept, HOD-first rule) | ✗ |
| Approve internal review (`canApproveTaskInternally`) | ✓ (Boss Koo) | ✓ (as configured reviewer) | ✓ (dept reviewer) | ✗ |
| Request revision (`canRequestTaskRevision`) | ✓ | responsible PM only | dept reviewer | ✗ |
| Complete task | ✓ | responsible PM | ✗ | ✗ |
| Manage review config (`canManageTaskReview`) | ✓ | responsible PM | ✗ | ✗ |
| Manage users / approve registrations / delete users | ✓ | ✗ | ✗ | ✗ |
| Manage service catalog/plans/cycles/prices | ✓ | ✓ (portfolio) | ✗ | ✗ |
| Upload/download output | ✓ | ✓ | ✓ | ✓ (own assigned, deliverable-linked) |

## 5. Verification matrix

Legend: **P** = Pass (unit test executed) · **S** = Pass (source-reviewed, no runtime test) · **NA** = Not applicable · **NV** = Not verified (needs live env).

| Feature | Super Admin | PM | HOD | Staff |
| --- | --- | --- | --- | --- |
| Login & Session | S (auth tests) | S | S | S |
| Dashboard Data | S (`dashboardData.test.ts` 21) | S (`pmDashboard.test.ts`) | S (`hodPermissionParity.test.ts` 12) | S (`staffDashboard.test.ts` 14) |
| Project Visibility | P | P (`accessPmScope.test.ts` 8) | P | P |
| Task Visibility | P (`access.test.ts` 40) | P | P | P |
| Create / Edit Actions | P | P | P | P |
| Approval Workflow | P (`taskWorkflowAccess.test.ts`) | P | P | NA |
| Notifications | P (`notificationCenter/Popups/Reads/Presentation`) | P | P | P |
| Reporting | S | S | S | S |
| Data Permissions (RLS/RPC) | NV | NV | NV | NV |
| Cross-Role Updates | P (`deliveryTaskLinks`, `taskStageProgress`, `staffWorkflow` tests) | P | P | P |

Full regression: `pnpm test` → **105 files / 812 tests pass**. Supabase RLS/RPC role enforcement is **Not Verified** against a live project in this session (source + `migration_repair_manifest.review.json` live-verification evidence only).
