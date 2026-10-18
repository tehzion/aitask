# AiTask Tutorial Deep Audit — Initial Findings

**Audit date:** 2026-10-18
**Status:** Initial findings recorded before remediation
**Scope:** Phase 1–3 onboarding, Help Centre, detailed tutorials, contextual guidance, workflow guides, feedback storage, role boundaries, accessibility, responsive behaviour, and release gates.

## Evidence collected

- Source review of `src/pages/Help.tsx`, `src/components/OnboardingExperience.tsx`, `src/components/ContextualTutorialLink.tsx`, tutorial catalogue/workflow data, feedback client code, migration, and database tests.
- Existing focused browser suite: `pnpm exec playwright test e2e/tutorial-centre.spec.ts e2e/onboarding.spec.ts --reporter=line` — **4 passed** in the local demo environment.
- The existing suite confirms the happy paths for Project Manager and Client search, guided navigation, onboarding skip/restart, local feedback saving, and Chinese tutorial search. It does not exercise all role, viewport, keyboard, or database-policy combinations.

## Initial findings

| Priority | Area | Finding | Evidence | Planned disposition |
| --- | --- | --- | --- | --- |
| P1 | Workflow guides | `Help` required every workflow stage's linked tutorial to be visible to the current role. Every supplied workflow crosses roles, so no internal persona satisfies that condition and the page renders an empty Workflow learning guides section. | `src/pages/Help.tsx` filtered `workflowGuides` with `stages.every(...)`; `website-design-project` alone spans Project Manager, HOD, Staff, reviewer, and Client stages. | Show the high-level, non-sensitive workflow map to internal users; expose a stage's linked tutorial only when that tutorial is in the user's visible catalogue. Do not render internal workflow guides to Clients. |
| P1 | Role boundary | The Help detail panel renders every `related` tutorial ID without checking it against the current role's visible catalogue. A Client can open an all-role guide and then select an internal related tutorial such as `monitor-task-progress`. | `TutorialDetail` calls `getTutorialById` directly for related links; `openTutorial` accepted any `Tutorial`. | Gate all Help-opened tutorials and related links by the visible catalogue, and add regression coverage for the Client path. |
| P2 | Guided overlay integrity | The onboarding overlay trusted the `steps` payload from a browser `CustomEvent`. A script on the page could present unregistered guide copy and client-side routes. It does not mutate business data, but it bypasses the catalogue/role guard at the UI layer. | `OnboardingExperience` stored event-supplied `detail.steps`. | Resolve guide steps only from the canonical tutorial catalogue after role validation; event payloads carry only the tutorial ID. |
| P2 | Database assurance | The feedback migration has RLS, grants, ownership predicates, and a uniqueness constraint. Its pgTAP test verifies schema/policy shape only; it does not execute allowed/denied read and write cases under distinct authenticated identities. | `supabase/migrations/20261018032155_tutorial_feedback.sql`; `supabase/tests/database/tutorial_feedback.test.sql`. | Extend the database test to exercise identity and workspace boundaries where the local database runner is available. |
| P2 | Responsive/accessibility coverage | Current focused browser coverage is desktop-only and does not validate overlay focus, keyboard progression, each guide target, or narrow viewport overflow. | `playwright.config.ts` has only Desktop Chrome; the focused specs cover selected happy paths. | Add targeted keyboard, viewport, role-boundary, and full guide-target audit tests. |
| P2 | Persistence verification | Browser-local tutorial progress and the local-demo feedback fallback are correctly scoped by user key in unit tests, but secure Supabase feedback persistence has not yet been verified against a reachable database in this audit. | `src/lib/onboarding.test.ts`, `src/lib/tutorialFeedback.test.ts`; remote verification requires a configured/reachable Supabase environment. | Run migration/database checks when the local or staging Supabase target is available; record the outcome in the final test and release reports. |
| P3 | Catalogue confidentiality | Tutorial content is shipped in the client bundle. UI role filtering is appropriate for product guidance, but client-side static copy must not be treated as protection for confidential internal policy or customer data. | `src/lib/tutorials.ts` is bundled client-side. | Keep the catalogue free of sensitive content; rely on server-side authorization/RLS for records and actions. |
| P3 | Tooling freshness | The local browser run reports a six-month-old `caniuse-lite` database. | Browser run warning from Browserslist. | Track as routine dependency maintenance; it does not block functional remediation. |

## Initial release position

**Not ready for production at this point.** P1 role-boundary and workflow-guide defects must be remediated and retested. Production database connectivity, applied-migration status, backup/rollback evidence, and production deployment verification have not been established by this baseline.

## Audit constraints

- No business records, task statuses, assignments, files, approvals, or feedback were changed during this baseline review.
- Existing working-tree changes are preserved and are not assumed to be part of this audit unless they are explicitly referenced above.

## Final audit outcome — 2026-10-19

**Result: application remediation and local QA passed; production release is not approved.** The functional P1/P2 findings from the initial audit have been fixed and retested. The remaining release gate is an environment and change-control blocker: the repository's current migration tail is newer than the immutable production-verification record, so a truthful production migration, backup, and deployment verification is still required.

### Remediated findings

