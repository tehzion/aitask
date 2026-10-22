# Save/retry recovery audit — 21 October 2026

Audited revision: `2504f7859fbf7b00d1333efb7b301ea871ff7c02`.

Original audit status at the revision above: **five reproduced defects**.
The descriptions below preserve the original evidence, not the current source
behavior. All five have since been repaired. Regression assertions were converted
to the desired outcomes in `src/store/restoreIntegrity.test.ts` and
`e2e/save-recovery-regressions.spec.ts`; delivery link/publication recovery coverage
was added to `e2e/delivery-review.spec.ts`. See
`save-recovery-release-2026-10-21.md` for implementation, verification and rollout.

## Scope and evidence boundaries

Story: a user submits an edit, the frontend stages it in Zustand, a typed command
persists it through Supabase, and the originating screen confirms that specific
submission or preserves it for recovery.

Mapped synchronization entry points across 25 non-test source files. Inspected
the shared commit/retry/discard primitives, plan creation and revision editors,
task/project creation, milestone management, catalog editors, delivery review,
output uploads, and the shared recovery controls. This is not a certification
of every action in the application.

The probes use the real local UI/store with injected failure/acknowledgement
results. They do not submit customer transactions to production. The store
probes use secure-backend mode with mocked transports; browser probes use the
existing local-backend test setup.

A targeted production log query for 21:55–22:59 Malaysia time returned no rows
for the selected REST/RPC paths. That is an observability/correlation limitation,
not proof of zero errors. No authenticated customer save was performed. The
affected company, account and exact incident time remain unknown.

## Reproduced findings

### 1. P1 — Failed restore leaves abandoned edits eligible for a later save

Location: `src/store/index.ts:1749` (`discardMutation`).

The command/retry state and dirty flags are cleared before the forced reload.
If that reload times out, optimistic business records remain in the store, while
the backend reports `refresh_required`, `hasLocalChanges: false`, and zero pending
mutations. Editing is then allowed. A later mutation builds operations containing
both the abandoned record and the unrelated new record.

Probe: stage "Abandoned company" and its plan; fail the restore request; create
"Unrelated new company". Both clients appear in the next operation list and in
the workspace supplied to the save adapter.

Impact: a user can believe a change was discarded, then have that change included
in a later save. This affects shared recovery, not just monthly plans.

Recommended fix: do not release the pending-state lock or discard recovery
information until canonical reload succeeds. On a failed restore, retain or
quarantine the abandoned overlay and block ordinary writes. Replace the visible
workspace and command baseline together, in the same authenticated session.

### 2. P1 — Revision retry can claim success and erase an unpersisted draft

Location: `src/components/DraftServicePlanEditor.tsx:142`.

The retry handler accepts `retryPendingSave().ok` without checking that the
submitted scope/pricing actually matches the canonical revision. A clean global
workspace can mean the earlier change was discarded, not saved. The handler then
accepts the old canonical plan, clears local recovery and says "Your plan change
was saved."

Browser probe: fail a revision submission; simulate successful restoration of its
previous saved name; retry the editor. The success message appears, but the input
is reset to the old name and the submitted value is absent from the store.

Recommended fix: retain an operation identity and submitted snapshot; verify the
canonical revision and pricing after confirmation. If the submission was restored
away or superseded, keep the draft and offer review/resubmission, not success.

### 3. P1 — Plan creation can finish after its pending plan no longer exists

Location: `src/components/CreateClientPlanModal.tsx:185`.

The wizard retains only a client ID. It does not retain/validate the created plan
ID and submitted snapshot before clearing recovery and closing. On retry, a clean
workspace can return `ok` even though a separate restore discarded the draft plan.

Browser probe: create a service-plan draft for an existing company; fail its
confirmation; remove the optimistic plan as a canonical restore would; retry.
The wizard closes successfully with **zero plans** in the store.

Recommended fix: retain the exact plan ID, scope and pricing snapshot. Verify all
of them before closing; if the pending creation is absent, preserve the form and
allow a new submission only after the user reviews it. Do not treat an existing
company ID as proof that its new plan was saved.

### 4. P2 — Milestone re-submission after a busy timeout generates another ID

Locations: `src/components/ProjectManagementPanel.tsx:77` and
`src/store/index.ts:3578`.

