# AiTask version 3.0.0 — consolidated release and commit inventory

Prepared on 7 October 2026 from committed source `73a712d21382c5452fc985c2e28d2c2d47ee6e81`.
Previous source version: **2.6.1**. New source version: **3.0.0**.

## Scope

Version 3 includes all committed application changes reachable from the source snapshot.
**85 commits** were added after the commit that introduced version 2.6.1,
`5fdc809dcf27cd47598fdac9c8b1d9369b00090b`. The full inventory below lists **all 292 reachable commits**,
including 207 earlier commits inherited from the previous source.
The version-preparation commit itself is subsequently identified by Git and the
compiled `build-info.json`; it is outside this pre-release inventory.

Existing uncommitted changes in `src/lib/access.ts`, `src/pages/ClientWorkspace.tsx`,
`src/pages/Clients.tsx`, `src/store/index.ts` and the Ting Ting verification document
are excluded from this release candidate. No history is rewritten or squashed.

## Consolidated changes

- Boss Koo approvals, role templates, member administration, password generation and save recovery.
- Project Manager portfolio ownership, reassignment, task scope and reliable mixed saves.
- HOD department work, delegation, dependency warnings and access-refresh draft preservation.
- Staff assignment-based dashboards, company identity, dates, task details and recovery.
- Customer delivery feedback, approvals, validation, current cycles, privacy and review statistics.
- Accurate overdue drilldowns, renewal dates, completion labels, local-midnight refresh and Monday-to-Saturday reporting.
- Company profiles, ownership, lifecycle dates, editing and atomic deletion.
- Session and synchronization safety, concurrent-edit protection, notification audiences, uploads and stale PWA recovery.
- Simplified Chinese coverage, search, responsive interfaces, accessibility and release verification.

## Validation and release status

The source includes the regression suites and audit evidence from the individual
commits. The latest dashboard follow-through audit recorded 479 unit tests and
16 browser checks; these are historical checks, not a new full production release gate.
The isolated 3.0.0 candidate compiled successfully. Fresh checks passed:
479 unit tests across 69 files, full ESLint, strict translation coverage
(zero findings across 128 source files), TypeScript and static PWA verification.
Package/changelog/client-note version headings and all 292 inventory rows agree.

The candidate's eager JavaScript graph was 307,252 bytes gzip, **52 bytes above**
the unchanged 307,200-byte cap. The initial and chart chunk budgets passed.
This existing release gate remains a blocker to declaring the candidate ready
for production promotion. No application code or budget is changed by this
version-preparation commit.

The packaged version is compiled and checked separately from a snapshot containing
only committed source. Local compilation does not establish hosted staging or
production correctness. The existing release workflow still requires its source,
database, browser, staging and provenance gates.

Version 3 introduces no additional database migration by renumbering the package.
It includes earlier committed migrations; their deployment alignment must be
verified through the existing release process. This preparation does not push,
create a release tag or deploy. See [release setup](staging-release-setup.md).

## Changes since version 2.6.1 (85 commits, newest first)

