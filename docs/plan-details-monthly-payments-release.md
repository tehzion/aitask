# Plan details and monthly receipts

Implementation uses the existing plan revision and workspace entity protocols. `ServiceCyclePayment` is stored as a `service_cycle_payment` entity, separate from cycle status and protected pricing. Amounts are integer MYR sen. Operational and financial audit history remain separate.

The Edit details button opens the existing editor. Initial drafts save directly; active and paused plans create or reuse a pending revision. The proposed effective boundary is visible and a revision must be reviewed and scheduled. Paused sources cannot schedule until resumed. Ended plans keep their existing next-plan flow. The revision start is the source plan's next billing boundary; its billing day controls subsequent cycles. Existing cycles and their frozen pricing are preserved.

Payment records use `aitask_execute_payment_command` with record/void intent. A workspace lock followed by a cycle row lock serializes balance validation; command receipts replay lost responses before workspace version checks. Receipt IDs remain stable through retries. The server owns actor/time stamps. Existing records are immutable; corrections void and replace them. Financial reads require price permission and client access; writes additionally require internal cycle management. Protected terms for a revision created by a plan manager without price access are copied on the server.

Charge resolution uses the cycle's own pricing snapshot. Legacy snapshots lacking a total are reconstructed from that cycle's frozen items and snapshot prices, discount and tax. Live plan pricing is never used. No payments are backfilled.

## Validation, 3 November 2026

- 970 unit/API adapter tests passed, including receipt serialization, command routing and retained command identity on lost responses.
- 29 authenticated PostgreSQL checks passed in Docker: valid instalments, frozen/legacy pricing, server stamps, retries, correction history, permissions, direct-write rejection and hidden-price revision copying.
- Two PostgreSQL sessions attempted receipts against the same balance in a dedicated local database. One save succeeded and the competing save was rejected. The final total remained below the frozen charge. These used synthetic data only.
- English and Chinese browser flows passed for unequal instalments, payment defaults, revision editing and a 390px viewport. Existing revision-date browser regressions also passed.
- TypeScript, lint, production build, architecture, i18n coverage, migration checks and whitespace checks passed.

Database migration checks ran in rollback-only transactions on the local Docker debug instance. Concurrency checks used a separate schema-only clone. No hosted database or deployed app was changed.

## Coordinated release

Apply `20261103132352_service_cycle_payments.sql` after the repository's existing migrations, then deploy the matching app build. Recheck authenticated payment recording, void/replacement, sync after refresh and financial visibility in staging using real signed-in sessions before production promotion. App rollback may leave the additive database migration in place; retain all receipt and audit history. Do not remove payment records during rollback.
