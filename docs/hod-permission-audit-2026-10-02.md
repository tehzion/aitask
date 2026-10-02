# HOD permission audit — 2 October 2026

## Scope and evidence

Compared frontend access helpers, store mutation guards, task/detail controls, company/project selectors, deployed authorization functions and HOD regression suites. Production currently has one HOD account, Mabel, with Video Shooting and Video Editor departments. HOD is intentionally normalized to Staff inside several database helpers; `aitask_is_hod` and department scoping preserve HOD-specific behavior.

A read-only comparison under Mabel's authentication context examined 336 live records: 186 tasks, 81 company profiles and 69 projects. After corrections, there were **zero mismatches** for the compared task view/edit, company view/edit/service-open and project read/edit decisions. Project read availability includes task-link choices, not only the narrower project listing. This is a snapshot of those decisions, not a claim that every possible account configuration or workflow has been exercised in production.

## Confirmed issues and corrections

| Finding | Correction | Deployment status |
|---|---|---|
| Tasks using legacy `Editor` department names were recognized in the interface but excluded by HOD database visibility/edit rules. Two live tasks reproduced the mismatch. | Canonicalize department names in task visibility/edit checks. The database normalizer now covers the frontend's internal department aliases. Invalid departments remain invalid. | Production database fixed. |
| HOD-targeted notification read-state changes worked through the dedicated endpoint but failed the generic mutation predicate because the normalized actor role was Staff. | Preserve explicit HOD targeting in the generic read-state authorization, with existing field restrictions intact. Project Manager notices remain denied to HOD. | Production database fixed. |
| Company deletion checked permission without checking company visibility in the interface/store. Stale or hidden company state could be removed locally before the database rejected it. | Require owned or visible company scope before offering/executing deletion. Pass current task scope into the shared guard. | Local frontend/store fix; release pending. |
| Populated Boss-curated projects were readable and linkable under the database policy but excluded from the task selector. Ordinary Staff could also receive a project choice from department membership alone, without matching database access. | Match the selector to owned/visible work or Boss/legacy-curated availability. Department membership alone does not grant plain Staff project access. Unrelated PM projects stay excluded. | Local frontend fix; release pending. |
| An out-of-department task assigned to an HOD could expose reassignment controls although the database denies that reassignment. | Match interface/store assignment authority to the actor’s departments, while keeping assigned work editable. | Local frontend/store fix; release pending. |
| Empty-recipient delegation feedback used a white background that could clash with dark-mode text. | Use semantic surface/border/text tokens. | Local frontend fix; release pending. |

The earlier assigned-task delegation correction remains applied and verified. HOD department oversight grants view/edit/comment/delete capability for department work, but **reassignment requires created-task ownership or current assignment to the HOD plus the management permission**. No new approval workflow was added.

## Verification

- **380 unit tests passed** across 60 files, including new HOD department aliases, assignment authority, service visibility, restricted permissions, company deletion and project linking tests.
- **541 database checks passed** across 38 files in a disposable stack. New suites cover legacy department task updates through the authenticated public command endpoint, generic and dedicated notification updates, company creation/deletion, denied access and HOD assigned-service execution.
- Assigned-service checks verify progress updates and cycle comments while denying deliverable insertion/deletion, unauthorized cycle-field changes and rewriting existing comments. HOD service-price access remains denied.
- Real local Auth/REST/Storage integrity tests passed as part of the database gate.
- Browser coverage exercises successful delegation, eligible-recipient filtering, immutable ownership, department oversight, denied foreign tasks, live permission revocation, mobile/dark empty-recipient feedback and populated Boss-curated project choices. The pre-existing task authorization matrix is included. Final run: **8 browser tests passed** (five new HOD scenarios and the three existing task authorization cases).
- TypeScript, lint, strict translations, theme coverage, production build, bundle and static PWA checks passed. Eager JavaScript remains within the 300 KiB gzip cap (approximately 298.1 KiB).
- Production read-only checks confirm both previously hidden Editor tasks are viewable/editable and HOD notification read updates are allowed while PM-targeted updates remain denied. No task assignment, notification read state, account permission or company record was changed for production verification.

## Rollout and limits

Existing delegation migration: repository `20260930110000_hod_assigned_task_delegation`, production connector version `20261002064719`.

New parity migration: repository `20261002065644_hod_permission_parity_followups`, production connector version `20261002070755`. Keep these generated connector versions; do not replay migrations or repair their timestamps based only on local filenames.

The production frontend still reports v2.6.1 at commit `4f5a23f`. The company-delete/project-selector/styling changes are local and have not been deployed, committed or pushed as part of this audit. Other audit migrations and hosted staging release gates remain pending.

Video Shooting has no Staff recipients at present. This is account configuration, not a delegation failure; eligible Video Editor staff exist.

Security advisors after rollout report the same categories/counts as before: four policy-free RLS tables, 17 signed-in security-definer RPC notices and disabled leaked-password protection. Those unrelated findings were not changed in this audit. See [RPC advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [policy-free RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
