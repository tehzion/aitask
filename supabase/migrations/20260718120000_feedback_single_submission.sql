-- Enforce the one-response-per-email promise independently of the Edge Function.

create unique index if not exists aitask_feedback_campaign_email_uidx
  on public.aitask_feedback_submissions(campaign, lower(email));
