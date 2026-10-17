# Task role readiness — 13 October 2026

> **16 October 2026 follow-up:** The production migration list now includes the
> task-stage, role-readiness, optional-approval, PM/HOD assignment, client-visible
> completion-review, and service-transition migrations described below. The
> production task guard advertises all three corresponding branches: a responsible
> PM may complete approved work at 100%, may directly complete an ordinary task
> that explicitly opts out of internal approval, and client-visible PM completion
> leaves the separate client decision pending. Client acceptance by itself remains
> at 80% until PM completion. The historical rollout gap retained at the bottom of
> this document describes the 13 October audit state, not the current deployment.

## Implemented workflow

| Actor | Action | Progress |
| --- | --- | --- |
| PM | Assign work to HOD | 10% |
| Department HOD | Delegate to Staff | 20% |
| Assigned Staff | Accept/start work | 30% |
| Assigned Staff | Submit evidence for HOD review | 60% |
| HOD / PM, or customer rejection | Return for revision | 50% |
| Department HOD | Approve submitted evidence | 80% |
| Client | Confirm delivery | Remains 80% |
| PM | Confirm final completion after HOD approval | 100% |

Store and database checks enforce approval and completion permissions. Staff cannot approve or finalize work. HOD cannot finalize work. Customer decisions use the customer review action. Historical Staff accounts with the built-in HOD role receive department HOD access without acquiring PM permissions.

Submission now rejects a missing department HOD with an actionable error. Successful submissions, including newly created review tasks, create targeted HOD notifications. The migration backfills missing notifications for existing submissions with a configured HOD and can be rerun idempotently after reviewer configuration. Approved output cannot be replaced without returning it for revision; frozen workflow approval signatures survive unchanged PM finalization. HOD approval requires output evidence.

The client command serializer handles minimal public service-cycle records and omits private assignee fields. Backend capability negotiation accepts supported schema version 4 or version 5 with its explicit workflow review gate, allowing the existing signed-review backend to remain writable.

## Validation

An isolated snapshot contains only this follow-up's changes on commit 06c8ce8, preserving unrelated pending edits in the working tree.

- 597 unit tests across 82 files passed.
- TypeScript checks and ESLint passed.
- 8 browser workflow tests passed.
- 677 SQL assertions across 47 files passed; database schema lint passed.
- Disposable local Supabase accounts exercised actual Auth, frontend store saves, REST persistence, targeted notifications, customer acceptance/revision, PM completion, legacy HOD access and signed frozen review finalization.
- Production build and bundle checks passed.

No production data or role assignments were changed. Test accounts and the disposable database were cleaned up.

## Production readiness gap

The read-only production audit found the new HOD handoff and staged progress functions were not installed. Roll out the frontend and the pending migrations through the existing release process, including 20261013053636_hod_review_handoff, 20261013055051_task_stage_progress and 20261013105534_task_role_readiness_hardening. The isolated database tests also include the already-installed production frozen-review dependency; preserve migration alignment during rollout.

Production has 10 waiting-review tasks: 8 have a configured department HOD and can receive repaired notifications; 2 Designer tasks have no Designer HOD. The user must choose the Designer HOD before those submissions can be routed. No reviewer was guessed or assigned. A separate unused test Staff record lacks an Auth account and has no assigned work; it was left untouched.