Unlike task/project creation, the milestone editor does not retain the first
created ID as a pending operation. After a background synchronization wait expires
without sending a write, clicking Save milestone again passes no ID and creates
another milestone. A busy timeout alone does not create a retained command or a
global failure-state lock.

Both a browser probe and a secure-mode store probe reproduce two differently
identified milestones with the same submitted name/date. The store probe confirms
this happens before any save request is sent.

Recommended fix: retain the returned milestone ID and submitted payload until
acknowledgement or explicit discard. Offer retry of that operation rather than
calling the creation mutator again. A name/date uniqueness rule would not be a
substitute for proper submission identity.

### 5. P2 — Milestone confirmation clears text typed while saving

Location: `src/components/ProjectManagementPanel.tsx:80`.

Only the submit button is disabled during saving. Inputs remain editable, while
the successful completion unconditionally resets the entire form.

Browser probe: submit "Milestone A", type "New typing B" while awaiting the
acknowledgement, then acknowledge A. The input becomes empty, and only A exists
in the store. B was neither submitted nor retained.

Recommended fix: freeze the submitted fields during confirmation or keep separate
submitted/current drafts and reset only if the current draft still matches the
acknowledged submission. Add unsaved-change protection for this editor.

## Additional code-review risks — not counted as reproduced findings

- `DeliveryReviewPanel.tsx:46` also accepts a clean-workspace retry as success
  without verifying the submitted link/publication state. Extend the restore-away
  probe to delivery linking and publication before declaring those paths safe.
- `CreateClientPlanModal.tsx:239` can show only the generic earlier-change text
  while the underlying backend error is outside the modal. Surface the actual
  failure within the dialog, distinguish refresh-only failures from pending writes,
  and explain that Restore abandons pending changes. UI/UX recovery guidance
  informed this recommendation; the five defects above are based on code/tests.
- `ProjectManagementPanel.persist` lacks `try/finally` and the shared account/context
  guard used by stronger editors. Unexpected promise rejection and account/context
  changes deserve additional fault-injection coverage; they were not counted as
  independently reproduced network defects here.

## Existing protections checked

- Task creation and project creation retain a pending entity and compare canonical
  fields before completing their forms.
- Package/workflow catalog editors retain operation IDs and compare the saved draft
  after retry. This is a useful existing pattern for plan editors to reuse.
- Shared save-action helpers guard account/context ownership. Output-file saves
  check that the canonical task references the uploaded path before success.
- Existing command batching retains command identity for uncertain network results;
  the focused recovery tests continue to pass.
- Read-only production index inspection confirmed the unique cycle key on
  `(workspace_id, client_id, period_start)` and the pending-plan-revision uniqueness
  index. The milestone duplication finding concerns nested project milestone IDs,
  not a bypass of monthly cycle uniqueness.

These checks do not establish that every related workflow is free of defects.

## Original reproduction results (before repairs)

```sh
# Converted regression coverage now lives in the normal test suites:
pnpm exec vitest run src/store/restoreIntegrity.test.ts src/lib/saveConfirmation.test.ts src/lib/secureWorkspace.test.ts
pnpm exec playwright test e2e/save-recovery-regressions.spec.ts e2e/delivery-review.spec.ts
```

Results: **2 store probes and 4 browser probes reproduced the defects**. All 48
existing focused regression tests passed. Audit probe lint passed. The earlier
browser runs had fixture-selector failures; after targeting the correct company
card, the complete four-test browser suite passed.

Important: probe assertions deliberately describe the current bad outcomes.
Their passing status is evidence of reproduction, **not evidence that the issues
are fixed**. When implementing fixes, convert them to assertions of the desired
behavior and add them to the normal regression suites.

## Recommended repair order

1. Make restore atomic and safe on failure; it is a shared data-integrity issue.
2. Add operation-specific confirmation to revision and plan-creation retry flows.
3. Give milestones stable pending IDs, draft ownership and interruption protection.
4. Extend restored-away tests to delivery linking/publication and other service
   actions, then improve in-dialog error details and safe recovery copy.

Based on these findings, the first fixes should be frontend/state-layer changes.
No database migration or permission weakening is justified by this audit.
