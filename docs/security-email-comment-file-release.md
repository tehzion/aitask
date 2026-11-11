# Email and comment-file security release

Production migration and deployment are pending owner approval. Do not run the SQL or alter production configuration without that approval.

## Deployment sequence

1. Resolve authorized feedback reviewer Auth user IDs through a read-only owner-controlled lookup. Set `AITASK_FEEDBACK_REVIEWER_AUTH_USER_IDS` to the comma-separated immutable IDs in the Edge Function environment. An empty or missing list denies developer access; super-admin access remains independent. Do not use the former email allowlist. Verify the intended reviewer accounts and current email-change delivery settings without disclosing secrets.
2. Deploy the new `aitask-feedback` and `invite-aitask-member` functions first. Until the readiness migration exists, email changes return a temporary-unavailable error. This closes the old administrative auto-confirm path before enabling new email changes. Keep the old UI until the database and new UI are ready; it will display that error rather than claim success.
3. After presenting and receiving explicit approval for the exact migration SQL, apply it and verify the synchronization trigger, grants, storage access, history, and database checks. Then deploy the UI. Confirm a disposable test account's verified email flow in an isolated environment, not with production user records.

For linked members, the database requires a password-checked authorization before any Auth email change, including an administrative direct change. Each authorization expires after 24 hours; a user must start again if confirmation expires or the change fails. The member email synchronizes in the same transaction as the confirmed Auth change; a synchronization error rejects the Auth change rather than leaving different addresses.

## Review existing comment attachments

The migration does not delete objects or automatically approve historical comments. New attachments are recorded when the uploader owns the object and its namespace matches. Legacy attachments without an approval record cannot be downloaded through the comment publication path. A super-admin must inspect each candidate, confirm it should be shared with the client, and explicitly approve it with `aitask_approve_comment_file(workspace_id, comment_id, object_name)` using a signed-in super-admin session. Approval is a production database write and requires separate owner authorization. The function checks that the object still exists in the corresponding workspace, client, and cycle before recording approval. Removing or replacing the object invalidates the approval.

Read-only review query for an authorized operator (never share real object paths outside the intended owner review):

```sql
select c.workspace_id, c.entity_id as comment_id, c.client_id, c.cycle_id,
       a->>'path' as object_name, o.owner_id,
       p.approved_at, p.approved_by
from public.aitask_entities c
cross join lateral jsonb_array_elements(case when jsonb_typeof(c.data->'attachments')='array' then c.data->'attachments' else '[]'::jsonb end) a
left join storage.objects o on o.bucket_id='client-service-files' and o.name=a->>'path'
left join private.aitask_comment_file_publications p on p.workspace_id=c.workspace_id and p.comment_id=c.entity_id and p.object_name=a->>'path'
where c.entity_type='cycle_comment' and c.data->>'visibility'='client-visible'
  and a->>'bucket'='client-service-files';
```

Approval is per comment and object, not a blanket grant. Only approve after independently checking the intended recipient and file content. Do not copy file content into logs or audit notes.
