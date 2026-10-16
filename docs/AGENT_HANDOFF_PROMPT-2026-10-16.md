# AiTask — Agent Hand-off Prompt (implementation)

> Copy everything in the fenced block below into the other agent. It is self-contained.

```text
You are a senior full-stack engineer working on "AiTask", a React 18 + TypeScript + Vite +
Tailwind + Zustand SPA for a marketing agency, backed by Supabase (Postgres, RLS, SQL command
RPCs). You are implementing fixes for a completed audit.

# REPO
Working dir: /Users/user/Downloads/aitask-master
The audit produced these files IN THIS REPO — READ THEM FIRST, they contain full evidence,
file:line references, root causes and recommended fixes:
  - docs/SYSTEM_AUDIT_REPORT-2026-10-16.md   (master findings index)
  - docs/BUG_REPORT-2026-10-16.md            (defects with repro + fix)
  - docs/SUPABASE_AUDIT-2026-10-16.md        (schema/RLS/RPC/edge-function)
  - docs/IMPROVEMENT_PLAN-2026-10-16.md      (prioritised roadmap P0-P3)
  - docs/TEST_COVERAGE_REPORT-2026-10-16.md  (what was/wasn't verified)

# CRITICAL PROCESS CONSTRAINTS
1. The working tree currently contains UNCOMMITTED changes mixing two work streams. Inspect
   `git status` and `git diff` BEFORE editing. Do NOT revert or overwrite others' work.
2. Work on a NEW branch off the current HEAD (e.g. `git switch -c fix/audit-p0p1-2026-10-16`).
   Commit one theme per commit with clear messages matching repo style.
3. Do NOT change RLS policies, RPC signatures, or apply migrations to any live project. For
   migration/schema items, produce the SQL + a written justification, then STOP and request
   approval. Local only; never touch production data.
4. Never commit secrets. `.env*` (except `.env.example`, `.env.production`) is gitignored.
5. After each fix, run the gate and make it pass:
     pnpm check      # tsc -b --noEmit
     pnpm lint       # eslint .
     pnpm verify:i18n
     pnpm test       # vitest run src
     pnpm build
   If a linked Postgres is available: `supabase db test` (pgTAP) — otherwise say so.
6. Add a targeted regression test for EVERY fix. No fix is "done" without a test.
7. Do not refactor unrelated code. Do not add features. Do not restyle UI.

# TASKS (in order; each must leave the gate green)

## PHASE A — P0
A1. Empty migration hazard (OPS-01 / SUP-I2)
    File: supabase/migrations/20261015140049_monthly_plan_revision_scheduling.sql (0 bytes)
    - Determine the intended DDL from:
        - the migration name (monthly plan revision scheduling)
        - src/store/index.ts functions: scheduleClientPlanRevision (~:4112), createClientPlanRevision
          (~:4065), generateDueLocalServiceCycles (~:4259), and plan fields
          effectiveFromCycleStart / revisionScheduleStatus in src/types/index.ts:275-301.
        - supabase/preflight/migration_repair_manifest.review.json (it is in validatedMigrationTail
          AND pendingProductionMigrations).
    - Either RESTORE the correct DDL, or if the change is fully covered elsewhere, add a
      deliberate no-op `-- intentionally empty` placeholder with a comment explaining why, and
      update the manifest rationale.
    - Add a CI guard: create scripts/verify-migrations-nonempty.mjs that fails if any
      supabase/migrations/*.sql is 0 bytes (allow an explicit allow-list), and wire it into
      package.json as `verify:migrations` and into the release/preflight gate.
    - Do NOT deploy. Report the intended DDL you chose and why.

A2. Completion silently auto-approves the client (DBG-01 / BUG-01)
    Files: src/store/index.ts:2550-2554 (updateTaskStatus) and ~:2996-3002 (updateTask)
    - When a PM completes a task, do NOT set clientApprovalStatus='Approved' without an audit
      trail. Recommended: on completion, if task.visibility === 'client-visible', keep
      clientApprovalStatus='Pending' so the client review flow (reviewClientApproval) still runs.
      If the business wants PM completion to count as client acceptance, instead append a
      TaskApprovalEvent {userId: PM id, status:'Approved', note:'Completed by project manager'}
      to approvalHistory.
    - Ensure getClientApprovalDate (src/lib/clientPortal.ts:155-161) then returns a real date.
    - Tests: extend src/store/clientApprovalProgress.test.ts (or a new test) asserting that after
      completing a client-visible task, either (a) it is reviewable by the client, or (b) an
      approvalHistory Approved event exists and getClientApprovalDate is non-null.

## PHASE B — P1
B1. Canonical "awaiting client review" selector (DBG-02 / BUG-02)
    - Export ONE selector from src/lib/clientPortal.ts, e.g. isAwaitingClientReview(task) and
      isAwaitingInternalReview(task).
    - Replace the divergent logic in:
        - src/lib/pmDashboard.ts:9
        - src/components/ServiceRoleDashboard.tsx:126-127
        - src/lib/deliveryTracker.ts:185
    - Tests: a fixture where a task is client-visible + Waiting Approval must be classified as
      INTERNAL review by all three surfaces; a task that is Completed/Approved+pending must be
      CLIENT review by all three. Assert PM/Boss/client counts agree.
    - Depends on A2 for correct approval semantics — do A2 first.

B2. Client approval must not reopen a Completed task (DBG-03 / BUG-03)
    Files: src/lib/access.ts:590-597 (canReviewTaskAsClient), src/store/index.ts:3141-3152
           (reviewClientApproval)
    - If the task is already Completed, approving must not set isCompleted=false/percentage 80.
      Either (a) treat it as an idempotent "already accepted" no-op with feedback, or (b) add an
      explicit reopen action that is separate from approval.
    - Tests: reviewing a Completed task as client must not drop completionPercentage below 100 or
      clear completedAt.

B3. Service cycle + plan status transitions (DBG-06 / DBG-07 / BUG-04 / BUG-05)
    Files: src/store/index.ts:4325-4335 (setServiceCycleStatus), :4311-4322 (setClientPlanStatus)
    - setServiceCycleStatus: validate allowed transitions; forbid 'Completed' unless all required
      deliverables are 'Delivered' (use resolveDeliverableStatus / deriveServiceProgress in
      src/lib/serviceManagement.ts). Forbid reopening a Completed cycle to Draft.
    - setClientPlanStatus: forbid Active -> Draft when the plan has non-Draft cycles.
    - Tests: add negative cases.

B4. Non-grantable permission keys (AUTH-01 / BUG-06)
    Files: src/lib/access.ts:66-122 (permissionLabels, permissionGroups, nonSuperAdminOnlyPermissionKeys),
           :265-294 (getEffectivePermissions), sanitizeRolePermissions
    - Hide/flag manageUsers, approveRegistrations, deleteUsers, viewApprovals in the role editor,
      and ensure the UI never offers a checkbox whose value sanitizeRolePermissions strips.
    - Tests: editing a non-super-admin role cannot produce a "granted" state for those keys.

B5. De-flake taskStatusControls.test.ts (SYN-03 / BUG-07)
    File: src/lib/taskStatusControls.test.ts (fails intermittently at :40)
    - Reproduce with `pnpm exec vitest run src/lib/taskStatusControls.test.ts --no-file-parallelism`
      and with `--sequence.shuffle=true`. Find the nondeterminism (shared module state / time).
    - Harden so it passes deterministically across repeated runs. Document the root cause.

B6. Client-visible completion must require client approval (DBG-10 / BUG-11)
    File: src/lib/taskWorkflowAccess.ts:24-25,35-39 (canCompleteWithoutInternalApproval, taskTransitionError)
    - When task.visibility === 'client-visible', do not allow PM completion to skip client review,
      even when requiresInternalApproval === false.
    - Update src/lib/taskStatusControls.test.ts accordingly.

B7. Feedback results rate limit (SEC-02 / SUP-R2) — requires approval before deploy
    File: supabase/functions/aitask-feedback/index.ts:167-190
    - Add the same IP/actor rate limit the submit branch uses (aitask_consume_feedback_rate_limit,
      see :76-92) to the results branch. Reuse the existing helper; do not invent a new one.
    - This is an edge-function change — write it, add/adjust a test if one exists, then STOP for
      approval before deploying.

## PHASE C — P2 (only after A+B are green and reviewed)
C1. Remove or recompute Project.totalTasks/completedTasks (DBG-04). They are always 0
    (src/store/index.ts:3433-3434; src/lib/security.ts:321-322). Prefer deriving counts.
C2. Clear/recompute deliverable.primaryTaskId on task delete/unlink (DBG-05).
    Files: src/store/index.ts:3093-3095 (deleteTask), :4362-4389 (linkTaskToDeliverable).
C3. De-duplicate revision/status-return notifications to the assignee (DBG-08).
    Files: src/store/index.ts:3231-3237 and :2596-2605.
C4. Validate service collections in parseWorkspaceSnapshot instead of `as unknown as T[]`
    (SYN-04). File: src/lib/security.ts:506,512-519.
C5. Delete unreachable legacy snapshot bridge (SYN-01): src/lib/supabaseSnapshot.ts,
    src/lib/legacySnapshot.ts and their tests, plus the dead `else` branches in
    src/store/index.ts (guards at :1049/1052/1126, :1193/1225/1298, :1391/1407/1531) — because
    src/lib/supabaseClient.ts:18 makes shouldUseSecureSupabase() === shouldUseSupabase().
    VERIFY by grepping that nothing else imports them before deleting.
C6. Remove dead src/pages/Projects.tsx (unrouted; /projects renders Clients.tsx).
C7. Fix the two open Staff UX defects (UI-01/UI-02) from docs/staff-latest-deep-audit-2026-10-15.md:
    upload abandonment on sheet close, and midnight-stale relative dates. Confirm scope before
    changing UI.

# REPORTING (final message back)
For each task report: status (Done/Blocked/Needs-approval), files changed, the exact command(s)
run and their exit codes, and any test added. List anything you did NOT verify and why. Do not
claim a fix without an executed test. If a linked Postgres/browser is unavailable, say which
suites you could not run.
```
