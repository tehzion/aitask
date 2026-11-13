# AiTask stabilization handoff — 28 October 2026

Status at handoff: **NO-GO for production deployment.** The database CI job is green on the current PR head, but the quality job and the full browser run are unfinished. The owner has authorized pushing the stabilization branch, but has **not** authorized a production merge or deployment. The user explicitly said to **ignore staging**; do not spend time repairing or gating this release on the staging check unless that instruction changes.

## Start here

- Draft PR: https://github.com/tehzion/aitask/pull/9
- Release branch: `codex/release-browser-triage`, pushed to `origin`.
- Frozen PR head when checked: `d538db553f3edb5aacb8e3872042932db759dfbb` (`d538db5`). PR base: `250cf669e5962644de65bb87fcd4cda3db302ae8` (`250cf66`). Check the live head and checks again before acting.
- Release worktree: `/Users/user/.codex/worktrees/release-test-triage/aitask-master`. It was clean at handoff. Use this path explicitly; the current chat working directory may instead be the follow-up worktree below.
- Production Vercel alias `aitask-virid.vercel.app` was inspected through the Vercel connector and was READY on `250cf66` from `master`. No production deployment was attempted during this work.
- Original checkout: `/Users/user/Downloads/aitask-master`, branch `codex/release-stabilization-2026-10-26`. Its previously dirty, unrelated work was preserved in local commit `89a487a`. Do not merge it into this release: it contains substantial different work and migrations.
- The original supplied audit/handoff is the attachment `/Users/user/.codex/attachments/12474942-9d53-41e1-9b5d-c59df012e5a5/Pasted text.txt`. It describes the eleven earlier UI fixes, all findings, release gates and rollback plan. The pushed release branch starts from its newer `d9e343a` head.

## Immediate next steps

1. Inspect the in-progress full local browser log: `/tmp/aitask-full-e2e-d538db5.log`. It was running against `d538db5`; at the last check it had reached test 267 of 393, with one known failure and one test skipped after it in a serial group. Do not claim a completed or green run until the final summary is available. The execution session was `87080`, if it is still accessible; otherwise inspect the log and running processes. Temporary logs may not survive a machine restart.
2. The known failure is `responsive-audit.spec.ts`, test “keeps approvals Boss-only and exposes the HOD workbench copy”: it expects PM access to be denied, although PMs intentionally have the Team members page. A tested correction is already committed locally as `38a2d96` on `codex/release-followup-triage`, based on `d538db5`; its targeted browser test passed. After the frozen run finishes and its failures are classified, cherry-pick `38a2d96` onto the release branch, verify, push, and run the full suite on the new frozen head. The same serial group skipped its later password-setup test in the current run; ensure it runs on the final head.
3. The follow-up worktree `/Users/user/.codex/worktrees/release-smoke-triage/aitask-master` also has an **uncommitted experimental change** to `e2e/app-smoke.spec.ts`. Do not include it blindly: the original unmodified smoke test subsequently passed in the `d538db5` full run. It is separate from commit `38a2d96` and may be discarded after inspection.
4. Review the PR checks on the exact new head. At handoff, `database` succeeded on `d538db5` and `verify` was still running: https://github.com/tehzion/aitask/actions/runs/40716738239. Earlier database runs also passed. Any new commit requires fresh checks. Use `gh pr view 9 --repo tehzion/aitask --json headRefOid,statusCheckRollup` or the GitHub UI. The PR-triggered staging workflow failed because its Vercel token could not access the configured organization, but the user explicitly directed us to ignore staging.
5. Finish triage of **all** failures and skipped tests on the final frozen commit and establish no new failures versus `250cf66`. The previously supplied audit reported 39 failures remaining on `d028c4c`; we do not have a complete same-host baseline comparison for the current commit. Do not infer a green result from partial output.
6. Only after the gates are met, obtain the owner's **explicit production deployment go-ahead**. Then follow the original handoff's merge, Vercel deployed-commit confirmation, role smoke tests, and one-hour Supabase log monitoring. The earlier “yes” approved pushing the branch for CI, not deployment.

## Changes made on the release branch

