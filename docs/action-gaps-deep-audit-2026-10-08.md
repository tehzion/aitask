# Action and recovery audit — 8 October 2026

The review found additional action bugs in the v3.0.0 candidate after the
Supabase SDK audit. The follow-up continued on 9 October, based on commit
`52d0c0c`, for the existing `codex/v2.3.1-authorization-release-hotfix` branch
and PR #5. These source corrections do not deploy the production release.

The user story is an authorized edit/create/delete action → optimistic store
change → save confirmation or failure → retry/discard → correct record and
draft state. The review traced task quick actions, catalog editing/deletion,
company/project creation, plan dates and the existing Staff/Boss/Customer
recovery flows. The continuation also traced registrations, roles, member
administration, profile/password changes, custom statuses, task creation and
service add-ons. It used local browser failure injection and the real store,
plus store regressions. No production data or settings were modified.

## Findings and corrections

| Priority | Action gap | Final behavior |
| --- | --- | --- |
| P1 | Package and workflow acknowledgements cleared text typed while the save was pending. Both browser reproductions showed the newer name replaced with an empty editor. | The submitted draft is retained separately. Acknowledgement preserves newer input and its unsaved state; the next save updates the same record's next revision. |
| P1 | A rejected task quick edit restored the entire old task, overwriting a newer title, priority and version. An original-handler browser control reproduced version 2 reverting to version 1. | Rollback checks the session/account and restores only the exact optimistic row submitted by that action. Newer rows are preserved. Exceptions also produce visible feedback. |
| P2 | Catalog save exceptions left “Saving” active with no error or usable retry. | A shared catalog editor settles busy state, displays failure and retains the original operation. Retrying does not stage another insertion, revision or deletion. |
| P2 | Package save/delete and workflow delete announced success before remote confirmation. Three store regressions reproduced the premature toasts. | Staging a mutation emits no success toast. Catalog confirmation emits it only after successful save and record reconciliation. |
| P2 | Editing a catalog record that had been removed silently created a new record with a different ID. | A supplied update ID must still exist; missing packages/workflows return “not found” and are not recreated. |
| P2 | Switching catalog editors could discard an unsaved draft without a prompt, and those drafts were absent from the global unsaved-work guard. | Dirty drafts register with the guard; editor switches ask before discarding. Pending operations prevent switching. Account changes clear the old editor and fence late acknowledgements. |
| P2 | After a failed company creation was discarded elsewhere, Retry could display “Client added” for an absent company. The browser reproduced this false acknowledgement. Project retries had the same unchecked completion structure. | Company creation checks record presence; project creation/editing checks the retained submitted fields against the current record. Missing/discarded results keep the draft, show an error and allow review before another save. |
| P2 | Project and plan-date fields remained editable while a save could close their form; rejected promises could leave controls busy. | Submitted fields lock during the request. Exceptions restore usable controls. Completion checks session, account and editor lifetime; the date editor also resets when its plan identity changes. |
| P1 | Approval/rejection and role/member deletion failures restored entire old collections, overwriting newer or unrelated records. The approval regression reproduced a lost new member and a newer registration phone being erased. | Rollback restores only rows still owned by the submitted mutation. Refreshed rows and unrelated insertions survive. Approval rollback occurs before releasing busy state, keeping failed reviews open. |
| P1 | Profile failure restored old account fields; profile refresh effects also erased the submitted form and error. | Remote profile refreshes preserve the editor. Pending profile intent retries without re-staging and checks canonical fields before announcing success. |
| P2 | Exceptions in role/member administration, profile/password or status saves left busy state stuck or feedback absent. | Shared save handling catches exceptions, releases the owning operation and fences account/session/editor changes. A late response cannot clear another account's pending role. |
| P2 | Failed task/add-on creation did not retain a stable retry target before awaiting, and retries could confirm absent records. | Creation retains the staged record before the request, retries that record once, locks its submitted fields and verifies the record before clearing or navigating. Discarded records retain drafts and require review. |
| P2 | Status acknowledgement cleared newer typing; deletion failure could overwrite newer status lists. | Retained status intent retries without another add/delete, checks presence/absence and clears only the submitted text. |
| P2 | Role editor switching/reset had no dirty-draft confirmation. | Role drafts join the unsaved-work guard and ask before replacement. Account changes reset obsolete editor context. |
| P2 | Member creation could close during a request; department and permission inputs could change before successful completion closed their modal. | Member controls lock submitted choices during the request, exception paths restore controls, and account completion is fenced. Pending local creation retains one member for retry. |