| Commit | Date | Change |
| --- | --- | --- |
| `73a712d` | 2026-10-07 | fix: align dashboard links and daily reporting |
| `79bbeb7` | 2026-10-07 | fix: harden Customer saves and dashboard data |
| `0dad8dd` | 2026-10-07 | fix: use stable company identities in Staff dashboard |
| `69cf8f4` | 2026-10-07 | fix: reconcile Staff dashboard metrics and local dates |
| `85d3efb` | 2026-10-07 | fix: correct dashboard metrics and daily refresh |
| `5f896ed` | 2026-10-07 | fix: preserve HOD edits during access refreshes |
| `00c9d0c` | 2026-10-07 | fix: protect Staff date and detail save recovery |
| `b701bd1` | 2026-10-07 | fix: harden Boss Koo approvals and save recovery |
| `fdb5ec3` | 2026-10-07 | Fix project manager portfolio workflows |
| `881db6c` | 2026-10-07 | fix: harden HOD task scopes and dependency warnings |
| `1fc6ef4` | 2026-10-06 | fix: preserve Staff drafts through saves and retries |
| `185aa97` | 2026-10-06 | Fix client editing save handling |
| `80093ef` | 2026-10-06 | fix: align company edit access with backend |
| `ba17f7f` | 2026-10-06 | fix: preserve company changes through save and retry |
| `ed66e26` | 2026-10-06 | feat: refine workspace UI and department work views |
| `8fb7b58` | 2026-10-06 | fix: support company editing and atomic deletion |
| `123c042` | 2026-10-03 | fix: harden client report privacy and stage badges |
| `4d2c76e` | 2026-10-03 | feat: align client features and delivery statistics |
| `924da1f` | 2026-10-02 | fix: enforce notification audience integrity |
| `cc4021f` | 2026-10-02 | harden notification audience and upload recovery |
| `6c464de` | 2026-10-02 | docs: record verified direct production rollout |
| `7a269d8` | 2026-10-02 | fix: preserve concurrent edits and harden save recovery |
| `b9c5daa` | 2026-10-02 | fix: align HOD permissions with deployed authorization rules |
| `93e52ed` | 2026-09-30 | fix: harden session persistence and audited workflows |
| `4f5a23f` | 2026-09-30 | Allow HODs to delegate assigned tasks |
| `98543b6` | 2026-09-30 | fix: harden pending save recovery and mutation flows |
| `2c79dcb` | 2026-09-29 | test(i18n): close Playwright translation audit gaps |
| `1ffd097` | 2026-09-29 | feat(i18n): complete zh-CN UI translation audit |
| `b1ddece` | 2026-09-28 | feat: complete audit remediation hardening |
| `8fb824e` | 2026-09-28 | fix: harden audit findings and release gates |
| `ec3dc63` | 2026-09-25 | fix(ui,db): nested modal layering, attribution, assignment and a11y hardening |
| `21caf0e` | 2026-09-25 | fix(staff): let Staff notifications reach the PM who assigned the task |
| `6c9ff05` | 2026-09-25 | fix(tasks): keep unassigned tasks and count completion consistently |
| `8e92870` | 2026-09-25 | fix(db): grant service role member DML for the invite function |
| `ab0696f` | 2026-09-25 | fix(staff): seed comment notifications and drop unreadable service rows |
| `126b0d8` | 2026-09-25 | fix(sync): keep service rows out of typed generic commands |
| `953199b` | 2026-09-25 | fix(i18n): translate interpolated project/company/plan toasts |
| `341a194` | 2026-09-25 | fix(plans): show plan-date success only after the change is saved |
| `3a53fd5` | 2026-09-25 | fix(modals): stop backdrop clicks from closing forms |
| `08d5e13` | 2026-09-25 | feat(dates): make project, plan, and company lifecycle dates editable |
| `6ca4079` | 2026-09-25 | feat(companies): guard client links and let Boss assign a company owner |
| `6104404` | 2026-09-25 | fix(tasks): preserve assignedBy/assignedAt when parsing tasks |
| `e0ddcf5` | 2026-09-25 | fix(companies): preserve company createdBy when parsing the workspace |
| `4a683ad` | 2026-09-25 | fix(sync): stop persisting auto-discovered placeholder companies |
| `c2fbaea` | 2026-09-25 | test(roles): cover HOD-to-Project-Manager transfer permission inheritance |
| `9577c5b` | 2026-09-25 | feat(roles): let Boss Koo edit every default role and apply it live |
| `883af51` | 2026-09-25 | fix(sync): discard stale pending commands when a member's access changes |
| `f61f706` | 2026-09-23 | feat(i18n): complete Simplified Chinese coverage and add guardrails |
| `df10c5d` | 2026-09-23 | chore(db): record client ownership and task guard rollout verified in production |
| `1834c09` | 2026-09-23 | fix(db): close task attribution and staff deliverable guard gaps; align stale pgTAP |
| `c75c302` | 2026-09-23 | test(companies): use type-safe null assertions in ownership backfill pgTAP |
| `7100450` | 2026-09-23 | fix(companies): restore PM/Staff company visibility via ownership backfill |
| `3dbea3c` | 2026-09-23 | fix(companies): clear company search on every add path so new companies show |
| `98ab176` | 2026-09-23 | fix(search): clear filter when adding a company so it shows immediately |
| `3239d22` | 2026-09-22 | feat(search): header drives delivery tracker, tasks, notifications, dashboard |
| `306e817` | 2026-09-22 | feat(search): make the header the single Companies search |
| `a8780b7` | 2026-09-22 | feat(notifications): route task updates to owning PM and Boss, not all PMs |
| `e8a7c5b` | 2026-09-22 | fix(staff): allow deliveredAt on deliverable completion, add staff invariants |
| `85be8d6` | 2026-09-22 | fix(pwa): auto-recover from stale chunk load errors after a deploy |
| `3b501b6` | 2026-09-22 | feat(tasks): show assigned by in company table, details panel, task detail |
| `630b7f5` | 2026-09-22 | feat(tasks): show assigner, fix PM portfolio reassignment and mixed saves |
| `78a31b2` | 2026-09-22 | fix(sync): classify self profile saves as member.update |
| `b9d31c7` | 2026-09-22 | fix(sync): let pending saves wait for in-flight sync instead of failing |
| `f640eb1` | 2026-09-22 | chore(db): record migration history repair and advisor snapshot |
| `c5b3ef2` | 2026-09-22 | fix(db): idempotent entity inserts for lost-confirmation retries |
| `dfe6cd5` | 2026-09-22 | fix(sync): resolve "record already exists" insert conflicts |
| `fc89f20` | 2026-09-22 | feat(pm): let a Project Manager manage their portfolio tasks |
| `db39abb` | 2026-09-22 | test(sync)+fix(db): PM save regression tests and canonical role wording |
| `aaa0b6d` | 2026-09-22 | fix(sync): stop non-super-admins sending Boss-only entity operations |
| `0ec914e` | 2026-09-19 | fix(i18n): restore dropped entries and translate latest zh gaps |
| `8f21c42` | 2026-09-19 | fix release file UX and production verification |
| `c934d04` | 2026-09-19 | docs: record production authorization rollout |
| `9fbda76` | 2026-09-19 | feat: complete client UX audit improvements |
| `8657797` | 2026-09-19 | fix role-aware delivery tracker UX |
| `47537ef` | 2026-09-19 | fix(calendar): clarify compact task context |
| `736d389` | 2026-09-19 | fix(reports): avoid duplicate chart accessibility tree |
| `9ba4ca5` | 2026-09-19 | test(a11y): cover responsive report views |
| `c59b561` | 2026-09-19 | fix(reports): stabilize responsive status metrics |
| `9688178` | 2026-09-19 | test(reports): align due-work assertions |
| `c1a54bc` | 2026-09-19 | refactor(roles): replace legacy admin labels with project manager |
| `a833d9a` | 2026-09-19 | feat(auth): align task detail authorization across roles |
| `fd38167` | 2026-09-19 | fix: complete client role UI UX audit |
| `57230f5` | 2026-09-19 | feat: improve sidebar navigation UX |
| `a1c01b9` | 2026-09-19 | feat: finalize project manager and hod roles |
| `d62c512` | 2026-09-19 | fix: improve Boss Koo and Staff UI UX |

