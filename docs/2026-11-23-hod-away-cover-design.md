# HOD "I'm away" backup reviewer — design

As of 23 Nov 2026. Design only; nothing is built. It needs a policy decision (below) and a database migration, which cannot be verified without the disposable Supabase stack and pgTAP.

## Problem

Review cover exists only per task and only the responsible PM can set it (`aitask_enforce…` guard in `20261015002054_hod_review_remediation.sql`: "Only the responsible project manager can configure review cover."). While a HOD is configured, ordinary PM fallback is suppressed. If the only HOD for a department is away, every waiting task in that department stalls until a PM touches each one. The 14 Oct audit found 8 video-department reviews depending on one HOD account.

## Proposal

A member-level setting, not a per-task one.

- **Data:** `away_until timestamptz` and `away_backup_member_id text` on the HOD's member record (or a small private table keyed by member), plus who set it and when.
- **Reviewer selection** (`private.aitask_task_reviewers`, latest in `20261020030644_pm_project_approval_authority.sql`): in the `hods` set, replace a HOD whose `away_until > now()` with their backup, provided the backup passes `aitask_review_member_can_lead` for that task and is not the assignee or the review submitter. Per-task `reviewCover` still wins. PM fallback and Boss behaviour are unchanged.
- **Who may set it:** the HOD for themselves; Boss for any HOD. The backup must be a HOD, or a PM with access to the department. Maximum 90 days, same as task cover. Expiry restores normal selection automatically.
- **App:** a card in Settings ("I'm away until…", backup picker), a "Covered by {name}" label on review rows, and a notification to the backup. Manage work's "Needs my review" tab already lists what the backup must decide.
- **Audit:** the change goes through the normal entity history.

## Decisions needed before building

1. May a HOD delegate approval authority to someone themselves, or must a PM/Boss do it? (Self-service is faster; PM-only matches today's per-task rule.)
2. Must the backup be in the same department, or may it be any HOD or PM?
3. While away, should the HOD still be able to approve (belt and braces) or lose reviewer status until they return?

## Verification plan

pgTAP for selection (away HOD replaced, expired away restored, assignee/submitter excluded, non-eligible backup rejected, 90-day cap, only self or Boss may set); store unit tests; a Playwright journey (set away, task goes to backup, backup approves, expiry restores); run the existing HOD review handoff and remediation specs unchanged.

## Why this is not built yet

It changes who can approve work, which is an authorization rule. It should not ship without the three decisions above and a passing disposable-stack database gate.
