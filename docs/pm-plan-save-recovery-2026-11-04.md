# PM plan save and recovery

## Reproduced defects and fixes

- Draft submissions remained editable and could be staged again after a failed
  confirmation. The editor now locks the submitted fields, Save, Review and
  scheduling actions until confirmation or explicit recovery.
- The editor offered Retry for permanent FORBIDDEN, VALIDATION and NOT_FOUND
  rejections and did not reflect the workspace's system-update/retained-command
  locks. It now follows the mutation lock and retry eligibility rules, displays
  the underlying backend error, and routes restore through the editor so the
  submitted draft survives restoration of canonical data.
- Scope-only draft updates accepted incoming price, discount and tax values
  even when the PM could not view prices. A regression reproduced a stored
  unit price changing from 225000 to zero. Existing item prices and plan discount
  and tax settings are now preserved for restricted PM updates; pricing
  snapshots remain untouched by these callers.
- Editor identity now includes the signed-in account, preventing an old form
  instance from carrying its submission into another account. Existing session
  guards still reject late acknowledgements.
- A missing/restored-away submission now clears the obsolete conflict notice
  when adopting the canonical baseline, while keeping the unsaved draft.

## Verification boundaries

PM browser fixtures use a non-super-admin Project Manager, company ownership
or explicit project membership, and both pricing visibility settings. They
cover draft save, review, scheduling, reopening, blocked resubmission, retry
without staging twice, terminal rejection, draft-preserving restore, offline,
conflict, pending-save and system-update recovery.

Store tests run synchronization races, bounded waiting, refresh failure,
acknowledgement and account-change scenarios as a regular PM. Service-command
integration tests exercise both PM and admin variants, including retained
commands and the real command serializer with mocked RPC responses. Scope-only
pricing preservation and out-of-portfolio rejection have action-level tests.

No database, RLS, command endpoint, or production record was changed. Browser
recovery failures and RPC acknowledgements are simulated. Passing these checks
is not verification of the original unidentified production incident or proof
that these changes have been deployed.

## Production release — 4 November 2026

Released at https://aitask-virid.vercel.app from commit
`d5d1b0e7b3ee1d72fd42149d17b54a1618c9453c` on the pushed
`codex/pm-save-production-20261104` branch. The fixes were ported onto live
baseline `298ace559b780afade22b8ac927898448f065406`; the local modular
stabilization checkout was not deployed wholesale. The release also includes
this chat's project-delete confirmation and persistence fixes.

The exact production candidate passed 1,036 unit tests, 27 targeted browser
checks, TypeScript, lint, i18n, build, PWA and bundle budgets. Vercel deployment
`dpl_7Hp8Ddz8C6vLbeWcRDrdtBSaPaFg` is READY. The public production domain
reports this commit and the production channel; its login page returns HTTP 200.
No database migration or production business-record mutation was performed.
Live authenticated PM business actions were not exercised.

Rollback deployment: `dpl_2wTDyghtKoScWwN4cbvyCmQX8pVy`.

## Live production delete-command verification

Executed `aitask_execute_command` with `project.delete` under Ting Ting's
non-super-admin PM identity and the `authenticated` database role, using
synthetic fixtures inside explicit rollback-only transactions. Passed: empty
project deletion; deletion with PM-assigned and Staff-assigned tasks; task
preservation and unlinking; Staff assignee preservation; replay of the same
command ID; and rejection of another PM's project deletion. All fixture,
receipt and version changes were rolled back. A subsequent query found zero
remaining `QA-DELETE-20261104-*` entities.

This verifies the live database command and permissions. It does not establish
a browser login or verify the visible UI end-to-end; Ting Ting's normal sign-in
is still required for that check. No password, session or membership was changed.