## Earlier history included in version 3 (207 commits, newest first)

| Commit | Date | Change |
| --- | --- | --- |
| `5fdc809` | 2026-09-18 | fix(auth): atomic company deletion, member-security and permission parity |
| `d9f7bfc` | 2026-09-18 | fix(i18n): correct Chinese terminology and guard translation quality |
| `ac6badc` | 2026-09-18 | fix(theme): dark-mode scrim, pre-paint theme bootstrap, and alias gaps |
| `7cdbcd3` | 2026-09-18 | fix(theme): make variant aliases win over Tailwind utilities in dark mode |
| `07d49ed` | 2026-09-18 | fix(auth): close Project Manager member escalation and align portfolio visibility |
| `aa163c5` | 2026-09-18 | feat(scope): project managers own their portfolio; fix member deletion |
| `3f384c2` | 2026-09-18 | feat(theme): neutral dark palette with natural elevation and alias-layer gaps fixed |
| `d0525a1` | 2026-09-18 | feat(brand): switch the primary color to the logo red (#E5231B) |
| `0719918` | 2026-09-18 | fix(settings): span full width for backend, metrics, and release cards |
| `ab75d56` | 2026-09-18 | fix(deploy): stop rewriting missing assets to index.html and bust stylesheet cache |
| `84e29de` | 2026-09-18 | fix: Admin needs no department; internal members require one |
| `f9a429e` | 2026-09-18 | feat: move the whole system to a Monday-to-Saturday work week |
| `b472690` | 2026-09-18 | feat: assign Admin/HOD/Staff/Client roles directly from the Approvals page |
| `9c71bb9` | 2026-09-18 | feat: rebalance role templates (admin, HOD department scope, custom roles) |
| `d6aea2b` | 2026-09-18 | fix: make four-week performance and search accurate |
| `e43dcaf` | 2026-09-18 | feat: instant full company delete for Boss Koo, HOD, and Admin |
| `d472c14` | 2026-09-18 | fix: allow Staff to create unassigned tasks from a company's cycle tab |
| `d64d1bd` | 2026-09-18 | feat add company delete action |
| `0f791b7` | 2026-09-18 | fix client task save recovery |
| `1421d8f` | 2026-09-18 | feat: allow unassigned tasks |
| `23e6801` | 2026-09-18 | feat: merge task workspace into clients |
| `7aff5e7` | 2026-09-18 | fix company search routing |
| `8c35460` | 2026-09-18 | feat: let HODs add companies via Add companies capability |
| `52469f6` | 2026-09-18 | fix service workspace retry routing |
| `de596dc` | 2026-09-18 | test: refresh staff workspace visual baselines |
| `1369b36` | 2026-09-18 | fix: localize staff task-focus notices and support ordered workspace reads |
| `8823b0b` | 2026-09-18 | fix: align migration manifest, paginate Supabase reads, and test createTasks revocation |
| `4d86f35` | 2026-09-18 | fix role authorization and workspace reliability |
| `39088a2` | 2026-09-12 | fix: stabilize v2.5.1 role workspace flows |
| `e3bb7dc` | 2026-09-11 | fix: stabilize Boss Koo and Staff workspace UX |
| `5c3f0d8` | 2026-09-11 | fix: localize client portal dates and fallbacks |
| `92d6320` | 2026-09-11 | chore: prepare v2.5.0 release metadata |
| `a203423` | 2026-09-11 | feat: complete Chinese system localization |
| `6ab1b77` | 2026-09-11 | chore: record v2.3.1 production migration rollout |
| `e7d9807` | 2026-09-11 | ci: validate scoped staging credential |
| `57448ae` | 2026-09-11 | fix: clear authorization lint regressions |
| `6f33aae` | 2026-09-11 | ci: use scoped staging Vercel credentials |
| `a9b3b1a` | 2026-09-11 | fix: harden task project links and staging release |
| `84b97f6` | 2026-09-11 | fix: complete zh copy and relax brittle e2e exact-match |
| `730eab5` | 2026-09-10 | chore: record realtime migration rollout |
| `2c0c129` | 2026-09-10 | fix: harden member retry and access refresh |
| `70d7fb4` | 2026-09-10 | release: finalize v2.3.0 companies and task tracker |
| `ba9e652` | 2026-09-10 | release: prepare v2.3.0 companies and task tracker |
| `9499ab0` | 2026-09-07 | release: record v2.2.0 production alignment |
| `15db576` | 2026-09-07 | release: prepare v2.2.0 HOD permissions |
| `bd2013a` | 2026-09-07 | feat: complete v2.1.5 reliability remediation |
| `6e05a75` | 2026-09-07 | ci: use account token for isolated staging |
| `754c249` | 2026-09-05 | release: prepare v2.1.5 assurance gate |
| `b7cdc61` | 2026-09-05 | docs: add v2.1.4 handoff note with next test-coverage actions |
| `4b66b5b` | 2026-09-04 | Merge pull request #2 from tehzion/codex/v2.1.4-database-alignment |
| `f56c1d8` | 2026-09-04 | ci: retry transient dependency audit failures |
| `d3c888a` | 2026-09-04 | docs: record v2.1.4 production alignment |
| `3f5f35b` | 2026-09-04 | release: prepare v2.1.4 database alignment |
| `5dc66ab` | 2026-09-04 | Align scoped-Staff cycle publish with the RPC preflight (allow publishedAt) |
| `6be7569` | 2026-09-04 | Correct pgTAP plan to 26 after regression coverage |
| `e75cd69` | 2026-09-04 | Correction in the assignee-comment pgTAP scenario under the staff guard |
| `87bea47` | 2026-09-04 | Fix release workflow YAML after v2.1.3 carve-out |
| `41c08b5` | 2026-09-04 | Route v2.1.3 through the one-time direct-production gate |
| `51b3654` | 2026-09-04 | Release v2.1.3: staff command authorization hardening and catalog coverage |
| `364c637` | 2026-09-04 | Allow assignee-targeted Staff comment notifications and correct pgTAP plan |
| `e6e1b47` | 2026-09-04 | Follow renamed command entry points in optimistic-lock pgTAP assertions |
| `bc853d2` | 2026-09-04 | Harden Staff command authorization and server-side delete notifications |
| `2a9d4e3` | 2026-09-04 | Add service-catalog e2e and route managers through the unified save-retry path |
| `dd22a7f` | 2026-09-04 | Translate service package and workflow template managers |
| `9dd4b66` | 2026-09-03 | Always clean staging QA after release checks |
| `df522f7` | 2026-09-03 | Cover client Services tab, decision history and staff quick filters in e2e |
| `cbd40d4` | 2026-09-03 | Cover Boss monthly deliverables and registration approval flow in smoke tests |
| `8d6d642` | 2026-09-03 | Retain pending command type across reload and re-login for typed save retry |
| `78c0ff9` | 2026-09-02 | Record v2.1.2 one-time direct-production release gate |
| `8ee597c` | 2026-09-02 | Prepare v2.1.2: staging-first release pipeline, deterministic QA fixture and save-retry polish |
| `6111cee` | 2026-09-02 | Fix save retry recovery across workflows |
| `c1f0a34` | 2026-08-27 | Release v2.1.1 through one-time production gate |
| `cd4ea9c` | 2026-08-27 | Use production Vercel token for emergency release |
| `0697a01` | 2026-08-27 | Fix Vercel CLI invocation for emergency release |
| `25a55c4` | 2026-08-27 | Fix one-time release version check |
| `eb51783` | 2026-08-27 | Add one-time v2.1.0 production dispatch |
| `5cdcfb7` | 2026-08-27 | Release v2.1.0 with tagged deployment gate |
| `7fd7a52` | 2026-08-27 | Record verified client privacy production rollout |
| `03fa629` | 2026-08-27 | Repair client privacy rollout validation |
| `a95c99f` | 2026-08-27 | Accessible staff queue tabs and strip internal-workflow terminology from client copy |
| `102fa60` | 2026-08-27 | Fill remaining zh coverage and translate staff predecessor confirm |
| `ec7d7a0` | 2026-08-27 | Guard unguarded service mutators and protect account-op force-pulls from clobbering pending edits |
| `f68d408` | 2026-08-27 | Harden client read privacy: close comment/approval RLS leak and strip task-chain from deliverables |
| `bfd07cb` | 2026-08-26 | Ship Client Workspace 2.0: approval-first Home, Deliveries, Delivery Focus and simplified company workspace |
| `f1d26b9` | 2026-08-26 | Localize hosted password recovery entry |
| `698cb74` | 2026-08-26 | Refresh Boss mobile dashboard visual baseline |
| `64a74bc` | 2026-08-26 | Redesign staff workspace around action-first work queues |
| `103536b` | 2026-08-26 | Show active companies as monthly deliverables on Boss overview |
| `871cc28` | 2026-08-26 | Polish Boss approvals UX: dedupe add-member action, staff-only registration badges, activity sort |
| `b2b4d98` | 2026-08-26 | Polish Boss Koo experience for v2: service entry point, approvals correctness, workload aggregation and i18n |
| `1de7bbd` | 2026-08-26 | Stop surfacing transient sync status as a save error |
| `5076d90` | 2026-08-26 | Hide optional company link for Admin/Boss on fresh task creation |
| `b15dcd6` | 2026-08-26 | Fix task and company save recovery with retryPendingSave |
| `3f8c7ff` | 2026-08-25 | Fix plan-wizard save recovery for degraded sync states |
| `6e22aa1` | 2026-08-25 | Confirm before discarding pending change on Settings sign-out |
| `8388f8b` | 2026-08-25 | Document upgrade runbook, correct backend docs and add 2.0.0 changelog |
| `c513de6` | 2026-08-25 | Translate sync surfaces, cap command size and surface storage quota |
| `7d39401` | 2026-08-25 | Harden upgrade-mode state across network flaps, reapply and notification loads |
| `8ba5a31` | 2026-08-25 | Add disposable local Supabase rollout validation script |
| `a385979` | 2026-08-25 | Preserve pending changes across sign-out and account switches |
| `ee2c10f` | 2026-08-25 | Merge pull request #1 from tehzion/codex/release-notice-1.6.19 |
| `0e73af7` | 2026-08-25 | Harden production RPC compatibility rollout |
| `6d2348b` | 2026-08-21 | chore: release version 2.0.0 |
| `549828c` | 2026-08-21 | feat: add versioned service operations notice |
| `a45c798` | 2026-08-21 | Make visual smoke test portable |
| `e139e64` | 2026-08-21 | Fix pnpm 10 CI installation |
| `5e97e54` | 2026-08-21 | Define root pnpm workspace |
| `868827d` | 2026-08-21 | Fix CI pnpm version source |
| `e187e0d` | 2026-08-16 | Add workspace-level optimistic lock with self-healing conflict reapply |
| `cd9dd65` | 2026-08-16 | Polish client portal: briefing chips, calm styling, full zh coverage and content protection |
| `e152058` | 2026-08-16 | Fix notification cursor precision, pin toolchain and run PWA e2e in CI |
| `93d5741` | 2026-08-16 | Add staff briefing, department context and quick task filters |
| `2a4d22d` | 2026-08-16 | Add boss briefing dashboard, command palette and approvals bulk actions |
| `36d5e5f` | 2026-08-16 | Close remaining content-translation holes in user-authored names and options |
| `72711cf` | 2026-08-16 | Complete Chinese UI coverage and protect user-authored content from translation |
| `35c0a34` | 2026-08-16 | Add localized service demo and calm operations polish |
| `d9b825f` | 2026-08-16 | Align Supabase sync with notification unread tombstones and service deletions |
| `8538f23` | 2026-08-16 | Add mobile approvals cards, package/template deletion and nav shortcuts |
| `f6b8c5a` | 2026-08-16 | Final cleanup sweep: docs, dead dependency, department aliases, chrome contrast |
| `1a76063` | 2026-08-16 | Refine Boss Koo experience: setup flow, approvals, dashboard truth and member management |
| `7859c87` | 2026-08-16 | Fix notification center edge cases, plan editor validation and date handling |
| `ac35b5d` | 2026-08-16 | Harden client portal visibility and polish client-facing surfaces |
| `d3f4a10` | 2026-08-16 | Fix client portal counts, member deletion cleanup and report metrics |
| `899836e` | 2026-08-16 | Close sync, PWA, error-resilience and deep-link gaps found in deep review |
| `810057d` | 2026-08-16 | Polish workspace UX: synced filters, toast caps, theme-aware charts, scoped choices |
| `a47d524` | 2026-08-15 | Harden staff account flows and close staff data-visibility leaks |
| `5def9f5` | 2026-08-15 | Refine task details modal: accessible edit form, submit guards, comment polish |
| `9029c66` | 2026-08-15 | Refine calendar UX: Monday-first weeks, keyboard day selection, quieter day actions |
| `d97706a` | 2026-08-15 | Harden auth, approvals and sync; fine-tune workspace UI and accessibility |
| `92b2ca9` | 2026-08-15 | feat: ship calm client service operations workspace |
| `9934dab` | 2026-08-09 | Release v1.6.18 corporate workspace refinement |
| `fe7cb19` | 2026-08-02 | Release v1.6.16 notification center |
| `b1f8d18` | 2026-08-02 | Release v1.6.15 client portal |
| `04daafd` | 2026-07-31 | Add Boss operations glance and completion tracking |
| `878c834` | 2026-07-29 | Stabilize notification popup smoke test |
| `4aadaa6` | 2026-07-29 | Add multi-department membership |
| `64233d2` | 2026-07-28 | Fix mobile notification notice spacing |
| `0722323` | 2026-07-28 | Release AiTask v1.6.11 |
| `8857a03` | 2026-07-18 | Harden super admin onboarding |
| `896521b` | 2026-07-18 | Remove retired demo staff and tasks |
| `0cf52e9` | 2026-07-18 | Fix staff task sync and account flows |
| `ea3adff` | 2026-07-18 | Fix role routing and company permissions |
| `3eebe7b` | 2026-07-18 | Close production authorization gaps |
| `e5e19ad` | 2026-07-18 | Allow onboarding without SMTP |
| `1744f6f` | 2026-07-18 | Repair production member onboarding |
| `b1d2a8e` | 2026-07-18 | Temporarily disable MFA enforcement |
| `2a871c8` | 2026-07-18 | Handle production builds without Git metadata |
| `47a9611` | 2026-07-18 | Add launch feedback collection |
| `8935e39` | 2026-07-18 | Prepare production login onboarding |
| `d79d0f5` | 2026-07-17 | Secure Super Admin staff onboarding |
| `e83e7ec` | 2026-07-16 | Polish v1.6.5 UI and accessibility |
| `9f53c9c` | 2026-07-16 | Preserve password reset state during sync |
| `996d771` | 2026-07-16 | Prevent phantom member sync changes |
| `ef721eb` | 2026-07-16 | Fix Supabase verification environment |
| `3542079` | 2026-07-16 | Harden production Supabase sync |
| `7f5599f` | 2026-07-15 | Verify PWA cache headers |
| `d5a4401` | 2026-07-15 | Prevent stale PWA app shells |
| `1b8288a` | 2026-07-15 | Configure production Supabase sync |
| `9dc904b` | 2026-07-15 | Stop unauthenticated Supabase polling |
| `ff54a77` | 2026-07-15 | Add reliable Supabase command synchronization |
| `5cfdb19` | 2026-07-15 | Add visible v1.5.1 release versioning |
| `d9494d6` | 2026-07-14 | Restrict staff visibility to assigned work |
| `879a322` | 2026-07-13 | Harden auth, permissions, and PWA readiness |
| `fbfdc0e` | 2026-07-13 | UI refactor: add intermediate grid breakpoints (md/lg) to task list filters for a balanced layout on iPads and laptops |
| `fe4e2a1` | 2026-07-13 | UI refactor: update Tasks header filter selects with custom ChevronDown icons to match modal and table selectors |
| `f865d56` | 2026-07-13 | UI refactor: optimize footer buttons inside client details modal for mobile responsiveness |
| `ba88afc` | 2026-07-13 | Fix TypeScript compilation errors in Clients.tsx: import format and correct createdAt references to task/project startDate and member updatedAt |
| `6c129fb` | 2026-07-13 | UI refinement: update client details modal with inline editing and show Client Added / Last Task dates under Work Summary with access control |
| `0854842` | 2026-07-13 | UI refactor: remove Assignee column, merge assignee info under Actions column, center Priority/Status/Workflow columns to resolve compression and misalignment |
| `9dd16ed` | 2026-07-13 | Fix layout compression: add explicit column widths for Priority, Status, and Workflow, and clean up ChevronDown dropdown styling |
| `2666faf` | 2026-07-13 | Revert CSP meta tag to fix local dev server and HMR connection blocks |
| `3f38e24` | 2026-07-13 | Add adminmojo developer super admin account |
| `d5195e3` | 2026-07-13 | Security & Sync hardening: SHA-256 local credentials, strict CSP, ID-based client merges, sync tombstone watchers, and Vite manual chunk splitting |
| `03f842f` | 2026-07-12 | Harden live sync and polish AiTask workflows |
| `e9715b1` | 2026-06-25 | Add calendar task assignment buttons |
| `855b220` | 2026-06-25 | Improve calendar task rescheduling |
| `1483b37` | 2026-06-25 | Enable demo credentials by default |
| `1f7cb43` | 2026-06-25 | Show demo credentials on login |
| `76e037f` | 2026-06-16 | Harden snapshot auth and Supabase policies |
| `325dbaa` | 2026-06-16 | Harden login reset and mobile navigation |
| `f63b604` | 2026-06-15 | Polish dashboard onboarding and task flows |
| `ec7f12b` | 2026-06-15 | Improve Supabase sync recovery diagnostics |
| `f916743` | 2026-06-11 | feat: allow adding tasks on Calendar page and make holiday toggle smaller |
| `94008c2` | 2026-06-11 | fix: resolve entity resurrection and user update overwrites in sync merge |
| `4ef178a` | 2026-06-11 | fix: import cardBase in Dashboard.tsx |
| `ed40494` | 2026-06-11 | fix: resolve missing and duplicate JSX closing tags in Dashboard and Calendar pages |
| `267762d` | 2026-06-11 | fix: adjust typescript union type handling inside Date constructor |
| `3956801` | 2026-06-11 | style: optimize header layout and make sync status more compact |
| `302fb8e` | 2026-06-11 | feat: implement client-side 3-way merge resolver for conflict resolution |
| `9ca32ee` | 2026-06-11 | feat: implement relative due dates, quick-edit, keyboard shortcuts, mobile navigation, and dynamic custom statuses |
| `ae87bfc` | 2026-06-11 | feat: warm UI polish — Plus Jakarta Sans, stone/orange palette, wood sidebar |
| `0eaf942` | 2026-06-11 | feat: add custom service option to Create Project modal |
| `e9ed869` | 2026-06-11 | feat: drag-and-drop task rescheduling on calendar |
| `6401d4b` | 2026-06-11 | feat: restrict Data Backend section to Boss Koo only |
| `f8f9f55` | 2026-06-11 | fix: redesign calendar with fixed cells, side panel, compact holiday strips |
| `c3b2a48` | 2026-06-11 | feat: add Malaysia public holidays to calendar (2025–2026) |
| `093e85d` | 2026-06-11 | feat: add sound notifications with mute toggle |
| `149ca3a` | 2026-06-11 | Prefer Supabase mode for hosted builds |
| `e8b517e` | 2026-06-11 | Clarify Vercel Supabase mode status |
| `7124bea` | 2026-06-11 | Polish Supabase readiness UI |
| `fea21b3` | 2026-06-10 | Improve live freshness and first-login reset |
| `6ded833` | 2026-05-21 | feat: editable user profile in Settings with password change support |
| `ff3f2f9` | 2026-05-21 | fix: restore mock user passwords on every boot so login works after page reload |
| `9929fa1` | 2026-05-21 | feat: add collapsible demo accounts table to login page |
| `4d268d7` | 2026-05-21 | security: harden app for internal production |
| `e29d064` | 2026-05-21 | chore: protect sensitive data - update .gitignore to exclude .env files |
| `84465d7` | 2026-05-21 | Initial commit |

## Local re-audit corrections

The preparation commit was subsequently re-audited and corrected locally without
renumbering the candidate. See [the re-audit](version-3-reaudit-2026-10-07.md) and
[remediation evidence](version-3-remediation-2026-10-07.md) for Calendar/focus fixes,
updated browser references, passing bundle budgets, the completed local database
gate and the remaining Free-plan/hosted staging limitations. The inventory above
continues to describe the original pre-preparation snapshot.
