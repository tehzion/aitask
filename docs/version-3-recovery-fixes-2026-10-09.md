# v3.0.0 account recovery and company identity candidate

Publication remains on hold. This implementation starts at `52d0c0c`, retains its Supabase SDK 2.117.3 update, and merges concurrent action-save fixes from `236477c` in the isolated `codex/v3-recovery-fixes` worktree. The original checkout is preserved. v3.0.0 remains an unreleased candidate.

## Implemented behavior

- Auth email updates synchronize the linked member in the same PostgreSQL transaction. Duplicate workspace emails reject that transaction. The compatible email RPC requires canonical Auth state and replays without another member version, workspace revision, or audit event. Edge reads canonical Auth and member state after an uncertain response and never rolls Auth back blindly.
- Private invitation intents have pending, cancelling, cancelled, and completed states. The original Boss account can discover its non-secret requests from Approvals on another browser, resume their original command IDs, or cancel before replacing them. Auth creation and invitation stamping lock the intent; cancellation fences late creation and finalization, preserves completed members and unrelated signup accounts, and releases an email only after PostgreSQL confirms owned-login cleanup. Confirmed cancellation also clears matching local command identities, so the same draft can receive a new command in that tab.
- Prepared temporary-password accounts verify the submitted original credential before finalization, including uncertain create responses. A mismatch requires the original password or cancellation/restart. Completed receipt replays explicitly decline to apply a newly submitted password. Journals and recovery storage contain no credentials.
- Retained department changes accept an empty array, survive reload with the same command ID, and revalidate the current role. Project Managers can have no departments; Staff/HOD still need valid departments. Account changes fence late responses.
- Company records resolve together across tasks, projects, plans, cycles, deliverables, comments, add-ons, and pricing snapshots. Existing profile IDs stay authoritative. An orphan ID group remaps only when its linked names identify one canonical company; ambiguity preserves relationships. Both missing-ID fallbacks hash the full normalized Unicode company name using the pinned `@noble/hashes/sha2` submodule. Historical profile slug collisions no longer merge different companies.
- Updated frontend writes require both additive account capabilities while schema version 4 and existing RPC signatures remain compatible. Upload mutation support loads at use to retain the existing 300 KiB eager bundle limit.

## Verification and evidence

Permanent coverage includes the previous dashboard regression requiring one active plan and renewal, Unicode/punctuation/long-name identity collisions, repeated normalization, role and account fences, Project Manager department reload, password mismatch and receipt replay, lost email acknowledgement, original-actor cancellation ownership, cleanup uncertainty, and finalization/cancellation racing. The disposable rollout runner executes the actual Edge handler against real Auth, PostgreSQL, and Storage, including removal of a member who owns a referenced saved file.

A new hosted account-recovery case exercises an unfinished, server-prepared QA invitation, its original password, cross-browser UI recovery, email acknowledgement loss, and removal with a retained upload. Its fixture is confined to the staging QA workspace and exact synthetic accounts; cleanup refuses unrelated recovery accounts. Hosted tests retain no traces, screenshots, or video. The fixture and authenticated case are prepared but require authorized staging access before execution.

Generated results are retained separately in `release-evidence/v3-recovery/`, including candidate Git identity, source-cleanliness checks, test exit codes, logs, build provenance, and artifact credential scanning. Browser suites use distinct output directories through `AITASK_E2E_OUTPUT_DIR`; `AITASK_SECRET_FREE_EVIDENCE=true` disables credential-bearing browser recordings for this verification run. A successful focused rerun does not erase a failed original run. Development harness failures and any later failures remain separately recorded.

Run from the frozen candidate:

```sh
pnpm check
pnpm lint
pnpm verify:i18n:strict
pnpm test
pnpm verify:supabase:rollout
pnpm build
node scripts/verify-bundle-size.mjs
node scripts/verify-pwa.mjs
pnpm verify:release-provenance --file dist/build-info.json
AITASK_SECRET_FREE_EVIDENCE=true AITASK_E2E_OUTPUT_DIR=release-evidence/v3-recovery/browser pnpm test:e2e
AITASK_SECRET_FREE_EVIDENCE=true AITASK_E2E_OUTPUT_DIR=release-evidence/v3-recovery/login pnpm test:e2e:login-i18n
AITASK_SECRET_FREE_EVIDENCE=true AITASK_E2E_OUTPUT_DIR=release-evidence/v3-recovery/pwa pnpm test:e2e:pwa
pnpm audit --prod --audit-level high --json --registry https://registry.npmjs.org
python3 scripts/verify-qa-artifacts.py release-evidence/v3-recovery
```

