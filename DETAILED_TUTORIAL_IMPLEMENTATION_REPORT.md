# AiTask Phase 2 — Detailed Tutorial Implementation Report

## Outcome

AiTask now has a role-aware Tutorial Centre inside the existing Help & tutorials page. It expands the Phase 1 onboarding experience with practical workflow guides, searchable bilingual content, read-only guided walkthroughs, contextual help links, and per-user progress tracking.

No production deployment was performed.

## Tutorial catalogue

The catalogue lives in [`src/lib/tutorials.ts`](src/lib/tutorials.ts) and contains eight categories:

- Getting Started
- Company & Client Management
- Project Management
- Task Management
- Department Management
- Client Review & Approval
- Service Plans & Deliveries
- Reports & Monitoring

Each tutorial includes:

- a localized English and Simplified Chinese title, summary, outcome, prerequisites, steps, rules, common problems, keywords, and related tutorials;
- an explicit role scope based on the existing onboarding personas;
- links and wording grounded in the current AiTask routes and controls;
- optional guided steps that identify a real route and `data-onboarding-target` without performing the business action.

The role catalogue exceeds the requested priority coverage: Project Manager, HOD, Staff, and Client each have at least ten, ten, ten, and eight visible tutorials respectively.

## Help & Tutorials Centre

[`src/pages/Help.tsx`](src/pages/Help.tsx) now provides:

- role-matched guidance and the existing day-to-day checklist;
- full-text search across English and Simplified Chinese titles, summaries, outcomes, and keywords;
- category chips and a category filter;
- recommended tutorials, recently viewed tutorials, result counts, and a no-results state;
- a detailed reader with prerequisites, numbered instructions, rules, common problems, and related tutorials;
- URL-backed search, category, and selected-tutorial state for shareable/deep-linked help views;
- `Read guide` for every tutorial and `Guide me` only where a safe route walkthrough exists.

## Safe guided walkthroughs

The existing [`src/components/OnboardingExperience.tsx`](src/components/OnboardingExperience.tsx) overlay now accepts tutorial guide events in addition to the original first-run onboarding event.

Guide behavior:

- navigates only through normal React Router navigation;
- highlights actual page controls using `data-onboarding-target`;
- falls back to an explanatory card when a target is not currently rendered, such as a task detail control that requires the user to choose a task;
- never creates, edits, assigns, approves, submits, deletes, uploads, or changes a business record;
- stops before mutation controls when the next step would require a user decision;
- preserves the existing unsaved-change/navigation guard because it uses the same application navigation path;
- supports keyboard next/back, Escape, focus management, progress, and mobile fallback behavior.

Real workflow targets were added to the existing UI for task search, task creation, task delegation, task review, output files, client review, delivery search, reports, settings, service plans, company entry points, and the main Help page.

## Contextual help

[`src/components/ContextualTutorialLink.tsx`](src/components/ContextualTutorialLink.tsx) adds compact, permission-aware entry points in genuine workflow contexts:

- task delegation;
- revision control;
- client approval/review;
- delivery tracking;
- reports;
- service-plan management.

The component renders only when the referenced tutorial has a safe guide, so it cannot advertise an unavailable walkthrough.

## Progress and localization

[`src/lib/onboarding.ts`](src/lib/onboarding.ts) stores tutorial progress separately from first-run onboarding, keyed by user ID in `aitask:tutorial-progress:v1` with an in-memory fallback. The record supports:

- `startedAt`;
- `completedAt`;
- `lastViewedAt`;
- `lastStep`.

Progress is read and written per user, so one user’s completion state does not affect another user’s recommendations. New fixed UI labels were added to the existing i18n dictionary and the strict AST translation audit passes with zero findings.

## Verification

Added regression coverage:

- [`src/lib/tutorials.test.ts`](src/lib/tutorials.test.ts) checks role coverage, category coverage, bilingual search, complete tutorial sections, and related-link integrity;
- [`src/lib/onboarding.test.ts`](src/lib/onboarding.test.ts) checks tutorial progress isolation and last-step persistence;
- [`e2e/tutorial-centre.spec.ts`](e2e/tutorial-centre.spec.ts) verifies project-manager search/read/guide behavior and client-scoped English/Chinese search.

Verified during implementation:

- `pnpm check` — passed;
- `pnpm lint` — passed;
- `pnpm test` — passed, 109 files / 839 tests;
- `pnpm build` — passed;
- `pnpm verify:i18n:strict` — passed, 0 findings;
- focused tutorial, onboarding, and theme coverage tests — passed;
- Playwright Tutorial Centre tests — 2 passed;
- no deployment performed.
