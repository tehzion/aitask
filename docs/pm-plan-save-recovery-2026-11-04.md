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

## Production candidate

Ported onto the exact live November 3 commit
`298ace559b780afade22b8ac927898448f065406`, preserving its existing navigation,
project-manager validation, and sync timeout behavior. Includes this chat's
project-delete confirmation and persistence fixes. No new migration is included.

Candidate checks: 129 unit test files / 1,036 assertions, 27 targeted browser
scenarios, TypeScript, lint, i18n, production build, bundle budgets and PWA output
passed. Browser checks used local demo data and mocked failures. Linked dependency
fonts were blocked by the temporary dev-server filesystem allowlist; the
production build includes the font assets and passed its output checks.
