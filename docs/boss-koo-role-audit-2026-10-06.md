# Boss Koo role audit — 6 October 2026

## Release and scope

At the start of the audit, production served commit `ed66e26c1881564ed43a7babe590a6ef21bdbf4a`, version 2.6.1, at [AiTask](https://aitask-virid.vercel.app). Vercel deployment `dpl_2W1parJzpUaCqgLdJWxT5spxVcHb` is READY. The production `/build-info.json` returned HTTP 200 with the matching commit and production channel. Both production aliases point to the new deployment.

Reviewed Boss Koo company/contact actions, company and project creation, task controls, service-plan editing and recovery, approvals, member permissions, dashboard navigation, mobile layouts, and keyboard access. Browser mutations used synthetic data on a local server. Production checks used deployment metadata and a read-only Supabase query. An authenticated Boss session against production was not exercised.

The original observations below refer to the audited commit. The four bugs and both enhancements have now been addressed; see the implementation and verification section.

## Original confirmed bugs

### P1 — Failed company deletion or rename loses the error dialog

**Reproduction:** Open a company as Boss Koo, make `commitPendingMutation` return `{ ok: false, error: 'AUDIT simulated server rejection' }`, then confirm Delete company or submit Rename.

**Observed:** Both actions remove the visible dialog before the save resolves. The rejection produces no visible error. Local state contains no company after deletion, or the new company name after rename, despite the failed commit.

**Cause:** The dialog depends on a company lookup by its old name. Optimistic deletion removes that company; optimistic rename changes its lookup key. Rendering therefore removes the dialog before the handlers can display their errors.

**Evidence:** [selected company lookup](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L423), [rename handler](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L532), [delete handler](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L555), [dialog render condition](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L866).

**Recommended correction:** Keep an operation context identified by stable company ID through the save. Retain the dialog and a retry path on rejection. Restore canonical data on terminal rejection while retaining a retryable command for uncertain network outcomes.

### P1 — Contact edits typed during a save are lost

**Reproduction:** Enter “Submitted contact”, click Save with a delayed commit, type “Later contact edit” before the commit finishes, then resolve the save successfully.

**Observed:** Inputs remain enabled during the save. The handler switches back to the read view on completion. Reopening Edit details shows “Submitted contact”; the later edit has disappeared.

**Evidence:** [save handler](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L511), [editable contact field](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L935).

**Recommended correction:** Capture the submitted form revision and retain newer edits as dirty when the response arrives, as the service-plan editor already does. Disabling fields during submission is a simpler alternative if continued editing is not intended.

### P2 — A failed contact save still announces success

**Reproduction:** Reject the contact commit and enter new contact details before clicking Save.

**Observed:** The dialog correctly displays the rejection, but a simultaneous success toast says `Client details saved for "Boss audit company".`

**Cause:** The store emits success immediately after its optimistic update, before Supabase persistence is acknowledged.

**Evidence:** [optimistic success toast](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/store/index.ts#L3687), [commit acknowledgement](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L521). Rename emits its success toast at the same stage.

**Recommended correction:** Announce success after a successful commit. Use an explicit pending message for retained changes.

### P2 — Company date field has no accessible name

**Observed:** Axe reports the `label` violation for Client since. The visible label is not associated with its input. Other contact labels also have no `htmlFor`/input ID connection; placeholders provide only incidental names.

**Evidence:** [Client since](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L926), [Contact Person](https://github.com/tehzion/aitask/blob/ed66e26c1881564ed43a7babe590a6ef21bdbf4a/src/pages/Clients.tsx#L935). Browser inspection returned zero associated labels for Contact Person.

**Recommended correction:** Give every contact input a unique ID and connect its visible label with `htmlFor`.

## Original enhancements

1. **Protect unsaved contact drafts.** Typing a contact, pressing Escape, and reopening Edit details silently returns an empty value. Add a discard confirmation and include this form in the existing unsaved-change guard and draft recovery.
2. **Show the deletion impact.** The current warning lists types of linked records. Show the company name and affected task/project/plan/delivery counts, so Boss Koo can review the consequence before confirming.

## Audit baseline checks and limitations

- **Unit tests:** 142 passed, 1 failed across 10 relevant files. The failed retained-command retry check passes alone but fails when preceded by the local-diff save check. Its setup resets the store without resetting the secure workspace baseline. Treat this as a test isolation issue to correct; it does not establish a production retry failure.
- **Browser suite:** 32 passed, 1 failed across 33 checks. The failure was the short-window company menu disappearing after clicking its trigger. Three isolated repetitions all passed. Keep this as an intermittent issue requiring investigation; no root cause has been verified.
- **Successful browser coverage:** company contact persistence across reload, successful company cascade deletion, company/project wizard flows, Boss task controls, PM/HOD/Staff authorization boundaries, responsive approvals, accessible Boss dashboards, service draft reconciliation, failed service saves, and notification pagination recovery.
- **Production Supabase:** one super-admin member; zero unexpected super-admin roles; zero super-admin members missing an Auth link. These checks confirm role metadata, not every live authorization policy.
- **Deployment logs:** no matching Vercel error/fatal runtime entries in the post-release query. Browser errors and Supabase function errors are outside that log check.
- **Evidence:** [synthetic browser observations](/Users/user/Downloads/aitask-master/docs/boss-koo-role-audit-evidence-2026-10-06.json). Rejected-operation screenshots are available at [delete failure](/private/tmp/boss-audit-delete-failure.png) and [rename failure](/private/tmp/boss-audit-rename-failure.png).

## Implementation and verification

- Company selection now uses the stable profile ID and retains an operation snapshot while a save is pending. Failed rename and delete operations retain their error dialog and retry the existing operation without applying it twice.
- Contact and rename saves compare the submitted form against the latest input. Newer edits remain open and dirty after an earlier save completes.
- Contact, rename and delete success toasts are emitted after commit acknowledgement.
- Every contact field has a unique ID and an associated visible label. Desktop and mobile form axe scans passed with no violations.
- Escape, Close, Cancel and View tasks protect unsaved company edits with a confirmation. Discarding a pending mutation reloads saved workspace data before closing. Closing is disabled during submission.
- Delete confirmation displays the company name and task, project, plan, cycle and deliverable counts before mutation.
- Menu dismissal ignores a queued scroll if the trigger has not actually moved. Short-window keyboard and queued-scroll checks passed in all ten repeated runs.
- The save-retry unit fixture now invalidates the secure workspace session before each test, preventing baseline state from leaking between cases.

**Final verification:** 421 unit tests passed across 62 files; all 43 Boss/Staff workflow browser checks passed; ten repeated menu checks passed. TypeScript, scoped ESLint, production build, translation coverage and diff whitespace checks passed.

[Verified deletion impact screenshot](/private/tmp/boss-company-deletion-impact-verified.png).

The frontend continues to use the existing Supabase mutation and retry APIs. This fix adds no database migration or Edge Function change. Browser failure injection used synthetic local data; it did not alter production business records.
