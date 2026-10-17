# AiTask — Agent Hand-off Prompt (push the audit branch)

**Date:** 2026-10-16 · **Branch:** `codex/audit-p0p1-2026-10-16` · **Remote:** `origin` = `git@github.com:tehzion/aitask.git`
**Local state at hand-off:** working tree clean, branch **ahead of origin by 3 commits**.

> Copy everything in the fenced block below into the other agent. It is self-contained.

```text
You are a senior full-stack engineer on "AiTask" (React 18 + TypeScript + Vite + Tailwind +
Zustand SPA, Supabase Postgres/RLS/RPC backend). Your ONLY job is to verify the local branch and
push it, then open a PR. Do not change product code unless the gate is red and you are fixing the
breakage you introduced.

# REPO
Working dir: /Users/user/Downloads/aitask-master
Remote:              origin  git@github.com:tehzion/aitask.git
Branch to push:      codex/audit-p0p1-2026-10-16
Local is ahead of origin by 3 commits (working tree is clean):
  24796ac fix(client-workspace): avoid crash on a missing client id
  e02d929 fix(audit): harden Boss Koo actions and reconcile workflow guards
  8b25bf7 fix(sync): harden secure save/retry and edge-function request handling

Context docs (read if you need detail, do not rewrite them):
  - docs/AGENT_HANDOFF_PROMPT-2026-10-16.md        (the original audit→implementation brief)
  - docs/BUG_REPORT-2026-10-16.md                  (defects + repro)
  - docs/DEEP_DIVE_GAPS-2026-10-16.md              (cross-layer gaps, all resolved in source)
  - docs/LEFTOVER_GAP_CHECK-2026-10-16.md          (leftover/open items)
  - docs/staff-latest-deep-audit-2026-10-15.md     (staff findings; UI-01/UI-02 now fixed)

# STEP 1 — Confirm the tree and the commits
  git -C /Users/user/Downloads/aitask-master status -sb
  git -C /Users/user/Downloads/aitask-master log --oneline origin/codex/audit-p0p1-2026-10-16..HEAD
  git -C /Users/user/Downloads/aitask-master diff --stat origin/codex/audit-p0p1-2026-10-16..HEAD
A clean tree and exactly 3 commits ahead are expected. If the tree is dirty, STOP and ask the
owner — a concurrent editor has been active on this repo.

# STEP 2 — Run the full gate (must all pass; do not skip)
  cd /Users/user/Downloads/aitask-master
  pnpm check        # tsc -b --noEmit
  pnpm lint         # eslint .
  pnpm verify:i18n  # expect 0 findings
  pnpm test         # vitest run src — expect 101 files / 791 tests passed
  pnpm build        # production build — expect success + PWA precache
Last verified on this machine: check PASS, lint PASS, verify:i18n 0 findings, test 791 passed,
build PASS. If any step fails, fix ONLY that breakage, re-run the whole gate, then amend/commit.

# STEP 3 — Safety checks before pushing
  - Confirm no secrets:  git -C ... diff origin/codex/audit-p0p1-2026-10-16..HEAD -- .env .env.local .env.production
    (should be empty; .env* are gitignored except .env.example/.env.production).
  - Confirm no database was touched: no migration was applied and no live project was modified.
  - Do NOT force-push. Do NOT rebase onto origin. A plain fast-forward/handled push is expected.

# STEP 4 — Push and open a PR
  git -C /Users/user/Downloads/aitask-master push -u origin codex/audit-p0p1-2026-10-16
  gh pr create --base main --head codex/audit-p0p1-2026-10-16 \
    --title "fix(audit): harden roles, staff workflow, and secure sync" \
    --body "<summarise the 3 commits; list the deploy steps in STEP 5 and mark them PENDING>"
Return the PR URL in your final message.

# STEP 5 — DEPLOY ITEMS THAT ARE **NOT** DONE BY THE PUSH (call these out in the PR, do not execute
#          without the owner's approval and a backup/preflight)
  1. Pending production migrations (11) — SQL is committed but NOT applied:
       20261015014716_pm_task_company_boundaries
       20261015015730_staff_task_contact_notifications
       20261015064701_manual_deliverable_progress
       20261015065635_deliverable_status_integrity
       20261015140049_monthly_plan_revision_scheduling
       20261015141803_optional_task_internal_approval
       20261015152000_pm_hod_first_assignment
       20261015160000_pm_project_service_scope
       20261016120000_task_role_assignment_and_contact_notification_hardening
       20261016140000_client_visible_completion_review
       20261016150000_service_transition_guard
     Use docs/production-rpc-mismatch-recovery.md for the preflight/backup gate. Some carry
     security fixes (e.g. pm_task_company_boundaries) that are live exploits until deployed.
  2. Edge functions changed in 8b25bf7 — need `supabase functions deploy`:
       supabase/functions/aitask-feedback        (byte-bounded body; exact-match dedupe)
       supabase/functions/invite-aitask-member   (request parse guard; ORIGIN ALLOWLIST replaces
                                                 wildcard CORS — set AITASK_ALLOWED_ORIGINS / confirm
                                                 publicAppUrl/origin before deploying)
  3. The two new pgTAP files (client_visible_completion_review.test.sql,
     service_transition_guard.test.sql) and Playwright e2e were NOT run here (no linked Postgres /
     browsers). Run `supabase db test` and the e2e suites in the deploy gate.

# REPORTING (final message back)
Report: git status before/after, the 3 commit hashes, each gate command with its result, whether
the push succeeded, the PR URL, and the list of STEP 5 deploy items still PENDING. State clearly
that no migrations/edge functions were deployed and no production data was touched.
```
