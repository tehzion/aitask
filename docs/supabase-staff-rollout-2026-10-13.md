# Supabase committed-fix rollout — 13 October 2026

Production project: `ohjhwyiffgzyatcmmdql` (AiTask).

Deployed the committed Staff recovery migration from commit `4881aa9` and the
committed feedback function. Supabase recorded the migration as
`20261013102204_staff_workflow_recovery`, corresponding to repository migration
`20261013035142_staff_workflow_recovery.sql`. Connector history was preserved.
`aitask-feedback` is active at version **22**, pins Supabase SDK **2.117.3** and
matches the committed source exactly. Its existing public-endpoint JWT setting
was preserved; validation/rate limiting remain in its handler.

The onboarding journal/v3 finalizer and invitation function version 35 were
already deployed. Privacy, delivery-link, HOD deletion and the signed workflow
review gate were also present before this rollout and were not reapplied.

## Verification

- Exported the committed source into an isolated temporary checkout. Added the
  already-deployed privacy/delivery-link SQL and the exact recorded production
  review-gate migration to validate their compatibility with Staff recovery.
- All **614 database assertions in 43 files** passed, plus database lint,
  advisors and postflight. Real disposable Auth/REST Staff/HOD saves, private
  Storage recovery and onboarding recovery passed. The disposable stack was
  stopped and removed.
- One older test expected schema version 4. The isolated expectation was updated
  to the already-deployed schema version 5. The production frontend build
  `3933b3f90542510a8df5b9241b36adc839d341f4` also uses version 5. Production
  capability settings and the shared checkout's test were not changed.
- All **17 hosted Staff database assertions** passed inside a transaction that
  rolled back. No fixture Auth users or test workspace remain.
- All 11 existing members and every entity type retained their preflight counts
  and data hashes. The existing workflow-review guard definition hash is
  unchanged.
- The four Staff-recovery private functions have fixed empty search paths and
  deny direct anonymous/authenticated execution.
- Retrieved feedback version 22 matches source. Endpoint checks returned feedback
  OPTIONS 200, feedback GET 405 and invitation GET without JWT 401.
- Security advisors report no ERROR-level finding. Existing deny-by-default
  RLS/definer notices and leaked-password protection warning remain.

Function-definition preflight backup is owner-readable at
`/private/tmp/aitask-supabase-deploy-20261013-x7_ijhyd/production-function-preflight.json`.
Validation evidence is in
`/private/tmp/aitask-committed-supabase-deploy-validation-final-20261013.log`;
raw disposable startup logs can include ephemeral local credentials and should
not be published.

## Scope remaining

The uncommitted HOD review-handoff and task-stage/progress migrations were not
deployed by this rollout. They are separate ongoing workspace changes and need
compatibility verification against the production review gate before rollout.
This operation did not deploy frontend code, change Auth settings, upgrade
PostgreSQL or certify a complete authenticated hosted browser/Edge save flow.
The shared release manifest still needs its deployment aliases reconciled with
this evidence while preserving the other ongoing edits.
