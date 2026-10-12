# Delivery review blind spots — 13 October 2026

## Fixed behavior

1. Client views and the read RPC omit internal staff contacts/assignments. Existing
   cached contact payloads are ignored; customer-facing team labels stay generic.
2. Unsaved deliverable selections and pending save receipts survive workspace tab
   changes. Only the submitted selection clears after confirmed success.
3. Visible tasks with dangling, cross-company, mismatched-cycle or conflicting
   delivery links enter the review queue. Authorized editors explicitly confirm
   removing the invalid link before selecting a same-company destination. Tasks
   remain intact; no destination is inferred or published automatically.
4. Expired draft cycles appear in a separate expandable backlog with date ranges.
   They never contribute to current confirmed progress. Managers open the cycle
   to review historical publication; there is no bulk publication action.
5. Awaiting publication requires an actual current draft for an active plan. The
   Client RPC exposes only a boolean, keeping draft contents private. An active
   plan alone shows No current published cycle.

## Additional defects caught by real Auth/REST testing

Published Client cycles intentionally omit private add-on snapshots. The serializer
now tolerates this projection. Projected approval commands may omit hidden revision
counters and assignment fields; the server owns their merge. Rejection increments
the canonical revision count, assignments remain unchanged, and approving already
completed work does not invent an unavailable completion date. Client approval does
not attempt to derive an internal task chain locally.

Server derivation recognizes both task.deliverableId and deliverable.taskIds, with
same-company filtering. Removing a foreign link preserves a valid confirmed
Delivered record; completion or approval alone produces Ready under existing rules.
The authorization migration patches the existing permission helper in place,
preserving its identity, grants, RLS dependencies and previous PM/HOD changes.

## Verification and rollout boundaries

TypeScript, lint, strict English/Chinese translation checks, unit/permission tests,
browser regressions, production build, bundle/PWA verification, and a disposable
Supabase gate cover these changes. The database gate runs pgTAP, advisors, lint,
postflight, real Storage, frontend Staff/HOD/Client actions over Auth/REST, interrupted
save recovery and the actual onboarding Edge handler. Startup credentials are no
longer printed into retained database logs.

Two function migrations are required before the frontend release:
- 20261012162419_client_portal_review_privacy
- 20261012164407_delivery_link_derivation

Installation changes no existing business records. Team review is still required
for drafts and unlinked/invalid work. Previously observed counts (17 current drafts,
160 completed unlinked tasks, 11 expired drafts and one foreign-company link) are
read-only audit snapshots, not live counters or completed cleanup.

Hosted staging remains blocked by the previously reported Supabase/Vercel access
credentials, as instructed. No staging result is represented as a pass. Production
role-flow confidence comes from isolated real Auth/REST tests; public release
provenance checks do not claim authenticated production account testing.

## Verified production database rollout

Both migrations applied through the deployment connector on 13 October (Malaysia),
recorded as 20261012172315 and 20261012172326 UTC. The connector aliases are preserved
in the repair manifest. All 1,769 entity records retained the identical aggregate
business-data hash a5441f09c456d958b876b89d39e20b32. The authorization helper kept its
original OID and grants. Staff assignment projection removal and the same-company
reverse-link derivation were verified live. Existing leaked-password protection
and privileged-RPC advisor notices remain outside this code rollout.