| Commit | Change and evidence |
| --- | --- |
| `ef58a1b` | Release-notice dismissal is stored in sessionStorage scoped to user and notice; an in-flight lookup cannot reopen a dismissed notice. The HOD verification script waits for the acknowledgement RPC and checks its returned data. A browser test covers reload after removing local acknowledgement and another user receiving the notice. |
| `1822492` | Quick Edit tests select the priority control by its `High` option instead of the old dropdown index; both targeted cases passed. |
| `7a5c383` | HOD browser verification allows 30 seconds for the task editor to load. A local rollout first failed after 5 seconds with the app still loading; the GitHub database job subsequently passed on later heads. |
| `e40c127` | Client and task creation fixtures include the required HOD, and a quick-filter assertion uses `All tasks`; four targeted cases passed. |
| `dc21f69` | HOD review test asserts the current read-only `Awaiting Review` status; targeted test passed. |
| `39fc50d` | Local demo projects are assigned to the demo PM, restoring portfolio and client visibility. Mobile overdue text was darkened after axe measured 3.19:1 contrast. Demo unit and focused browser visibility tests passed; focused mobile axe color-contrast test passed. |
| `d538db5` | Refreshes macOS visual references for intentional UI/demo changes and waits for Projects to render before axe. The visual test passed with updated references and again without updating; representative desktop/mobile screenshots were inspected. |

The release branch is still frontend/test-only relative to the production baseline; verify the PR diff before shipping. No database migration was authored or applied as part of this work.

## Validation and caveats

- On `ef58a1b`, type-check, lint, all 966 unit tests, strict i18n coverage (0 findings in 199 files), and four release-notice browser tests passed. The demo ownership unit test and subsequent type-check/lint passed after the later demo and contrast edits. The PR CI runs the full checks again; use its exact-head results.
- GitHub database CI succeeded on `d538db5`. The first local rollout reached the HOD browser test but timed out at five seconds with `Loading AiTask...`; a second local rollout failed in the separate Staff save script with an Auth 504 under heavy concurrent local load. Neither local run was a pass. Use the green GitHub database result rather than describing local rollout as successful.
- An earlier full run on `ef58a1b` was stopped at test 206 after becoming very slow and after later commits made it obsolete. Its results were used for triage only. The new run on `d538db5` passed the former smoke, Quick Edit, visual, client creation, Staff creation, filter and HOD review failures before encountering the PM permission assertion described above.
- `pnpm test:e2e` uses a local demo backend and one worker. The frozen run was started as `PLAYWRIGHT_PORT=4191 pnpm test:e2e` in the release worktree, redirected to the log above. Avoid editing files in that worktree while the suite is running. Local contention from multiple concurrent browser and Docker runs caused startup and Auth timeouts; avoid unnecessarily running several large suites in parallel.
- The current PR's quality and database workflows run on pull requests; push alone to a non-master branch does not trigger the Quality and Security workflow. PR #9 is draft and should remain unmerged until gates and approval are satisfied.

## Production follow-up

- A read-only query confirmed seven production tasks remain `Waiting Approval`: three Designer, three Video Editor and one Video Shooting. All have an independent admin reviewer by the inspected data; seven are linked to existing projects, four with explicit PM arrays and three with legacy admin creators. This is an inference from data and code, **not** confirmation that each task appears in a specific person's live queue. Verify the Boss/PM queue and coordinate with task owners to approve or return stale work; do not alter live task data without a suitable owner decision.
- The Supabase security advisor still reported nine RLS-enabled tables with no policies, 19 callable SECURITY DEFINER functions, and disabled leaked-password protection. The supplied handoff treats the first two as intentional, subject to internal authorization tests. Enable leaked-password protection after the release as directed in the original handoff, and verify the setting; it has not been changed here. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- No owner messages were sent. The earlier handoff's overdue-work process issue and UI items U3–U9 remain open unless separately verified and fixed. U10 (demo PM project assignment) and the overdue-label contrast issue were addressed in `39fc50d`.
- Production migrations through `20261028150000` were already reported applied in the supplied handoff. The original runbook says the release requires no database deployment and rollback is a Vercel redeploy or revert. Reconfirm the final diff and live state before relying on that claim.

## Useful commands

```sh
cd /Users/user/.codex/worktrees/release-test-triage/aitask-master
git status --short --branch
git log -8 --oneline
pnpm check && pnpm lint && pnpm test
pnpm verify:i18n:strict
pnpm test:e2e
CI=true pnpm verify:supabase:rollout
```

The local Supabase rollout creates an isolated disposable stack and requires Docker and Node 22. Read its output before retrying. Avoid printing credentials or environment values. The production deployment go-ahead is a separate decision from the authorization already given to push the branch.
