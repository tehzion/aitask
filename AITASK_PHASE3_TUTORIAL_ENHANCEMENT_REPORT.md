# AiTask Phase 3 — Tutorial Enhancement Report

Date: 2026-10-18

## Existing functionality reviewed

Phase 1 onboarding and the Phase 2 Help & Tutorials Centre were preserved. The existing implementation already provided:

- role-aware onboarding and a safe guided overlay;
- bilingual, structured tutorial content;
- per-user tutorial progress in the existing local progress store;
- contextual tutorial links on delivery, reporting, service-plan, task review, delegation, and revision surfaces;
- permission-aware tutorial visibility and client-safe navigation;
- canonical task access, transition, review, and output-evidence checks.

The Phase 3 work extends those pieces rather than creating a parallel tutorial system.

## Implemented

### Priority 1 — Immediate usability

1. Context-aware help

   - Added direct Help Centre links to project creation, task creation, output upload, task assignment, revision, approval, client review, service plans, delivery tracking, and reports.
   - Added the missing `create-task` walkthrough target to the Companies page and Create Task modal.
   - Contextual links are hidden when the linked guide is not visible to the current role.
   - Walkthroughs stop before any save, assignment, upload, approval, or review mutation.

2. Disabled-action explanations

   - Added a reusable accessible inline availability notice.
   - Assignment explanations use the existing task assignment permission helper and canonical locked-status list.
   - Review, approval, revision, client-review, and output-upload explanations use the existing transition/access/evidence rules.
   - Added relevant tutorial entry points without changing permissions or workflow transitions.
   - Explanations avoid exposing internal-only details to client users.

3. Improved bilingual tutorial search

   - Added maintainable `searchTerms` synonym metadata for common business language, including assign task, change staff, submit work, request revision, approve delivery, and completed tasks in English and Simplified Chinese.
   - Search now covers titles, summaries, outcomes, prerequisites, steps, rules, common problems, keywords, and synonyms.
   - Results receive lightweight relevance scoring with phrase, localized-language, token, and title bonuses, with stable ordering for ties.
   - Existing role filtering remains applied before results are shown.
   - Existing empty state continues to offer English/Chinese search suggestions.

4. Tutorial feedback

   - Added Yes/No feedback to each open tutorial.
   - A No response exposes the requested optional reasons and optional comment.
   - Feedback is upserted per workspace, authenticated user, and tutorial, preventing duplicate rows while allowing a user to update their own response.
   - Local demo mode uses a per-user browser fallback; secure Supabase mode uses the RLS-protected table.
   - Added bilingual labels, saving state, error state, and confirmation state.

### Priority 2 — Guided learning

5. Personal learning checklist

   - Added role-based learning tracks for Super Admin/Admin, Project Manager, HOD, Staff, and Client.
   - Checklist progress reuses existing per-user tutorial completion records.
   - Completed guides remain directly reopenable; completion is never forced.

6. Workflow learning guides

   - Added visual step-by-step cards for Website Design Project, Task Revision, and Task Reassignment.
   - Every stage includes role, responsibility/action, expected outcome, and a linked detailed tutorial.
   - Published assignment rules match the application: Pending, In Progress, and Revision are assignable; Waiting Approval, Approved, Completed, and Cancelled are locked.
   - Guides are filtered so a Client cannot see internal-only workflow guidance.

7. Related guidance

   - Existing related tutorial links remain in the detail view.
   - Workflow stages provide an additional practical recommendation path without adding an external recommendation service.

## Content architecture

Tutorial records now support:

- unique ID, title, summary/description, category, roles, bilingual copy, prerequisites, steps, rules, common problems, related tutorials, optional walkthrough, search terms, and `updatedAt` metadata;
- centralized workflow guide records with reusable stages and tutorial links;
- no administrative editor, since the existing static structured catalogue remains the smallest maintainable option for this scope.

## Database and security changes

Added migration:

- `supabase/migrations/20261018032155_tutorial_feedback.sql`

The migration creates `public.aitask_tutorial_feedback` with:

- workspace and authenticated-user ownership;
- a unique `(workspace_id, auth_user_id, tutorial_id)` constraint;
- feedback reason/comment/locale validation;
- RLS enabled;
- authenticated select/insert/update privileges only;
- policies that require both the current authenticated user and workspace membership;
- no anonymous access.

Added database regression assertions:

- `supabase/tests/database/tutorial_feedback.test.sql`

The migration was generated with the repository’s Supabase CLI migration generator and was not applied to a remote or production database.

## Files added or changed

Primary Phase 3 additions:

- `src/components/ActionAvailabilityNotice.tsx`
- `src/components/TutorialFeedback.tsx`
- `src/lib/tutorialFeedback.ts`
- `src/lib/tutorials.ts`
- `src/lib/workflowGuides.ts`
- `src/pages/Help.tsx`
- `supabase/migrations/20261018032155_tutorial_feedback.sql`

Coverage additions:

- `src/lib/tutorialFeedback.test.ts`
- `src/lib/tutorials.test.ts`
- `src/lib/taskWorkflowAccess.test.ts`
- `src/lib/workflowGuides.test.ts`
- `supabase/tests/database/tutorial_feedback.test.sql`
- `e2e/tutorial-centre.spec.ts`

Contextual and disabled-action integration also touched the existing Clients, Create Task, Task Details, Task Output Files, and i18n modules.

## Verification

Executed successfully:

- `pnpm test` — 111 files, 845 tests passed.
- `pnpm check` — TypeScript build check passed.
- `pnpm lint` — ESLint passed.
- `pnpm verify:i18n:strict` — 0 findings across 180 source files.
- `pnpm verify:migrations` — 116 non-empty migrations verified.
- `pnpm build` — production build passed.
- `PLAYWRIGHT_PORT=4181 pnpm exec playwright test e2e/tutorial-centre.spec.ts` — 2 passed.
- `PLAYWRIGHT_PORT=4182 pnpm exec playwright test e2e/onboarding.spec.ts` — 2 passed.

The repository’s `pnpm verify:supabase` live RPC check could not receive a response from the configured endpoint in this restricted environment (`fetch failed`). No production or remote data was modified. The Supabase changelog fetch requested by the repository Supabase guidance was also unavailable because outbound DNS/network access is restricted here; implementation follows the project’s established Supabase patterns and the local migration/static checks passed.

## Guided practice evaluation

No production-like practice sandbox was introduced. A safe implementation requires a demo-data boundary and explicit action simulation state so task creation, delegation, progress updates, submission, and review cannot reach real mutation handlers. This is deferred for a separately approved design/architecture pass.

## Known limitations

- Secure feedback table assertions were added but not executed against a live database in this environment.
- The current tutorial catalogue remains code-maintained; there is no editor or content publishing workflow.
- Full mobile-device Playwright coverage was not added to the existing desktop-only E2E project, though the new layouts use responsive stacks and native keyboard controls.
- Feedback in local demo mode is browser-local by design and is not shared across devices.

## Recommended next improvements

1. Run the Supabase migration and pgtap feedback tests in a disposable staging branch.
2. Add a small demo-data guided practice mode behind a non-production feature flag.
3. Add mobile and reduced-motion browser assertions to the E2E matrix.
4. Add content review metadata checks or a lightweight build-time catalogue validator before introducing any tutorial editor.
5. Consider future short video references only after the written workflow guides are validated with real users.

No deployment was performed.
