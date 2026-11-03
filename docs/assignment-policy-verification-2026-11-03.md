# Assignment policy change — 3 November 2026

Implemented against production baseline afc6804549fabf66f5761b6952e9b4b44654393d.

## Resulting rules

- A PM can assign any active internal member, across departments and project membership, while the assigning PM remains restricted to managed projects.
- An explicitly assigned HOD or PM can view and work on that task outside project membership. This does not grant access to unrelated project tasks or allow an outsider PM to reassign tasks in that project.
- HOD delegation can select active Staff in the department without requiring target project membership. The HOD’s own scope and department limits remain.
- Ordinary Staff cannot create tasks, including through role templates or individual permission overrides. HOD creation remains available.
- Forms, store validation, permissions settings, onboarding/tutorial copy and database functions follow these rules. Optional legacy HOD routing remains supported for existing tasks.

## Verification

- Unit suite: 128 files, 1,011 tests passed.
- Browser regression: PM selects an outside-department HOD, assigned HOD accepts task outside project membership, Staff has no New task action — passed.
- TypeScript, changed-form ESLint, strict translation coverage, migration file verification and production build — passed.
- Both migrations applied to an isolated PostgreSQL fixture using current production function definitions. All 15 permission/assignment predicate assertions passed, including outsider PM access and rejection of reassignment outside managed project scope.

The complete Docker Supabase rollout gate passed: 85 pgTAP files / 1,196 tests, database lint/advisors/postflight, authenticated store saves, Storage, HOD status and browser save recovery, onboarding recovery, review gating and HOD output UI. Cross-department HOD and outsider PM acceptance/editing and HOD delegation without target project membership passed through real Auth/REST. Assigned outsider PMs cannot move or reassign another PM’s project task.

Routine edits preserve project metadata and do not require project visibility. The PM company lookup preserves portfolio boundaries despite task-only access.

## Release status

Both production migrations were applied on 3 November 2026 and recorded as 20261103125940 and 20261103125949. All six changed production function fingerprints exactly match the Docker-validated stack. Matching app deployment is in progress.

The original MX Clinic error was not conclusively reproduced; the verified changes implement the requested assignment policy and remove the related access barriers.
