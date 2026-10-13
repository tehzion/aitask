# Chained task approval audit — 14 October 2026

The follow-up checks the task workflow beyond the initial role handoff. Deployment and Designer reviewer assignment are deferred as requested.

## Reproduced and fixed

1. **Stale downstream approval:** an ordinary downstream work step at HOD-approved 80% survived upstream revision. The frozen-workflow invalidation query only selected Completed and Waiting Approval, or signed internal reviews. It now also selects Approved work. The upstream revision withdraws downstream review/approval and customer acceptance. Staff must complete the upstream revision before resubmitting downstream work; HOD reapproves and PM finalizes it.
2. **Completed private notes refused:** the stage guard allowed Staff to edit private notes after completion, while signed-workflow output versioning treated the note as new output and demanded a new HOD signature. A note edit that keeps Completed status now preserves the output version, HOD signature and downstream state. Approved-stage notes and material output remain protected by the existing revision requirement.
3. **Automatic reset blocked as a Staff action:** Staff restoring a cancelled optional upstream step legitimately invalidates downstream submission. The Staff transition guard rejected the nested server reset, rolling back the source action. A narrowly constrained exception now permits that automatic reset: nested trigger execution, an existing workflow task, a ready/reviewed old state, Pending new status, false completion, Pending customer acceptance, and exact equality of all non-reset fields. It defaults to false when conditions or payload values are missing. Staff still cannot directly withdraw submitted work, assign approval, replace output or finalize it.

Each regression failed against its previous implementation before its fix. The regression suite covers recovery after revision, blocked premature resubmission, completion at 100%, preserved signatures on private-note saves, optional cancellation recovery, and direct Staff withdrawal denial.

## Verification

- 686 SQL assertions across 47 files passed on a disposable Supabase database with the installed frozen-workflow dependency.
- Database schema lint passed.
- Existing real Auth/REST scripts passed for PM, HOD, legacy Staff/HOD, Staff and Client, including saved role actions, notifications, customer revision/acceptance and signed frozen HOD approval followed by PM completion.
- No frontend source changed in this follow-up. The earlier 597 unit tests, 8 browser tests and successful build remain the frontend baseline.
- Supabase advisors reported no errors; the disposable database and test accounts were cleaned up.

The migration conditionally patches signed workflow functions only when the optional extension is present. It retains existing private-function privileges and uses an empty search path. No additional API endpoint or actor permission is granted.
