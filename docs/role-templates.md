# AiTask role templates

This document is the authoritative description of every role template, how
permissions resolve, and which capabilities are deliberately reserved.

## Role model

There are three base roles — `Admin`, `Staff`, `Client`. **HOD is not a base
role**: it is the protected Staff-based custom role `system-hod`. Custom roles
and per-member overrides resolve at request time on both the client and the
server.

Resolution order (highest first):

1. **Boss Koo** (`isSuperAdmin`) → all permissions.
2. **Per-member override** (`member.permissions` when non-empty) — layered on
   top of the member's custom role so saving an override never silently revokes
   the role's own grants.
3. **Custom-role permissions** (`custom_role.data.permissions`).
4. **Base-role defaults** (`Admin` / `Staff` / `Client`).

After resolution, `sanitizeNonSuperAdminPermissions` forces the five protected
keys to `false` for every non-super-admin.

## Protected (Boss Koo only) keys

`editTasks` · `manageUsers` · `approveRegistrations` · `deleteUsers` ·
`viewProductionReports`

These are hidden from the role/member editors, stripped on save (frontend),
and rejected by the database guards. They are **not delegable**.

## Templates

| Capability | Boss Koo | Admin | HOD (`system-hod`) | Staff | Client |
|---|---|---|---|---|---|
| Page access (Dashboard/Tasks/Calendar/Companies/Reports/Settings) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approvals page (`viewApprovals`) | ✓ | ✓ | – | – | – |
| View all tasks / clients | ✓ | ✓ | dept-scoped | assigned | own company |
| Create tasks | ✓ | ✓ | ✓ | ✓ | – |
| Manage created tasks | ✓ | ✓ | ✓ | – | – |
| Add / delete companies (`createClients`/`deleteClients`) | ✓ | ✓ | ✓ | – | – |
| Create projects (`createProjects`) | ✓ | ✓ | – | – | – |
| Service administration (catalog, templates, plans, cycles, prices) | ✓ | ✓ | – | – | – |
| Assigned service clients | ✓ | ✓ | ✓ | ✓ | own company |
| Client review actions | – | – | – | – | ✓ |
| Protected keys | ✓ | – | – | – | – |

### Admin
Full **operational** access: the entire service and company surface plus the
Approvals page. Account/role administration and workspace-wide task editing stay
with Boss Koo.

### HOD
A Staff-based department lead. Sees and edits work in **their departments**
(tasks and any project carrying those tasks), manages the tasks they create, and
can add/delete companies. It does **not** get workspace-wide visibility or
service-administration rights.

### Staff
Standard employee access: assigned work only (plus work they created when
granted `manageCreatedTasks`). No elevation over other members' work.

### Custom roles
Boss Koo may create roles with any **non-protected** key. A custom role may opt
into **department scoping** ("Limit this role to its departments"), which gives
its members the same department-limited task visibility and editing as HOD.
Per-member overrides layer on top of the chosen role.

## Member role assignment

The Approvals page shows the built-in **default roles** (Admin, HOD, Staff,
Client) as read-only templates, and the member list assigns any of them in one
step via `aitask_update_member_role`:

- **Admin** / **Staff** — sets the base role and clears any custom role.
- **HOD** — sets base role `Staff` plus the protected `system-hod` role.
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
  and preserves the HOD identity (`baseRole=Staff`, `name=HOD`,
  `manageCreatedTasks=true`).

## Change log of role-template fixes

- Admin: added `viewApprovals` and server parity for `createClients` /
  `deleteClients`; Admin can now edit/delete any project server-side.
- HOD: department-scoped task visibility and editing.
- Custom roles: optional `departmentScoped` flag; member overrides can persist
  `createClients` / `deleteClients`; overrides now layer on the custom role.
- Restored the HOD `manageCreatedTasks` invariant in the custom-role guard.
