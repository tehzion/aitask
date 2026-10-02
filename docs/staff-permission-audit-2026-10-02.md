# Staff permission audit — 2 October 2026

## Outcome

Audited Staff alongside HOD, Project Manager, Boss Koo and Client access. Staff remains able to create work in their departments, update/comment on assigned or self-created tasks, and execute assigned service work. HOD retains department oversight and authorized delegation to eligible staff. Ordinary Staff does not gain department-wide access merely by sharing the HOD's departments.

Found and fixed one store/database discrepancy: cycle status updates, deliverable status updates and cycle comments did not recheck assigned-service access after that permission was revoked. The store now rejects these actions immediately, preserving local records instead of waiting for a database rejection. Explicit service-management grants keep their existing execution path.

## Role boundaries checked

| Role | Task scope and collaboration |
|---|---|
| Staff | Assigned or self-created tasks; sharing a department alone grants no oversight. Default Staff cannot reassign work or change its department. Custom permissions remain supported. |
| HOD | Own/assigned work plus department oversight; delegation requires the existing ownership/assignment authority and department eligibility. |
| Project Manager | Owned company/project portfolio plus own/assigned tasks. |
| Boss Koo | Workspace oversight and member/role administration. |
| Client | Company-specific client-visible work and permitted review actions; internal work remains isolated. |

Service execution remains separate from HOD department oversight. Assigned-service permission and relevant task assignment are required for ordinary Staff/HOD execution and comments. Neither task creation nor department membership substitutes for assignment.

## Evidence

- All **386 unit tests across 61 files** passed, including six new Staff/HOD cases covering allowed execution, immediate permission revocation, and denied creator-only/department-only service access.
- **15 browser tests passed** across HOD parity, task-detail authorization, role reports and role UX suites. Coverage includes delegation to eligible Staff, immutable task ownership, foreign task denial, revoked delegation, Client isolation, translated Staff filters, keyboard interaction and mobile accessibility.
- TypeScript, lint and production build passed.
- Final disposable database gate passed **544 assertions across 38 files**, including three added assigned-service revocation regressions and real local Auth/REST/Storage integration. The revocation fixture uses Boss Koo authorization, matching member security rules.
- Production read-only authorization audit examined all four Staff accounts and the HOD account. Across **930 account/task combinations** (186 tasks each), view/edit checks had **zero scope mismatches**. Across **405 account/company combinations** (81 companies each), service access checks had **zero scope mismatches**. These checks compare deployed helpers with the expected ownership, assignment, department and permission predicates; they are not authenticated browser sessions.
- All five audited accounts deny approvals, member administration and global task-edit permissions. All live accounts have department entries; no live Staff/HOD account currently has a custom-role assignment.

## Rollout and limits

No production task, member permission, assignment, notification or company record was changed by this audit. The correction is frontend/store code and needs no database migration. Deployment of this audit's frontend correction has not been performed from this chat.

The production checks cover existing configurations. Custom roles, service mutations and negative authorization paths are covered by local automated suites, rather than by writing test data to production. Existing HOD audit changes in this shared workspace were preserved. Database authorization was reviewed against [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
