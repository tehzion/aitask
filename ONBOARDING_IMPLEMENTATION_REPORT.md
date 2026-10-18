# AiTask onboarding implementation report

## Delivered

- Added a role-aware first-login welcome card and interactive tutorial for Super Admin, Project Manager, HOD, Staff, and Client personas.
- Added a persistent Help & tutorials centre with role-specific guidance, the standard Project Manager → HOD → Staff → HOD review → Client review workflow, status explanations, and assignment restrictions.
- Added English and Simplified Chinese content using the existing locale provider and translation dictionary.
- Added real target markers to the existing dashboard, tasks, projects, reports, approvals, client delivery, create-task, and Help navigation surfaces.
- Added keyboard support: Escape, Left/Right arrows, visible focus, Back, Next, Skip, Finish, and close controls.
- Added responsive positioning: desktop highlights the real target; mobile falls back to a bottom card when a target is unavailable or would be obstructive.
- Added graceful missing-target copy so a hidden or unavailable route element never blocks the tutorial.

## Persistence and access boundaries

Tutorial status is stored per user under `aitask:onboarding:v1` in browser local storage, with an in-memory fallback when storage is unavailable. Completion or skipping prevents the automatic welcome card from returning for that user; Help can explicitly restart the tutorial at any time. Because this avoids a schema change, the status is local to the current browser/device rather than synced across devices.

No database migration or business-workflow bypass was introduced. Existing role and permission helpers continue to determine what each persona can see and do. Client guidance intentionally excludes internal notes, team assignments, and internal workflow details.

Local seeded demo fixtures do not auto-open the welcome card so existing demo-based smoke and visual tests remain stable. Their Help page still provides the full restartable tutorial.

## Files added or updated

- `src/lib/onboarding.ts` and `src/components/OnboardingExperience.tsx` — onboarding state, persona content, persistence, tour behavior, and accessibility behavior.
- `src/pages/Help.tsx` — role-aware Help & tutorials centre.
- `src/lib/onboarding.test.ts` — persona, bilingual content, persistence, privacy, and seeded-fixture coverage.
- `e2e/onboarding.spec.ts` — PM and Client browser coverage for start, skip, persistence, restart, localization, and privacy scope.
- Existing app routes, navigation, page headers, dashboard, task, staff, and client delivery surfaces — added Help access and real tutorial targets.

## Verification

- `pnpm lint`
- `pnpm check`
- `pnpm test -- src/lib/onboarding.test.ts` (full Vitest suite: 108 files, 835 tests)
- `pnpm verify:i18n:strict`
- `pnpm build`
- `pnpm exec playwright test e2e/onboarding.spec.ts` (2 passed)
- `pnpm exec playwright test e2e/calm-ui.spec.ts` (1 passed)

The production deployment was not changed.
