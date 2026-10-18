# AiTask UX Release Checklist

Assessment date: 2026-10-19 (MYT)  
Decision: **NOT READY FOR PRODUCTION**

The UX implementation is locally verified, but production promotion requires the unresolved P0 gates below. Production deployment and migration actions require explicit authorization and were not performed.

## Implementation gates

- [x] Onboarding overlay leaves navigation usable at 320, 375, 390, 414, 768, and 1024px.
- [x] Tutorial start, skip, Back/Next/Finish, Escape, and keyboard behavior remain covered.
- [x] Global search is grouped, keyboard-navigable, mobile-safe, localized, and permission-aware.
- [x] Unauthorized tasks, projects, companies, clients, and service plans are excluded from search results.
- [x] Quick task creation shows essential fields first and preserves validation, role guards, drafts, retries, and duplicate protection.
- [x] Personal task views support save, open, update, delete, URL-backed filters, per-user storage, obsolete-filter cleanup, and Boss table/board preference.
- [x] My Work and Action Centre use existing queues and notifications without a new business model.
- [x] English/Chinese copy is registered and verified.
- [x] TypeScript, lint, unit, i18n, migration-file, build, visual, accessibility, permission, and full Playwright checks pass.
- [x] Full desktop Playwright suite passes: 355/355.

## Production blockers

- [ ] Prove migration parity against the authorized production target for the complete ordered migration tail.
- [ ] Create and verify a fresh production backup/restore point before migration or promotion.
- [ ] Produce an authorized preview/deployment artifact and verify revision provenance.
- [ ] Run authenticated production-equivalent smoke tests for Boss, Project Manager, HOD, Staff, Client, and relevant custom-role boundaries.
- [ ] Record monitoring, rollback owner, recovery timing, and the approved promotion decision.

## Non-blocking follow-up

- [ ] Refresh Browserslist data.
- [ ] Split or otherwise optimize the existing large `workspaceRuntime` and `reportsCharts` chunks.
- [ ] Add a manual screen-reader and physical-device pass before production promotion.

## Promotion sequence

1. Obtain explicit release approval and a reviewed migration plan.
2. Create and verify the fresh backup/restore point.
3. Run preflight parity and provenance checks against the authorized target and preview.
4. Apply approved migrations in order and record the actual deployed version.
5. Deploy the reviewed preview/artifact with production-equivalent configuration.
6. Run role, permission, onboarding, search, task-creation, saved-view, and client-isolation smoke tests.
7. Confirm monitoring and rollback ownership, then promote only after an authorized reviewer accepts the evidence.

## Rollback posture

Preserve the prior application artifact. If production behavior requires rollback, use the approved deployment rollback process; do not delete saved views, tutorial data, or database records as an ad hoc rollback. Any database restore or down migration requires explicit incident authority and a reviewed data-preservation plan.
