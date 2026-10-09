-- Run with a privileged connection before rollout. Read-only; no emails or
-- credentials are written to release artifacts. Investigate each ID against
-- canonical Auth before selecting any member for a reviewed repair.
select member.id as member_id, member.workspace_id,
  case when account.id is null then 'missing_auth'
       when nullif(btrim(account.email),'') is null then 'missing_auth_email'
       else 'email_mismatch' end as issue
from public.aitask_members member left join auth.users account on account.id=member.auth_user_id
where member.auth_user_id is not null and
  (account.id is null or lower(btrim(coalesce(member.email,'')))<>lower(btrim(coalesce(account.email,''))))
order by member.workspace_id,member.id;

select member.workspace_id, count(*) as duplicate_canonical_email_groups
from public.aitask_members member join auth.users account on account.id=member.auth_user_id
where exists(select 1 from public.aitask_members other where other.workspace_id=member.workspace_id
  and other.id<>member.id and lower(btrim(coalesce(other.email,'')))=lower(btrim(account.email)))
group by member.workspace_id;
