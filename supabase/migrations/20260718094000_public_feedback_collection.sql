-- Public launch-week feedback is isolated from the synchronized workspace state.

create table if not exists public.aitask_feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign text not null check (campaign = 'launch-week-2026-07'),
  name text not null check (char_length(name) between 2 and 100),
  email text not null check (char_length(email) between 5 and 254),
  role text not null check (role in ('Super Admin', 'Admin', 'Staff', 'Client')),
  organization text not null default '' check (char_length(organization) <= 120),
  device text not null check (device in ('Desktop', 'Laptop', 'Tablet', 'Mobile', 'Other')),
  language text not null check (language in ('en', 'zh')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  issue_details jsonb not null default '{}'::jsonb check (jsonb_typeof(issue_details) = 'object'),
  ratings jsonb not null check (jsonb_typeof(ratings) = 'object'),
  most_useful text not null default '' check (char_length(most_useful) <= 2000),
  most_confusing text not null default '' check (char_length(most_confusing) <= 2000),
  recommendation text not null default '' check (char_length(recommendation) <= 2000),
  is_late boolean not null default false,
  submitted_at timestamptz not null default now()
);

create index if not exists aitask_feedback_campaign_time_idx
  on public.aitask_feedback_submissions(campaign, submitted_at desc);
create index if not exists aitask_feedback_role_idx
  on public.aitask_feedback_submissions(campaign, role);
create unique index if not exists aitask_feedback_campaign_email_uidx
  on public.aitask_feedback_submissions(campaign, lower(email));

alter table public.aitask_feedback_submissions enable row level security;
revoke all on public.aitask_feedback_submissions from public, anon, authenticated;
grant select, insert on public.aitask_feedback_submissions to service_role;

-- The dormant developer record must never become a workspace Super Admin by linkage mistake.
update public.aitask_members
set is_super_admin = false
where id = 'u-adminmojo'
  and auth_user_id is null;
