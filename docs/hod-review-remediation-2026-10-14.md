# HOD review remediation — 14 October 2026

This implements the four defects and review-ownership gaps in [the deep audit](hod-latest-deep-audit-2026-10-14.md). The HOD and PM production migrations were applied and verified on 15 October 2026. Frontend rollout is in progress under the user’s explicit authorization to deploy directly without staging/CI.

- Department reviewer authority is enforced in both client and server transitions, including revisions on legacy out-of-department assignments.
- Review selection ignores members without usable Auth accounts and excludes the assignee and review submitter. Independent portfolio PM fallback is available when needed.
- Responsible PMs can name an accountable lead and appoint independent review cover for up to 90 days. Cover handoff is transactional, expiry restores normal reviewer selection, and UI controls refresh at expiry.
- Boss self-review requires an explicit reason. All approval decisions carry server-owned reviewer and timestamp metadata; crafted decision payloads are rejected.
- A worker or responsible PM can upload PDF/image output from the task panel to private Storage. The task retains its own canonical attachment reference, with save confirmation, retry recovery, and rejected-upload reconciliation.
- Submitted output is immutable until revision. Task files participate in frozen output versions and downstream signed-review invalidation. Authorized reviewers can read completed predecessor files without exposing predecessor private text.
- Client projection and Storage download authorization release public task output only after internal approval. Unchanged Approved-status edits preserve customer acceptance.

Migration: `supabase/migrations/20261014132839_hod_review_remediation.sql`. Apply the validated migration tail before publishing the frontend. New upload/configuration controls check the advertised capability and reject incompatible backends. The migration does not rewrite live task status, assignments, or role grants. Older tasks acquire their accountable lead through a later authorized task update.

## Validation

The combined checkout includes separately authored PM portfolio fixes; those changes are preserved.

- Unit/permission suite: **676 tests across 93 files passed**.
- Disposable Supabase rollout: **880 pgTAP assertions across 54 files passed**; database lint, advisors, postflight, and real Auth/REST/Storage gates passed.
- Browser regressions: **29 targeted tests passed** (8 HOD/signed workflow, 20 HOD/client/feedback, plus the additional cover-expiry case; the final three-case remediation rerun also passed).
- Real browser upload gate: task-owned file upload, deliberately lost command response, explicit retry, exactly one Storage object, worker submission, independent HOD download/approval, Client denial before approval, Client download after approval, and PM completion all passed.
- Typecheck, lint, strict translation coverage, and diff whitespace checks passed. Production build passes the unchanged **300 KiB** eager gzip budget at **299.9 KiB**.
- Desktop cover settings and mobile override/output panels were visually inspected; mobile overflow checks pass.

The first broad browser run was interrupted during local resource contention; all affected tests passed on an isolated rerun. A file-only SQL fixture's old link assertion and the real Client dialog-name assertion were corrected before the final passing gate. No production credentials, workspace data, roles, assignments, or deployments were changed.

Evidence: [desktop cover](audit-evidence/hod-latest-2026-10-14/review-cover-desktop.png), [mobile override](audit-evidence/hod-latest-2026-10-14/review-override-mobile.png), [mobile file review](audit-evidence/hod-latest-2026-10-14/output-review-mobile.png), and [validation record](audit-evidence/hod-latest-2026-10-14/remediation-verification.json).


## Production database rollout — 15 October 2026

Applied connector migrations `20261015002054_hod_review_remediation` and `20261015002102_pm_portfolio_service_boundaries`. The preflight/postflight counts and data hashes match for every entity type and all 11 members; 189 tasks are preserved. The review capability, portfolio policy, and independent handoffs are active. Security advisors report no ERROR-level findings. Recovery function definitions are kept owner-readable outside Git. Frontend deployment and live build verification are in progress.
