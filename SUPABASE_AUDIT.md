# AiTask Supabase Audit

Audit date: 2026-10-17
Scope: schema, RLS, grants, RPCs, Auth integration, Storage, Realtime, Edge Functions, migrations, and data consistency

## Verification boundary

This report is primarily source and local-test based. I did not run `pnpm verify:supabase`: its script includes an anonymous write probe, and this audit was explicitly non-mutating. No production data, schema, RLS policy, Auth user, Storage object, or Edge Function was changed.

The repository contains conflicting deployment narratives. Therefore every live-state conclusion is marked **unverified** until a read-only check is run against the intended project.

## Data model

### Core tables

| Object | Purpose | Key controls |
| --- | --- | --- |
| `public.aitask_workspaces` | Workspace revision/protocol anchor | PK, version, sync protocol version |
| `public.aitask_members` | Workspace members linked to `auth.users` | Workspace FK, unique Auth link, role/departments checks, version, guarded updates |
| `public.aitask_entities` | Typed workspace entities and JSONB payloads | Composite PK `(workspace_id, entity_type, entity_id)`, entity-type check, parent/client/assignee/creator denormalization, version |
| `public.aitask_command_receipts` | Idempotency and replay results | Actor/workspace/command identity used by RPCs |
| `public.aitask_feedback_submissions` | Public feedback campaign data | Length/check constraints, campaign/email uniqueness, RLS, service-role-only data access |
| private helper/reconciliation tables | Rate limits, onboarding, abandoned uploads, audit/receipt state | RLS/revoked direct access; security-definer functions |

The polymorphic entity model is operationally coherent but shifts integrity into triggers, RPCs, JSON shape validation, and migration order. High-value references such as task/project/client/cycle relationships should have explicit contract tests and, where practical, relational constraints or generated columns.

## RLS, grants, and authorization

### Positive controls found

- Application tables have RLS enabled in the secure schema/migration chain.
- Direct authenticated writes are narrowed; normal state changes use command/service RPCs.
- Security-definer helpers use empty `search_path` in the inspected secure migrations.
- Entity guards reject secret-like JSON keys and maintain denormalized authorization metadata.
- Client portal reads use a separate projection and strip internal fields/prices.
- Service files use a private bucket and authorization predicates based on workspace, client, cycle, role, and assignment.
- The latest PM ownership migration adds explicit scope checks to service RPC create/update/delete paths and a restrictive ownership trigger.

### High-risk dependency

The base `secure-auth-schema.sql` contains broad Project Manager defaults for task/client/project visibility and permissions. The repository documents that this file must be followed by the entire migration chain. The latest ownership and department-scope migrations are not optional hardening; they are required for the intended authorization model.

**Status:** source patch present; live application unverified.

### Required live read-only checks

Run against the intended project using a read-only connector or service owner procedure:

1. Confirm all repository migrations are represented in `supabase_migrations.schema_migrations`, including the two critical scope migrations and task-notification cleanup.
2. Compare `pg_get_functiondef` for all command/service RPC overloads to the committed definitions.
3. Confirm RLS is enabled on every application and private helper table.
4. Confirm anonymous execution is revoked for command/service RPCs and feedback data tables.
5. Confirm authenticated direct INSERT/UPDATE/DELETE grants are absent where RPC-only writes are intended.
6. Run negative tests using disposable/staging identities: PM cross-company client mutation, department-scoped global visibility, Client cross-company reads, unassigned Staff storage read/write/delete, and forged attachment paths.
7. Confirm the Storage policy/function hash and Edge Function versions match the release manifest.

## Indexes and query shape

The secure schema includes indexes for entity type, client, assignee, creator, parent, workspace/version and feedback uniqueness/query paths. The frontend loads members and non-notification entities in ordered 500-row pages and separately loads a 50-item notification feed.

Observed risks:

