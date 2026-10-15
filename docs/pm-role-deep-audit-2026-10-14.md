# PM role deep audit — 14 October 2026

Audited the current working tree against `docs/role-templates.md`. Preserved the HOD review remediation already in progress. This work changes source and adds a database migration; it does not deploy or mutate the hosted workspace.

## Fixed findings

| Priority | Finding | Fix |
| --- | --- | --- |
| P1 | Pricing SELECT authorization checked `viewServicePrices` without checking the snapshot's company. A PM's operational capability therefore exposed another portfolio's pricing through the Data API. | A restrictive policy binds PM service rows, including pricing, to the canonical company-access helper. Boss retains access. |
| P1 | The service RPC checked the capability for plan, add-on and pricing writes without checking the old record's company. A supplied ID could modify or delete another PM's record. | Validate old targets before executing the batch. A private trigger checks inserted/updated scope and prevents company relabelling or foreign parent associations. Atomic company/plan/pricing creation remains supported. |
| P2 | Local service actions checked role capabilities without checking target scope. Retained data after an ownership transfer could still be edited, activated, published or used to generate work. | Recheck current PM scope before every plan, cycle, deliverable, generation, activity, attachment and add-on mutation. Rejected actions leave all collections unchanged. |
| P2 | A PM who inherited a company could view its project tasks but could not save an unrelated priority edit. Project eligibility omitted company ownership context. | Pass the same company/project scope through the task form, full update, creation and project-link helper. New work in inherited projects is allowed; foreign portfolios stay hidden. |
| P2 | Approved tasks awaiting PM completion vanished from the dashboard review queue. `Waiting Approval` tasks were labelled as customer review based only on visibility. | Separate internal review, final completion and customer review queues. Count each waiting task once even when it appears in two queues. Keep all inputs permission filtered. |
| P2 | A one-off add-on could name a cycle from another company or plan and be inserted into that cycle's snapshots. | Check the target cycle's company and plan in both the local action and PM database trigger. |

The PM mutation regressions failed before the fixes: foreign service updates returned success, and the inherited-project edit was rejected. The repaired tests exercise the existing public store actions. Database regressions exercise actual authenticated SELECTs and transactional service commands, rather than checking function source alone.

## Scope reviewed

| Area | Expected PM behavior and verification |
| --- | --- |
| Companies and projects | Owned portfolio and connected work remain visible. Company ownership transfer opens inherited tasks without granting permission to change another owner's project metadata. |
| Task creation and assignment | PM can create and assign within the accessible portfolio, including department-less PM assignees. Staff/HOD department restrictions remain in place. |
| Internal review | HOD/independent reviewer selection, temporary cover and PM fallback remain governed by the current review rules. PM completion follows internal approval. |
| Client decisions | Customer review queue includes only visible work at a reviewable stage. Existing PM final-completion behavior is preserved. |
| Commercial operations | Catalog/templates retain their shared operational model. Company-specific plans, cycles, activity, add-ons and pricing apply portfolio scope. |
| Reports and scheduling | Reports, deadline rollover and dashboard measures use visible work; existing cross-role regression coverage is included. |
| Notifications and recovery | Existing submission-to-HOD handoff, transactional saves, retry/reload, canonical output evidence and foreign-file denial were checked by the focused browser and disposable backend probes. |
| Protected administration | Ordinary PMs retain no Approvals/member/role administration or workspace-wide task-edit capability. |

## Compatibility and policy

Parent validation runs for new or changed relationships. Routine updates to existing legacy cycles with a missing plan reference remain possible after scope validation; this preserves the upstream revision/reopening workflow. This is not permission to introduce a new foreign parent.

The current application and database deliberately mark customer acceptance approved when a PM confirms final completion. This audit preserves that rule. If explicit customer acceptance must be mandatory before completion, that needs a separately defined product rule and matching changes to both backends.

The migration is `20261014135947_pm_portfolio_service_boundaries.sql`, following the pending HOD remediation migration. Both remain listed in the rollout manifest's pending production migrations. Apply through the repository's staging-first release process.

## Verification evidence

See [verification metadata](audit-evidence/pm-2026-10-14/verification.json) for final results. The dedicated PM tests are `src/store/pmPortfolio.test.ts`, `src/lib/pmDashboard.test.ts`, `e2e/pm-portfolio.spec.ts`, and `supabase/tests/database/pm_portfolio_service_boundaries.test.sql`.

The local browser tests explicitly configure demo credentials and password-setup bypass. The task-authorization fixture preconfigures the demo password gate and release acknowledgement while retaining the actual sign-in flow; it checks the named task-status control rather than counting every dropdown. The new authenticated output probe acknowledges the server-backed notice and selects the file input unambiguously. These changes isolate the workflow assertions from unrelated onboarding/UI overlays.

The eager runtime shares its class-merging dependencies to reduce compression/request overhead and retain the existing bundle cap. The translation audit includes the lazily registered HOD review copy. No budget was increased. The disposable browser probe bounds embedded Vite shutdown, cleans its test records, and exits so the parent runner can remove the stack.


## Production release — 15 October 2026

Both HOD and PM migrations and the frontend are live. [The release record](hod-review-remediation-2026-10-14.md#production-frontend--15-october-2026) records the exact commit, migration aliases, user-authorized staging/CI exception, unchanged business data, and successful hosted smoke checks.