Task status feedback additionally checks that the action actually submitted a
status change and that the confirmed task retains that status. A priority edit
does not claim that an unrelated status update was saved.

## Implementation

- `src/hooks/useCatalogEditor.ts` owns submitted intent, confirmation, retry,
  draft comparison, account fencing and unsaved-work registration for both
  catalog managers.
- `src/pages/Tasks.tsx` fences quick-action responses and uses conservative
  rollback.
- `CreateClientProfileModal`, `CreateProjectModal` and
  `EditClientPlanDatesModal` guard asynchronous completion and preserve or lock
  the appropriate submitted form.
- `useSaveAction` owns request lifetime and error recovery; `actionRollback`
  preserves rows replaced by newer work. These are used by the expanded
  approval/settings/task-creation/add-on review.
- Store catalog updates reject stale IDs and defer success notifications.
- New visible recovery copy includes Chinese translations.

Permanent regressions are in the five `e2e/*action*gaps.spec.ts` suites,
`src/store/serviceCatalog.test.ts` and `src/lib/actionRollback.test.ts`. Browser transport results are controlled test boundaries; these tests do not establish deployed Supabase behavior.
The earlier [Supabase audit](supabase-save-deep-audit-2026-10-08.md) contains the
separate real local Auth/REST/Storage verification and production findings.

## Verification

| Check | Result |
| --- | --- |
| Full unit suite | 517 tests in 74 files passed. |
| Expanded broad browser run | All 115 scenarios passed in one completed run. |
| Final member/approval/settings browser run | All 17 scenarios passed, including three new member regressions and the overlapping approval, account-switch, password and profile checks. |
| Distinct expanded browser coverage | 118 unique scenarios across the 115-case broad run and 17-case final run; 14 overlap. |
| TypeScript, full ESLint, strict translations | Passed; zero translation findings across 136 source files. |
| Production build and bundle budgets | Passed; eager JavaScript is 298.1 KiB gzip under the unchanged 300 KiB cap. |
| Static PWA verification | Passed manifest, shell and cache-boundary checks. No new PWA browser run is claimed. |

The broad run covers account changes, deletion retries, newer drafts,
discarded records and success notifications. The React checklist was applied
to the changed forms: hooks remain unconditional, field locks are accessible,
asynchronous handlers return feedback, and late results are fenced by their
session/editor context. Database schema and deployed authorization were not
changed, so a fresh database migration gate was not run for this follow-up.

Continuation evidence:

- `/private/tmp/aitask-remaining-actions-before.log`: five failing browser
  regressions reproduced collection rollback, profile draft/feedback loss and
  role/profile/status exception handling gaps.
- `/private/tmp/aitask-remaining-actions-focused.log`: all 23 approval,
  profile/status and task/add-on creation scenarios passed after corrections.
- `/private/tmp/aitask-remaining-actions-browser-final.log`: all 115 scenarios
  passed, covering Staff, HOD, Boss and Customer action/recovery flows.
- `/private/tmp/aitask-remaining-actions-unit-final.log`: all 517 unit cases
  passed. Build/type/lint/translation logs use the same prefix.
- `/private/tmp/aitask-member-actions-final.log`: all 17 final member/approval/
  settings scenarios passed. The last member-target review was followed by
  another three-case member run in `aitask-member-actions-confirmed.log`.
- `/private/tmp/aitask-actions-build-confirmed.log`: the last build and unchanged
  bundle/PWA gates passed.
- One additional Supabase verification attempt could not reach the server under
  the shell network sandbox; it is excluded from passing evidence. No fresh
  hosted save or migration result is claimed by this action follow-up.

- `/private/tmp/aitask-member-actions-before.log`: three failures confirmed
  in-flight creation could close on Escape and department/access choices stayed
  enabled. The correction locks those choices and preserves pending member
  intent when its editor is closed after a failed save.

Earlier before-fix evidence:

- `/private/tmp/aitask-action-gaps-before.log`: package/workflow draft loss and
  rejected-promise failures. Its first task attempts had an ambiguous selector;
  they are not counted as bug evidence.
- `/private/tmp/aitask-action-gaps-quick-negative-control.log`: corrected desktop
  selectors against the original task handler reproduced stale rollback and
  missing exception feedback. The fixed source was restored automatically.
