# AiTask Tutorial Fix Report

**Completed:** 2026-10-19
**Scope:** Remediation of the onboarding, Help Centre, workflow-guide, tutorial-feedback, and release-audit findings recorded in `AITASK_TUTORIAL_DEEP_AUDIT.md`.

## Outcome

All functional tutorial audit findings were remediated. The changes preserve the existing task and approval workflow: guides navigate, highlight, explain, and save tutorial progress only; they do not create, edit, assign, approve, reject, upload, or delete business records.

## Fixes delivered

| Area | Root cause | Fix | Key files |
| --- | --- | --- | --- |
| Workflow maps | A workflow was shown only when every stage tutorial matched one role, which is impossible for cross-role workflows. | Internal personas now see a non-sensitive map. Individual stage links are shown only for their visible tutorials; Client users do not see internal maps. | `src/pages/Help.tsx` |
| Role-safe Help navigation | Detail and related-link handlers could resolve catalogue IDs without the visible-role set. | Help selection, start, direct query selection, and related links are checked against a canonical visible ID set. | `src/pages/Help.tsx` |
| Guide event integrity | The overlay accepted event-supplied steps and routes. | The event contract now supplies only `tutorialId`; the overlay fetches registered steps from the canonical catalogue after persona validation. | `src/components/OnboardingExperience.tsx`, `src/components/ContextualTutorialLink.tsx` |
| First-login routes | Onboarding steps identified a target but did not consistently navigate to its owning page. | Each persona's step declares an allowed route. The tour navigates before resolving a highlight; target names were reconciled with actual page headers. | `src/lib/onboarding.ts`, `src/pages/Approvals.tsx` |
| Chinese search | The approval tutorial lacked the expected `审核工作` synonym. | Added role-appropriate bilingual search terms. | `src/lib/tutorials.ts` |
| Feedback error handling | A mocked backend failure could appear saved in a unit test. | Tests now retain the remote error state and assert a clear unsuccessful save result. | `src/lib/tutorialFeedback.test.ts` |
| Feedback RLS assurance | The pgTAP test asserted policy definitions rather than live allow/deny behavior. | Added authenticated owner/co-worker/outside-workspace fixtures and live insert/read/update/impersonation assertions. | `supabase/tests/database/tutorial_feedback.test.sql` |

## Coverage added or expanded

- `e2e/tutorial-release-audit.spec.ts` checks internal workflow visibility, Client role-boundary denial, injected-event rejection, responsive overlay behavior, keyboard controls, and Chinese locale switching during a guide.
- `e2e/tutorial-guides-exhaustive.spec.ts` walks every practical guide applicable to Super Admin, Project Manager, HOD, Staff, and Client. It verifies each step's route plus either its highlight target or the intentional unavailable-target fallback.
- `e2e/onboarding.spec.ts` now proves Back/Finish persistence and Project Manager cross-page routing; it also confirms Client onboarding reaches the client workspace.
- `src/lib/tutorials.test.ts` checks role-scoped English/Chinese searches and bilingual instructional completeness.
- `src/lib/onboarding.test.ts` verifies that every persona onboarding step points to a declared route and a real registered target.

## Security and product safeguards retained

- Client routes, Help links, related tutorials, contextual triggers, and guide startup are all role-gated.
- The Super Admin account is deliberately not presented in the public demo-account selector.
- Guide fallbacks never invent a record-specific target or action; they tell the user to continue safely or restart from Help.
- Client tutorial copy continues to state the visibility boundary and does not disclose internal notes, assignments, or internal workflow detail.

## Intentionally not changed

- No database migration was applied to a shared or production environment.
- No production environment variable, hosting configuration, or deployment was modified.
- No unrelated pre-existing working-tree changes were reverted, overwritten, or included in an audit-specific commit.

## Follow-up

The implementation changes are ready for the normal reviewed release process. Production promotion remains blocked by the migration-alignment, backup/rollback, preview, and production-smoke requirements in `AITASK_TUTORIAL_RELEASE_READINESS.md`.
