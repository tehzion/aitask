# AiTask — Agent Hand-off Prompt (push the audit branch, v2)

**Date:** 2026-10-16 · **Branch:** `codex/audit-p0p1-2026-10-16` · **Remote:** `origin` = `git@github.com:tehzion/aitask.git`
**Local state at hand-off:** working tree clean, branch **ahead of origin by 5 commits**.

> Supersedes `docs/AGENT_HANDOFF_PUSH-2026-10-16.md` (that note said "ahead 3"; two more commits
> landed since — this doc is the current one). Copy everything in the fenced block into the other agent.

```text
You are a senior full-stack engineer on "AiTask" (React 18 + TypeScript + Vite + Tailwind +
Zustand SPA, Supabase Postgres/RLS/RPC backend). Your job is to verify the local branch, push it
(and the other local-only branches), then open a PR. Do NOT change product code unless the gate is
red and you are fixing the breakage you introduced.

# REPO
Working dir: /Users/user/Downloads/aitask-master
Remote:              origin  git@github.com:tehzion/aitask.git
Branch to push:      codex/audit-p0p1-2026-10-16
Local is ahead of origin by 5 commits (working tree should be clean):
  8cd3014 fix(ui): harden sync, notifications and Chinese localization
  59abb28 docs: add push hand-off prompt for the audit branch
  8b25bf7 fix(sync): harden secure save/retry and edge-function request handling
  e02d929 fix(audit): harden Boss Koo actions and reconcile workflow guards
  24796ac fix(client-workspace): avoid crash on a missing client id

Context docs (read for detail, do not rewrite):
  - docs/AGENT_HANDOFF_PROMPT-2026-10-16.md     (original audit -> implementation brief)
  - docs/BUG_REPORT-2026-10-16.md               (defects + repro)
  - docs/DEEP_DIVE_GAPS-2026-10-16.md           (cross-layer gaps, resolved in source)
  - docs/LEFTOVER_GAP_CHECK-2026-10-16.md       (leftover/open items)
  - docs/supabase-save-deep-audit-2026-10-08.md, docs/supabase-rollout-*.md

# STEP 1 — Confirm tree and commits (STOP if dirty)
  cd /Users/user/Downloads/aitask-master
  git status -sb
  git log --oneline origin/codex/audit-p0p1-2026-10-16..HEAD
  git diff --stat origin/codex/audit-p0p1-2026-10-16..HEAD
A clean tree and exactly 5 commits ahead are expected. If the tree is dirty, STOP and ask the owner
(a concurrent editor has been active on this repo).

# STEP 2 — Run the full gate (must all pass; do not skip)
  pnpm check        # tsc -b --noEmit
  pnpm lint         # eslint .
  pnpm verify:i18n  # expect: i18n AST audit: 0 finding(s)
  pnpm test         # vitest run src — expect 101 files / 791 tests passed
  pnpm build        # production build — expect success + PWA precache
Last verified on this machine: check PASS, lint PASS, verify:i18n 0 findings, test 791 passed.
Build was NOT run in the latest session — run it. If any step fails, fix ONLY that breakage,
re-run the whole gate, then commit the fix before pushing.

# STEP 3 — Safety checks before pushing
  - No secrets touched (expect empty):
      git diff --name-only origin/codex/audit-p0p1-2026-10-16..HEAD -- .env .env.local .env.production
  - No migration was applied and no live Supabase project or production data was modified here.
  - Do NOT force-push. Do NOT rebase onto origin/master. A plain push is expected.

# STEP 4 — Push
  # 4a. Primary branch (fast-forward to its own upstream):
  git push -u origin codex/audit-p0p1-2026-10-16

  # 4b. Push ALL local branches (the owner asked for "push all"). This is non-destructive
  #     (no --force). It creates/updates same-named remote branches only; it does NOT touch master.
  git push --all origin

  # Branches this will publish / create (inventory at hand-off):
  #   codex/audit-p0p1-2026-10-16            ahead 5   <- the deliverable
  #   codex/boss-pm-ui-audit                 ahead 1, behind 37   (tracks origin/master; push lands on its own branch name)
  #   codex/hod-review-gate                  no upstream  <- will be created
  #   all other codex/* and master           already in sync (no-op)
  # If `git push --all` is blocked or surprises you, fall back to 4a only and report it.

# STEP 5 — Open a PR for the primary branch
  gh pr create --base main --head codex/audit-p0p1-2026-10-16 \
    --title "fix(audit): harden secure sync, notifications and localization" \
    --body "<summarise the 5 commits; paste the STEP 6 deploy items and mark them PENDING>"
Return the PR URL in your final message.

# STEP 6 — DEPLOY ITEMS NOT DONE BY THE PUSH (call out in the PR; do NOT execute without the
#          owner's approval and a preflight/backup)
  1. Pending production migrations (SQL committed, NOT applied) — verify this list against
     `supabase/migrations/` and docs/production-rpc-mismatch-recovery.md before acting:
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
     Some carry live security fixes (e.g. pm_task_company_boundaries). Use the preflight/backup gate.
  2. Edge functions changed in 8b25bf7 — need `supabase functions deploy`:
       supabase/functions/aitask-feedback        (byte-bounded body; exact-match dedupe)
       supabase/functions/invite-aitask-member   (request-parse guard; CORS ALLOWLIST replaces wildcard —
                                                 set AITASK_ALLOWED_ORIGINS and confirm
                                                 AITASK_PUBLIC_URL/publicAppUrl before deploying)
  3. pgTAP files (client_visible_completion_review.test.sql, service_transition_guard.test.sql) and
     Playwright e2e were NOT run here (no linked Postgres / browsers). Run `supabase db test` and the
     e2e suites in the deploy gate.

# REPORTING (final message back)
Report: git status before/after, the pushed commit hashes and branch names, each gate command with
its result, whether each push succeeded, the PR URL, and the STEP 6 items still PENDING. State
clearly that no migrations/edge functions were deployed and no production data was touched.
```
