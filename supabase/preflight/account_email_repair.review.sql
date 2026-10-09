-- Explicit reviewed member IDs only. Supply a JSON array through psql's
-- reviewed_member_ids variable. Apply the additive consistency migration first.
-- Canonical Auth is reread in the repair transaction; conflicts abort safely.
\set ON_ERROR_STOP on
begin;
select public.aitask_update_member_email(member.id,account.email)
from public.aitask_members member join auth.users account on account.id=member.auth_user_id
where member.id in (select jsonb_array_elements_text(:'reviewed_member_ids'::jsonb))
  and lower(btrim(coalesce(member.email,'')))<>lower(btrim(coalesce(account.email,'')));
commit;
