# Staff/HOD action and save verification — 2 October 2026

Follow-up to the [Staff permission audit](staff-permission-audit-2026-10-02.md).

## Reproduced issues fixed

1. **Task progress caused a save conflict.** A linked task update invokes database triggers that advance its deliverable/cycle. The frontend then sent a separate service update with the pre-trigger version, producing `CONFLICT: A newer record is available.` The save path now reads the affected derived records after the task command. It acknowledges progress already persisted by the trigger and keeps the actual row version. It preserves conflict review if another member changes unrelated content or a different status; it does not blindly replace their record.
2. **Delivery completion failed validation.** The frontend serialized a cycle completion before the delivered item. The cycle guard checked its still-unfinished delivery and rejected the transaction. Existing cycle updates now follow deliverable operations. New cycle inserts retain their parent-first ordering.
3. **Manual cycle changes had broader local authorization than the database.** Staff/HOD assignment does not allow publishing or manually administering cycles. The store rejects those operations immediately; task/delivery progress still derives cycle completion and reopening.
4. **Comment attachment updates omitted service-access revocation checks.** Owned comments now require current service access or service-management permission before adding an attachment.
5. **Delivery selection could report success without retaining the chosen status.** A selected delivery status that conflicts with required-task progress was silently reset during derivation. The store now returns a translated validation error before changing records.

## Verification

- **400 unit tests across 62 files passed**, including new tests for automatic-progress reconciliation, concurrent content conflict protection, deliverable-before-cycle ordering, cycle management restrictions, revoked attachment access and invalid delivery status.
- **544 database assertions across 38 files passed**, plus database lint/advisor/postflight checks and real local Auth/REST/Storage integration.
- Added `scripts/verify-staff-action-saves.mjs` to the disposable database release gate. It loads the actual frontend store, serializer and save modules against a guarded local Supabase endpoint, creates isolated authenticated accounts, runs actions, submits the resulting commands through REST, and reloads persisted state. This is additional coverage beyond hand-written SQL commands and local browser demos.
- Authenticated action checks passed for Staff task creation/deletion, full edits, status changes, consecutive priority changes without reload, due dates, task/cycle comments, task completion, delivered-item/cycle completion, reopening with cleared delivery timestamps, HOD department comments, HOD-to-Staff delegation with preserved ownership, and an injected lost-confirmation save followed by idempotent retry/reload.
- **11 browser scenarios passed** covering the service workspace, attachment retry feedback, local role/service exploration, HOD parity and task-detail authorization. Ten passed in the final suite; Chrome shut down during the remaining scenario, which passed on an isolated rerun.
- TypeScript, lint and production build passed.

## Scope and rollout

No production records or permissions were changed. These fixes require a frontend release and do not require a database migration. Deployment was not performed from this chat.

The verified paths have no remaining reproduced save failures. Network outages, expired/revoked access and genuinely concurrent edits can still require retry, reauthentication or conflict review. The tests verify successful actions and existing failure handling; they cannot guarantee that every possible future configuration is bug-free.

Other ongoing changes in the shared workspace were preserved.
