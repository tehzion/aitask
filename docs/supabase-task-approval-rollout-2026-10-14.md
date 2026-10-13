# Task approval Supabase rollout — 14 October 2026

Production project: `ohjhwyiffgzyatcmmdql` (AiTask). Applied the four task approval migrations from committed source `9a2c9c9c6d07ac5c7fa3a13a7a43bd784e11afae`, in the requested order. Each migration succeeded and its function/trigger installation was checked before continuing.

| Repository migration | Recorded production migration |
| --- | --- |
| `20261013053636_hod_review_handoff` | `20261013164424_hod_review_handoff` |
| `20261013055051_task_stage_progress` | `20261013164440_task_stage_progress` |
| `20261013105534_task_role_readiness_hardening` | `20261013164522_task_role_readiness_hardening` |
| `20261013160804_task_dependency_review_invalidation` | `20261013164548_task_dependency_review_invalidation` |

Existing Staff recovery (`20261013102204`) and frozen workflow review gate (`20261013061241`) were retained. Connector migration history was preserved. The manifest now records aliases for the newly applied migrations and earlier already-installed migrations; those earlier migrations were not reapplied. The staged manifest covers committed source, while the working manifest preserves the separate privacy/delivery-link entries already present in the working tree.

## Production verification

- Saved the previous definitions, function privileges, triggers, migration history and data fingerprints before any migration. The existing signed-workflow guard matched the previously validated production baseline exactly.
- All **72 hosted database assertions** passed: HOD handoff 11, role progress 23, readiness hardening 28 and signed workflow/revision recovery 10. Assertions were evaluated inside transactions and raised an exception on failure or count mismatch; every test transaction rolled back. These are database role/JWT and RPC checks, not hosted browser or Auth-login tests.
- Verified Staff submission at 60%, department HOD approval at 80%, customer acceptance remaining at 80%, PM finalization at 100%, revision at 50%, and denial of Staff/HOD finalization.
- Verified missing-HOD submission failure, HOD notification/RLS visibility, existing review-notice repair, signed approval preservation, downstream approval invalidation, completed private-note saves and constrained automatic dependency reset while denying direct Staff withdrawal.
- Database lint checked all **10 changed PL/pgSQL functions** with zero errors or warnings. The lint extension was installed only inside a rolled-back transaction.
- The 11 existing member records and every non-notification entity count and data hash are unchanged. The 1,290 pre-existing notifications are unchanged. The only persistent data addition is **8 targeted HOD review notifications** (total 1,298).
- Auth user count remains 10. No test users or test workspaces remain. The member-role guard is enabled. The six trigger/repair functions use a fixed empty search path and deny direct anonymous/authenticated execution.
- Security and performance advisors reported zero errors and no new security notices. Existing warnings remain for signed-in execution of an existing privileged API and leaked-password protection; Auth settings were preserved. See the [function execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Frontend and reviewer configuration

Database release is complete. The inspected [production frontend](https://aitask-virid.vercel.app/build-info.json) is version 3.0.0 at commit `3933b3f90542510a8df5b9241b36adc839d341f4`, built at `2026-10-13T06:18:57.609Z`. That commit does not contain the task workflow access helper or commit `83bebb9`. Full interface acceptance still requires deploying the corresponding committed frontend changes. No frontend deployment was performed in this operation.

Designer HOD configuration remains unchanged. Its two pending-review tasks have no configured department HOD and were skipped by notice repair. No member role or reviewer was assigned. Existing groups with an HOD received their repaired notices.

Recovery baseline, exact deployed SQL, receipts, rolled-back test SQL, lint and advisor evidence are saved locally in `/private/tmp/aitask-hod-rollout-20261014-r8j3z0cu`. Raw recovery files are kept outside Git.