- `aitask_entities` remains a broad JSONB table; query selectivity depends on denormalized columns and correct trigger maintenance.
- Notification search/filter/pagination is designed defensively in the client, but live RPC query plans and indexes were not inspected.
- The invite Edge Function scans Auth users page by page instead of using an indexed lookup.
- Full load time scales with total workspace rows. Page size prevents a single huge response but does not prevent a large aggregate client memory footprint.

## Auth and session integration

- Frontend uses Supabase Auth with auto-refresh and `sessionStorage` persistence.
- App verifies the session user and maps it to an `aitask_members.auth_user_id` row before loading secure state.
- Auth state changes clear workspace data on sign-out or account identity changes.
- Invite Edge Function verifies the bearer token with the admin client, then queries membership through a user-scoped client.
- Self-email changes reauthenticate with the current password.

Risks:

- Auth/member email change is two-phase and rollback can fail silently to the user.
- Member deletion removes Auth before the member row and can leave an orphan row.
- Production password-reset bypass must be forced off by build/deployment policy.
- Auth settings such as leaked-password protection are not rechecked in this audit.

## Storage

### Confirmed source configuration

- Bucket: `client-service-files`
- Public: false
- File size limit: 104,857,600 bytes (100 MiB)
- Allowed MIME types: PDF, JPEG, PNG, WebP, GIF
- Object paths: workspace/client/cycle/file
- Insert/update/delete policies require a three-folder path and service-client/cycle authorization.
- Client reads are limited to published/completed, client-visible activity paths.
- Upload reconciliation records abandoned paths and prevents them from being referenced again.

### Unverified live checks

- Bucket privacy and MIME configuration in production.
- Final Storage policy definitions after all migrations.
- Whether legacy policies remain after cutover.
- Object-owner behavior and review-evidence access for every role.

## Realtime and consistency

The frontend subscribes to member access and entity changes through Supabase Realtime, with polling/focus/visibility/online reconciliation for entity state. Workspace loading uses before/after revision checks and retries when a concurrent change is detected. Writes use command IDs and optimistic versions.

This is a reasonable architecture for a single-workspace application, but consistency is eventually convergent. The key operational requirements are:

- surface retry/conflict status instead of silently overwriting;
- retain pending commands per Auth identity and clear them on logout/account switch;
- make cross-system Auth/member operations durable;
- monitor stale pending uploads and command receipts;
- verify that Realtime publication and filters are enabled in the live project.

## Edge Functions

### `invite-aitask-member`

Positive controls: JWT/bearer verification, bounded JSON body, workspace membership check, Super Admin checks, role/department/custom-role validation, command-id reservation, onboarding reconciliation, and configured HTTPS app URL.

Findings: full Auth-user scans; Auth/member two-phase consistency windows; wrapper CORS behavior should be verified against the deployed version.

### `aitask-feedback`

Positive controls: origin allowlist, POST-only handling, bounded body, honeypot, enum/length/rating validation, unique-email race handling, rate limit, bearer-authenticated results, Super Admin or configured reviewer-email authorization, and no-store responses.

Potential finding: rate-limit identity uses proxy headers; verify the Edge platform overwrites or protects those headers. Reviewer email configuration is high-privilege and must be treated as a secret-controlled allowlist.

## Migration and deployment consistency

`pnpm verify:migrations` passed for 110 non-empty SQL migrations. That proves repository completeness, not live application. Existing documents disagree on whether the latest migrations/functions are pending or deployed.

Do not use the document claims as live authority. Generate a release manifest from:

- repository commit and migration file hashes;
- live migration versions/aliases;
- live function version/status and source hash;
- RLS/grant/policy hashes;
- Storage bucket/policy state;
- Auth security settings;
- verification timestamp and project ref.

## Supabase release recommendation

**Conditional hold.** The committed schema and tests show strong controls, but a release must wait for authoritative live read-only proof of the migration/function/RLS state and for the cross-system lifecycle issues to receive a durable recovery design. Use a disposable local Supabase stack for mutation tests; use production only for non-mutating metadata/policy verification.