- `/private/tmp/aitask-action-gaps-company-before-final.log`: discarded creation
  incorrectly displayed “Client added.” The initial company probe used the
  Delivery Tracker route and is excluded from evidence.
- `/private/tmp/aitask-action-gaps-toast-before.log`: three premature success
  notification assertions failed against the old store behavior.

Earlier final logs use the `/private/tmp/aitask-action-gaps-` prefix:
`browser-verified.log`, `browser-final-edge.log`, `unit-verified.log` and
`build-verified.log`. Initial account-switch fixtures reached password setup;
the corrected fixtures explicitly enable the existing local QA bypass so the
catalog recovery check can remain on its intended screen.

## Limits and remaining hosted work

This is a targeted functional review, not proof that every possible action or
timing interleaving is defect-free. Source review of other action handlers does
not substitute for hosted authenticated checks. No schema migration or live
rollout was performed here. Production/staging rollout, the known onboarding
migration/function gap, managed PostgreSQL patch and password-screening issue
remain as recorded in the Supabase audit.

## Deletion, owner and CI follow-up — 9 October

The next review reproduced two additional action failures. A rejected task
deletion removed its optimistic row and therefore its details view, hiding the
save error. Company-owner changes let a rejected promise escape without visible
feedback and announced success when the owner was staged, before confirmation.

Task deletion now retains its submitted task and session until acknowledgement
or explicit discard. The details view survives the parent's missing-row state,
locks further edits, catches exceptions and exposes Retry/Use latest. Retry
confirms the existing deletion without staging another one; a task restored by
canonical data prevents a false success. Use latest preserves the reloaded row,
and closing after confirmed discard closes the view. Account changes invalidate
the retained view and late responses. Store staging no longer emits a deletion
success toast; confirmed absence does.

Company-owner changes retain the company ID and submitted owner for retry,
catch transport exceptions, lock the owner choice while pending and show
feedback in the company dialog. Confirmation checks the canonical company's
owner before emitting success. The pending owner joins the existing discard
guard; account changes clear its editor and fence late acknowledgements.

The failed Staff dashboard CI scenario had an inconsistent fixture. Its seed
supplied a plan/task client ID without a company profile. Local snapshot
normalization discovered `CL-assigned-company` on reload, while the later test
inserted the different profile ID `staff-dash-a`. The diagnostic helper correctly
reported zero matching active plans. Seeding both company profiles before reload
preserves their IDs; the test now asserts the plan ID survived. Existing checks
still reject ambiguous company names and unrelated IDs. Production matching
rules were not weakened.

CI on `236477c` completed with 206 standard browser passes, one failed Staff
fixture scenario and two tests that passed on retry. The member exception test
now waits for its mocked request to start before injecting failure, fixing its
undefined rejection callback race. Nine permanent deletion/owner regressions
in `e2e/deletion-owner-recovery.spec.ts` cover rejected/throwing saves, stable
retry targets, canonical restoration, discard/close and account fencing.

The original three local reproductions failed before these corrections and
passed afterward. Evidence is in `/private/tmp/aitask-missed-actions/repro.log`,
`dashboard-diagnostic.log` and `fixed.log`. The expanded affected run passed 48
cases; its two initial deletion-toast assertions compared untranslated message
descriptors with an incorrect English string. Those assertions were corrected
to use the application's message formatter. They are not outstanding app bugs.

Final follow-up verification passed all 218 standard browser scenarios in one
completed run with retries disabled, including the nine new regressions and the
previously failed Staff dashboard case. All 517 unit tests in 74 files passed.
The final production build/type validation, full ESLint, strict translations
and static PWA checks passed. Eager JavaScript is 298.2 KiB gzip under the
unchanged 300 KiB cap. Logs are `/private/tmp/aitask-three-fixes-browser-full.log`,
`aitask-three-fixes-unit.log`, `aitask-three-fixes-build-final.log`,
`aitask-three-fixes-lint-confirmed.log` and `aitask-three-fixes-i18n.log`.
These browser save tests control the transport boundary; they do not establish
fresh hosted Supabase behavior or a successful production rollout.

The follow-up changes no production schema, function, credential or deployment.
Protected staging access, production onboarding alignment, database/password
security prerequisites and independent PR review remain separate release gates.
