# Ting Ting company ownership transfer

Completed in production on 15 October 2026; verified at 22:12 MYT.

The user explicitly requested moving the previously identified 18 Boss-owned companies to Ting Ting. Exact company IDs and unchanged original row versions/data were checked before an atomic administrative correction. Only those company owners and update timestamps were changed. Their entity versions advanced from 3 to 4, and the workspace sync version advanced to 1547. A transaction-local equality check confirmed every non-target entity remained identical.

Operation ID: `be2b5e43-c6a1-4a5a-a9e5-b8685cf9de01`.

- `before.json`: pre-change row snapshots.
- `transfer.sql`: guarded transaction executed against AiTask / `aitask-main`. It rejects replay or changed preconditions.
- `verification.json`: independent post-commit checks, including live Ting Ting view/edit/delete authorization for all 18 companies and her new total of 36 owned profiles.

The database contains 18 audit events carrying the prior owner, new owner, original data, and explicit administrative correction source. Their actor is null because this was a user-authorized database administration action, not a login as Boss Koo or Ting Ting. No company deletion was attempted. The previous duplicate-name findings are separate and were not modified by this ownership transfer.
