# Boss Koo and Project Manager UI feedback audit

Date: 2026-10-14. Branch: `codex/boss-pm-ui-audit`, based on `3933b3f`.

## Findings and fixes

- Optimistic task, project, company creation and plan actions announced success before a remote save was confirmed. These messages now wait for workspace persistence acknowledgement. A pending batch produces one confirmation; failed saves retain retry feedback. Discard, terminal rejection and account changes clear queued confirmations. Unrelated background updates cannot acknowledge them.
- Toasts were below modal overlays and inside the root hidden from assistive technology while a modal was open. They now use the shared portal above dialogs, with accessible status/alert feedback and a 44px dismissal control.
- Conflict banners displayed entity IDs and internal field names. They now explain that another person changed the item and direct the user to review the latest version.
- Managers completing another person's work could receive personal completion celebrations. Normal confirmed status feedback remains; personal weekly feedback now requires the actor's own completed task and a known completion count. Optional celebration code loads on demand and is fenced against account/session changes.
- Settings counted projects as companies. Both company counters now count distinct accessible company names, including owned profiles without projects.
- The plan wizard claimed activation was Boss-only even for authorized PMs. Its caption now describes activation without an incorrect role restriction, and subtotal/discount/tax/total labels translate normally.
- Save timeouts, generic validation rejection, workspace recovery and conflict reapplication now use plain actionable feedback. Recovery says saving is underway; reapplication/merge success appears only after save acknowledgement. English and Chinese copy were updated together.
- Workflow task editors offered company and department changes that the server rejects. Both fields are now disabled with an explanation; task titles remain editable for authorized actors.
- Task quick-edit errors now clear after confirmed global recovery.

Unused legacy feedback aliases were removed to keep the existing startup bundle budget. No bundle limits were increased.

## Verification

- Full unit suite: 567 tests across 78 files passed, including six regressions exercising real store commit/retry/discard paths with mocked Supabase acknowledgements.
- Browser coverage: 47 distinct scenarios passed across the main run and a fresh rerun. The main run passed 46; one existing login/access scenario encountered an I18nProvider context error during a source hot reload and passed on a fresh server without source edits. No production login failure was inferred from that development-server interruption.
- The 12 new Boss/PM browser cases cover delayed confirmation, failure/retry, conflict copy, distinct company counts, teammate completion, plan review and fixed workflow fields. Existing coverage additionally checks catalog/project/plan recovery, desktop/mobile Boss approvals, task access and workflow review gates.
- TypeScript and production build passed. Eager JavaScript gzip size: 307,091 bytes, below the unchanged 307,200-byte limit. Report chart and index budgets also passed.
- Scoped ESLint passed; strict translation coverage reported zero findings across 146 source files; `git diff --check` passed.
- Visually inspected the confirmed-save toast above the open Boss task dialog. Screen-reader-visible status was also asserted in browser checks.

## Delivery scope

This commit contains the audit changes from the isolated managed worktree. They have not been pushed or deployed. No database migration is required or was applied for this audit. Browser tests used local role fixtures and controlled save acknowledgements; unit tests exercised the secure save adapter with mocked RPC responses. This report does not claim a new production end-to-end save test or an exhaustive audit of every screen.