## Staging access blockers

The configured isolated Supabase project is `dyaxtloducpgjoxuaszk`. The connector denies access, and opening that exact project in the signed-in dashboard redirects to the organization list. It is absent from the visible Vercel-managed staging organization. Restore authorized access to that project or explicitly review a replacement isolated project and update all matching staging configuration together. Production cannot substitute for it.

The Vercel connector credential returns `404 User not found`; the existing CI staging deployment credential was previously rejected for organization access. The signed-in dashboard can open `tehzions-projects/aitask-staging`; Vercel Authentication and both scoped GitHub Trusted Sources rules remain enabled. An authorized owner must refresh the staging-scoped CI credential and verify the configured staging organization/project IDs. New credentials must be entered and submitted by the user, never pasted into chat or tracked files. Do not expand access or weaken deployment protection to pass the gate.

## Ordered staging and production rollout

1. Freeze the reviewed Git commit. Obtain a recoverable database backup and record current Edge/frontend versions. Confirm the exact destination project, migration history/approved alias mapping, Auth redirects, and public app origin. Run `supabase/preflight/account_consistency_preflight.sql` with a privileged connection. Investigate returned member IDs against canonical Auth before selecting repairs; resolve duplicate canonical emails and missing Auth accounts individually.
2. Restore isolated staging authorization and the correctly scoped Vercel CI credential. Inspect `pnpm exec supabase migration list --project-ref dyaxtloducpgjoxuaszk` and `pnpm exec supabase db push --project-ref dyaxtloducpgjoxuaszk --dry-run`. Apply only reviewed pending migrations; never use `--include-all` to bypass unknown history divergence. Apply `20261007173905_reliable_member_onboarding`, then `20261008145256_account_consistency_and_onboarding_recovery` where pending. Run the postflight and advisors. If reviewed pre-existing mismatches need repair, use `account_email_repair.review.sql` with an explicit JSON array of member IDs; it rereads Auth in the repair transaction and aborts conflicts.
3. Deploy `invite-aitask-member` using `pnpm exec supabase functions deploy invite-aitask-member --project-ref dyaxtloducpgjoxuaszk`. Retain JWT verification. Keep the SDK pin and staging-only public URL. Verify authenticated list/resume/cancel and email behavior before deploying the frontend. Deploy other changed Edge Functions only where their reviewed SDK update is pending.
4. Build/deploy the frontend from that exact reviewed commit to the protected isolated Vercel staging project. Run source/build provenance, fixture seed, both hosted specs, security checks, and credential scanning under the shared staging-fixture concurrency group. Retain the deployment URL, commit, migration identities, and results; clean up only the QA fixture after artifact checks.
5. Production remains a separate reviewed action. After hosted checks pass, repeat preflight and the database -> Edge -> frontend order on the verified production project. Run postflight and authenticated smoke tests. Leave both pending migration entries in the review manifest until actual production application and verification; then record observed history and capabilities and update the manifest in a separate reviewed change. `verify:release-db-alignment` intentionally remains blocked before that work.

## Rollback and pause criteria

Keep the additive database schema and journals when rolling the frontend back to the previously verified artifact. Preserve prepared login ownership and completed receipts. Pause new invitations if recovery checks fail; resolve each uncertain request using its saved command or cancellation rather than deleting its journal. Do not remove the email synchronization trigger while allowing the new email-update handler: the transaction guarantee is required. If an emergency disables email changes, block that action explicitly while retaining the trigger and canonical state.

A database rollback requires a separately reviewed forward migration and reconciliation of pending/cancelling intents and linked Auth/member rows. Do not replay old migration history or restore database data over newer work. Paid hosting upgrades, managed PostgreSQL maintenance, and production publication are outside this candidate and remain separate user decisions. Local evidence does not establish hosted verification.
