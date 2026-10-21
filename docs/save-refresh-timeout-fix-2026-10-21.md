# Save confirmation and refresh timeout recovery

## Production evidence

Supabase logs on 21 October show repeated HTTP 500 responses from
`/rest/v1/aitask_entities` after approximately eight seconds. PostgreSQL logged
SQLSTATE `57014` (statement timeout) in the portfolio authorization helpers.
The failing query reads every entity type except notifications, ordered and
paged in groups of 500. Recent command RPC requests returned HTTP 200; this
alone does not prove application-level command success.

A read-only query under an existing PM's authenticated database role reproduced
the broad read at 6,230 ms, with 14 visible rows and 1,875 rows rejected by its
filters. An equality-filtered deliverable read used the primary key's workspace
and entity-type prefix and completed at 1,948 ms. Both used the existing RLS
policies without changes. These timings are observations, not a performance SLA.

The 16 replacement reads were also tested read-only under a PM assigned to 35
projects, with an eight-second statement timeout. All passed: 274 visible rows
in total, with the slowest collection read taking 1,946 ms. The task query
returned 135 authorized tasks in 289 ms and the project query returned the 35
assigned projects in 56 ms.

## Fix

- Read the 16 persisted entity collections separately using equality filters,
  independent pagination and at most three concurrent collection requests.
  Notifications continue to use their existing feed RPC.
- Preserve the revision consistency checks, cancellation, canonical baseline,
  permission filtering, retained commands and idempotency keys.
- A failed refresh without local mutations enters `refresh_required`, retains
  its visible error, and offers refresh. It no longer invents a pending save or
  locks subsequent edits. Actual unsaved changes continue to require recovery.
- A successful command acknowledgement remains a successful save when only the
  subsequent refresh fails. Company editors use the same confirmation rule.
- A retry from an older tab with no retained command or local changes performs
  a refresh rather than remaining stuck trying to replay a nonexistent command.

No schema, RLS, RPC, production record, or Storage change is required.

## Regression coverage

Workspace paging tests cover every collection, multi-page tasks, consistency
retries, sign-out cancellation, request timeouts and the overall load deadline.
Store regressions cover a visible refresh failure without an edit lock, older
tab recovery, preservation of pending mutations, and acknowledged saves followed
by a failed refresh. Existing client feedback/approval browser tests exercise
draft retention, retry and duplicate prevention.

The reporting user has not yet identified the exact account/action/time. The
production timeout and recovery defects are independently evidenced; an
authenticated reproduction of that specific user's original action remains a
separate verification step.