| Initial finding | Final result | Verification |
| --- | --- | --- |
| Internal workflow maps were filtered out for every role | Fixed. Internal users see the high-level map; a stage link appears only when the linked tutorial is in that user's catalogue. Clients do not receive the internal workflow map. | Role-boundary browser spec; final 10-test browser run. |
| Related tutorials could bypass role filtering | Fixed. Help navigation, direct selection, and related links accept only tutorials visible to the signed-in persona. | Client negative-path test confirms an internal direct tutorial URL and related internal link cannot be opened. |
| Browser event could inject arbitrary tutorial steps | Fixed. The event carries only a tutorial ID; the overlay resolves canonical catalogue steps only after role validation. | Browser test attempts an internal ID and injected copy/routes; both are rejected. |
| Feedback RLS test checked policy shape only | Fixed. The pgTAP test now executes owner, coworker, cross-workspace, read, update, and impersonation cases under authenticated identities. | Isolated local Supabase run: 19 tests passed. |
| Search did not recognize the Chinese approval term | Fixed. The approval guide has the missing `审核工作` search synonym. | Catalogue unit tests cover the requested English and Chinese role-scoped searches. |
| First-login onboarding could highlight an off-page target | Fixed. Persona onboarding steps now have canonical routes and the overlay navigates to those routes before resolving the target. | PM route/back/finish/refresh browser coverage; target-and-route unit coverage for every persona. |

### Functional and content audit

- The Help Centre supports catalogue search, category selection, detail reading, related links, guided overlays, progress, restart, and locale switching. Tutorial visibility is role-scoped at every Help entry point.
- The comprehensive browser walk completed each practical guide for Super Admin, Project Manager, HOD, Staff, and Client. It validates the route for every routed step and requires either the declared highlight target or the explicit safe fallback for record-specific context.
- The catalogue is bilingual and unit-tested for the requested English/Chinese terms, instructional section completeness, and Simplified-Chinese copy detection. Strict localization verification reports zero findings across 180 source files.
- First-login onboarding has explicit overview routes for all personas. It supports Start, Back, Next, Skip, Finish, Close, restart, and local per-user persistence. The Super Admin's account remains absent from the public demo account list; the audit used the seeded credentials only in the local test environment.

| Capability | Evidence and final result |
| --- | --- |
| First-login onboarding | Project Manager and Client browser flows cover welcome copy, Start, Back, Next, Skip, Finish, restart, refresh persistence, and page routing. Persona route/target mappings are unit-tested for Super Admin, HOD, Staff, and Client. |
| Help, search, contextual links, and checklists | Search, details, related links, contextual launch, and progress were exercised through the browser. Requested English/Chinese search terms, duplicate filtering, role filtering, and Chinese active-guide switching have regression coverage. |
| Role workflow guidance | Each practical guide was opened in the appropriate Super Admin, Project Manager, HOD, Staff, or Client session. The test verifies the authored route plus target/fallback without issuing a state-changing workflow action. Existing task-workflow unit coverage remains in the 848-test suite. |
| Progress and feedback | Per-user onboarding/tutorial progress persistence and restart behavior are covered in unit/browser tests. Feedback success, duplicate/error handling, and secure-table ownership/workspace boundaries have unit and pgTAP coverage. |
| Custom roles | Custom-HOD persona mapping is unit-tested. A separate persisted custom-role account/browser session was not available in the local demo fixture; this is recorded as a pre-production smoke-test item, not represented as complete browser coverage. |

### UX, responsiveness, and accessibility assessment

- The guide UI is a labelled dialog with a clear step count, Skip/Back/Next/Finish controls, Escape support, arrow-key navigation, visible focus styles, and an explicit fallback when a record-specific target is not open.
- Browser coverage checks keyboard Next/Escape, 320 px compact guidance, 375/390/768/1024/1440 px widths, and 700 × 320 landscape with no horizontal overflow in the covered guide path.
- The live interaction and automated accessibility semantics are satisfactory for this release candidate. A manual assistive-technology pass (screen reader and physical-device touch testing) is still recommended before a future production promotion; it is not represented as completed automated coverage.

### Security and data assessment

- Tutorial UI filtering is defence in depth only. The shipped catalogue must remain free of confidential internal policy, customer data, secrets, or authorization decisions; authorization remains server-side/RLS enforced.
- The feedback table policy test now demonstrates workspace isolation and ownership constraints. A disposable local Supabase stack was created, migrated, tested, stopped, and removed; no production database or business data was modified.
- The production configuration source was inspected without exposing secret values. It specifies the Supabase backend and disables demo login and password-reset bypass. Hosting-provider environment state was not independently read or changed.

### Residual non-blocking engineering observations

| Priority | Observation | Disposition |
| --- | --- | --- |
| P3 | Browserslist reports a six-month-old `caniuse-lite` dataset. | Schedule routine dependency refresh. |
| P3 | The production build retains a 554.09 kB minified `workspaceRuntime` chunk (161.78 kB gzip); the tutorial bundle itself is split into a 128.93 kB minified lazy chunk. | Track bundle splitting separately; no tutorial-flow regression was observed. |
| P2 | Manual screen-reader/device testing is not automated in this audit. | Include in the authorized pre-production smoke plan. |

### Final release position

The tutorial implementation is **functionally ready in the local audited environment**, but the overall release is **not ready for production** until the migration/release proof described in `AITASK_TUTORIAL_RELEASE_READINESS.md` is completed under authorized production change control.
