# Entity history size and retention — proposal

As of 23 Nov 2026. Read-only production queries (aggregate counts and sizes only; no row contents read, nothing written). Needs an owner decision before any production change.

## What we found

| Fact | Value |
| --- | --- |
| `aitask_entity_history` total size | 85 MB (`aitask_entities` is 3.2 MB) |
| Rows | about 2,470 |
| Average size per row | about 35 KB |
| Share of history payload that is `actor_snapshot` | nearly all of it (23–31 KB per row; the changed data averages under 1 KB) |
| What is inside the large `actor_snapshot` | the actor's `avatar` image, about 37 KB each |
| Rows written on 10 Nov | 52 of 75 still carry the large snapshot |
| Rows written 12 Nov onward | about 530 bytes (the avatar-free snapshot migration `20261110114150` is working) |

So the 85 MB is a **one-off legacy bloat from rows written before 12 Nov**, not steady growth. New history grows by roughly a few dozen rows a day at under 1 KB each.

## Recommendation

1. **Do not add a time-based deletion policy yet.** History is the audit trail, the table is append-only by design, and current growth is small. Re-check size quarterly.
2. **Reclaim the legacy bloat with one controlled maintenance migration:** remove the `avatar` key from `actor_snapshot` on rows older than 12 Nov. Expected saving is most of the table (roughly 75 MB of the 85 MB), after a `VACUUM FULL` of that table. The migration must temporarily bypass the append-only trigger in a way that is scoped to this one key, run in a transaction, and be dry-run first on a copy.
3. **Decision for the owner:** is removing the avatar from old audit snapshots acceptable? The avatar is presentation data, not an audit fact, and the change keeps the actor's id, name, role and timestamps. If the answer is no, the alternative is to leave it and accept 85 MB.
4. **Guard against recurrence:** add a database check that rejects an `actor_snapshot` over a size limit (for example 4 KB), so a similar field cannot bloat history again.

## Not covered

- Workspace deletion with retained history (HIST-001) is a separate retention-semantics decision and is unchanged.
- No production change has been made. The migration above is described, not written.
