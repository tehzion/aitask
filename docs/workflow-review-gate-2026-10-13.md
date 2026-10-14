# Internal workflow review gate — 13 October 2026

Generated workflow tasks require completed predecessors before submission or
completion. Staff submits work at 60%; the review department's HOD approves at
80%; the responsible PM separately confirms completion at 100%. Boss Koo retains
workspace oversight. Until a Designer HOD is configured, responsible portfolio
PMs review Designer work. Other departments keep HOD review. Assignment alone
does not give Staff or an HOD from another department approval authority.

## Approval and revision behavior

The task focus and full editor expose **Approve internal review** to authorized
reviewers. Completion options are disabled when the actor or dependencies do not
meet the gate. A legacy Completed internal review without a trusted decision is
returned for revision, resubmitted, approved at 80%, and finalized by the PM.
Changing department or assignee during approval/finalization is rejected;
reassignment must occur before review submission.

PostgreSQL resolves the step kind from the frozen service-cycle workflow. It
stamps the actual reviewer, timestamp, decision ID and predecessor output
versions. A private decision journal records the approval at the review task's
output version. Previously editable task JSON cannot create approval provenance.
Direct browser/service-role access to that journal is revoked; its RLS policy
absence intentionally denies direct access. The ordinary command audit remains
in place, including Boss and PM sign-offs.

Changing output content, attachments, completion status or revision count
advances its output version. Completed or submitted descendants reopen, their
signatures clear, and derived delivery/cycle progress reopens. Priority, dates
and assignment changes preserve approval. The journal retains the old decision
for audit; only a current valid decision counts toward readiness.

Generated step identity, predecessor links, department, visibility and frozen
workflow definitions are protected. Individual active workflow steps cannot be
deleted to skip review. Server cleanup remains possible for cancelled cycles.
Final delivery checks that every frozen required step exists and is satisfied.

## Scope and save consistency

The scoped workflow-context endpoint returns only visible task IDs, frozen kind,
output version, dependency readiness and the current valid review. It exposes
no hidden predecessor titles or content. Clients cannot use this internal
endpoint. A HOD can approve an authorized review using canonical readiness
without acquiring access to an earlier department's task.

Secure commands omit server-owned review metadata and counters. The database
checks canonical predecessor state and reviewer permissions even for crafted
requests. Successful workflow saves pull canonical state within the existing
session fence; a hidden predecessor's real version replaces optimistic local
metadata. Database cascades handle tasks outside the actor's scope.
An optimistic approval without a server decision ID forces a task update even
when its stored status already says Completed, so explicit legacy sign-off is
persisted and journaled rather than disappearing as an unchanged status.

## Release status

Migration `20261013035310_workflow_internal_review_gate.sql` was **applied to production
on 13 October 2026** as connector version `20261013061241_workflow_internal_review_gate`.
It adds the private journal, workflow guards and scoped read endpoint,
updates existing progress/deletion predicates in place, and advertises backend
schema version 5 with `workflowReviewGate` support. Existing function identities
and grants are preserved. It does not backfill or approve existing business tasks.

Apply this migration before releasing this frontend. The new frontend keeps
writes disabled when the backend lacks schema version 5 or review support.
The existing version 4 frontend also becomes read-only once the backend version
changes, so coordinate a short database/frontend cutover.
Existing unsigned Completed reviews require an explicit authorized approval;
there is no automatic historical sign-off. Old frontend completion requests are
also checked by the new database triggers.

The earlier HOD deletion migration is already recorded in production as
`20261013051554_hod_task_deletion_authority` (repository version
`20261012165347`). The release manifest preserves that connector alias and lists
the review connector alias as applied, with no production migrations pending.
Production history repair is unnecessary.

Production verification confirmed schema version 5 and authorized scoped context
through authenticated SQL request scope. All seven deployed function bodies match
commit `ae2688c`; both guards are enabled, the journal has RLS and denies direct
browser/service-role writes, and all private helpers deny direct client execution.
Unauthenticated context, missing predecessor and unsigned unresolved workflow
probes were denied. Existing function OIDs were retained.

The 1,853 business entities and 11 members retained identical counts and hashes
before and after deployment. No existing generated workflow tasks or journal
decisions were present. Hosted verification did not log in as a real account or
mutate production tasks; the full Auth/REST workflow was verified locally.
Frontend deployment provenance is outside this database rollout.

Security and performance advisors returned no ERROR findings. The context RPC's
[authenticated SECURITY DEFINER notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
the private journal's [no-policy RLS notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
and its [newly unused index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)
reflect intentional guards and a newly empty audit table. The existing
[leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
remains unchanged.

This work is isolated on `codex/hod-review-gate`, starting from the earlier HOD
commit plus the final delivery/privacy correction. Other chats' Staff work in
the original checkout remains untouched.

## Verification

- Full frontend suite: 561 tests across 77 files passed, including missing
  canonical context and backend compatibility checks.
- Browser checks: all 20 passed, covering Staff denial in both editors, desktop
  and mobile HOD sign-off, hidden predecessor privacy, dependency blocking,
  explicit legacy approval, revision invalidation and existing role controls.
- Final disposable Supabase replay with the decision journal: 44 pgTAP files and 650
  assertions passed. Real local Auth/REST verified generation, Staff and crafted
  request denial, canonical HOD decision IDs, scoped reads and downstream reopening
  through the actual frontend save path, including explicit sign-off of a legacy
  Completed record with otherwise unchanged task fields. Existing Storage, Staff/HOD delivery,
  Client feedback and onboarding recovery checks passed; the stack was removed.
- The replay includes assigned, out-of-department HOD denial. SQL schema lint is
  clean and security advisors pass the error gate. The private journal's
  no-policy RLS notice is intentional direct-access denial.
- TypeScript, scoped ESLint, strict translations, production build, whitespace
  and bundle checks passed. The eager JavaScript graph remains within the
  existing 300 KiB gzip limit. Backend capability/context parsing and release
  notice handling load on demand to preserve that limit.

Named reviewer assignment, persistent accountable lead ownership and absence
scheduling remain separate product capabilities. This gate uses the current
department/portfolio roles and existing Boss/PM coverage.
