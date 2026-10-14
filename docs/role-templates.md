# AiTask role templates

This document is the authoritative description of every role template, how
permissions resolve, and which capabilities are deliberately reserved.

## Role model

There are four canonical roles — `Project Manager`, `HOD`, `Staff`, and
`Client`. Boss Koo is the `Project Manager` role with the protected
`isSuperAdmin` flag. Custom roles and per-member overrides resolve at request
time on both the client and the server.

Resolution order (highest first):

1. **Boss Koo** (`isSuperAdmin`) → all permissions.
2. **Per-member override** (`member.permissions` when non-empty) — layered on
   top of the member's custom role so saving an override never silently revokes
   the role's own grants.
3. **Custom-role permissions** (`custom_role.data.permissions`).
4. **Base-role defaults** (`Project Manager` / `HOD` / `Staff` / `Client`).

After resolution, `sanitizeRolePermissions` forces protected keys to `false`
for every non-super-admin and preserves HOD's department boundary.

## Protected (Boss Koo only) keys

`editTasks` · `manageUsers` · `approveRegistrations` · `deleteUsers` ·
`viewProductionReports` · `viewApprovals`

These are hidden from the role/member editors, stripped on save (frontend),
and rejected by the database guards. They are **not delegable**.

## Templates

| Capability | Boss Koo | Project Manager | HOD | Staff | Client |
|---|---|---|---|---|---|
| Page access (Dashboard/Tasks/Calendar/Companies/Reports/Settings) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approvals page (`viewApprovals`) | ✓ | – | – | – | – |
| Task / client visibility | ✓ | portfolio-scoped | dept-scoped | assigned/created | own company |
| Create tasks | ✓ | ✓ | ✓ | ✓ | – |
| Manage created tasks | ✓ | ✓ | ✓ | – | – |
| Add / delete companies (`createClients`/`deleteClients`) | ✓ | ✓ | ✓ | – | – |
| Create projects (`createProjects`) | ✓ | ✓ | – | – | – |
| Service administration (catalog, templates, plans, cycles, prices) | ✓ | ✓ | – | – | – |
| Assigned service clients | ✓ | ✓ | ✓ | ✓ | own company |
| Client review actions | – | – | – | – | ✓ |
| Internal workflow review sign-off | ✓ | responsible portfolio | own department | – | – |
| Protected keys | ✓ | – | – | – | – |

### Project Manager
Full **operational** access to the PM's portfolio: service operations and companies
they own or can reach through visible work. Project
Managers do not receive workspace-wide task/client visibility, account/role
administration, or workspace-wide task editing; those remain with Boss Koo.

### HOD
A Staff-based department lead. Sees and edits work in **their departments**
(tasks and any project carrying those tasks), manages the tasks they create, and
can add/delete companies. It does **not** get workspace-wide visibility or
service-administration rights.

Department oversight grants task editing and commenting. Task deletion requires
the task to be in the HOD's departments, `manageCreatedTasks`, and either creator
ownership or current assignment to the HOD. This matches delegation authority;
past delegation alone does not authorize deletion. The same rule applies to
department-scoped Staff custom roles. Generated workflow steps additionally
remain protected from individual deletion for every role while their cycle is active.

HOD sign-off happens on the internal review task. It requires completed
predecessors and the current review department. Staff assignment or HOD
assignment outside that department does not grant sign-off. Boss Koo retains workspace oversight. Responsible portfolio PMs provide temporary
review cover only for Designer tasks with no configured Designer HOD; other
departments retain HOD review. Approval is 80%, followed by separate PM completion
at 100%. The server binds each decision to the reviewed output versions.
Revisions reopen later steps.
See [the review-gate rollout](workflow-review-gate-2026-10-13.md) for deployment status.

### Staff
Standard employee access: assigned or created work only. No elevation over
other members' work.

### Custom roles
Boss Koo may create roles with any **non-protected** key. A custom role may opt
into **department scoping** ("Limit this role to its departments"), which gives
its members the same department-limited task visibility and editing as HOD.
Per-member overrides layer on top of the chosen role.

## Member role assignment

The Approvals page lets Boss Koo edit the built-in **default roles** (Project Manager, HOD, Staff,
Client), and the member list assigns any of them in one
step via `aitask_update_member_role`:

- **Project Manager** / **Staff** / **HOD** — sets the canonical base role and
  clears any incompatible custom role.
- **Client** — sets base role `Client` and requires a company (stored as
  `client_name`); leaving Client clears the company and departments.
- **Custom role** — sets the member's base role to match the custom role's
  `baseRole` and assigns it.

Role changes are Boss-Koo-only, reset the member's departments (Client uses
`Client`) and permission overrides, and cannot modify the Boss Koo account.

## Server enforcement

- `private.aitask_has_permission` mirrors the frontend resolution order and the
  base-role arrays.
- `private.aitask_role_is_department_scoped` reports whether the caller is HOD
  or holds a department-scoped custom role; `private.aitask_can_view_task` /
  `private.aitask_can_edit_task` apply the department branch.
- `public.aitask_update_member_permissions` persists any non-protected key,
  including `createClients`/`deleteClients`.
- `private.aitask_guard_custom_role_scope` blocks delegation of protected keys
  and preserves the built-in HOD identity and department scope. HOD is a canonical
  `HOD` base role; permission normalization retains its operational boundaries.
- `private.aitask_can_delete_task` separates destructive authority from task editing.
  The shared mutation validator applies it to command and direct-table delete paths.

## Change log of role-template fixes

- Project Manager: server parity for `createClients` / `deleteClients`;
  Project Managers retain portfolio-scoped project control. Approvals access is
  reserved for Boss Koo in the current role model.
- HOD: department-scoped task visibility and editing.
- Custom roles: optional `departmentScoped` flag; member overrides can persist
  `createClients` / `deleteClients`; overrides now layer on the custom role.
- Restored the HOD `manageCreatedTasks` invariant in the custom-role guard.
