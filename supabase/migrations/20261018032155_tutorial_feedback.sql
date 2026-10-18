-- Tutorial feedback is private, per authenticated workspace member, and
-- intentionally separate from the public launch survey table.
create table if not exists public.aitask_tutorial_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.aitask_workspaces(id) on delete cascade,
  auth_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tutorial_id text not null check (tutorial_id ~ '^[a-z0-9][a-z0-9-]*$'),
  helpful boolean not null,
  reason text check (reason is null or reason in ('unclear', 'different_interface', 'not_solved', 'missing_info', 'other')),
  comment text not null default '' check (char_length(comment) <= 2000),
  locale text not null default 'en' check (locale in ('en', 'zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, auth_user_id, tutorial_id)
);

create index if not exists aitask_tutorial_feedback_tutorial_idx
  on public.aitask_tutorial_feedback(workspace_id, tutorial_id, updated_at desc);

alter table public.aitask_tutorial_feedback enable row level security;
revoke all on public.aitask_tutorial_feedback from public, anon;
grant select, insert, update on public.aitask_tutorial_feedback to authenticated;

drop policy if exists "members can read own tutorial feedback" on public.aitask_tutorial_feedback;
create policy "members can read own tutorial feedback" on public.aitask_tutorial_feedback
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    and exists (
      select 1
      from public.aitask_members member
      where member.workspace_id = aitask_tutorial_feedback.workspace_id
        and member.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "members can submit own tutorial feedback" on public.aitask_tutorial_feedback;
create policy "members can submit own tutorial feedback" on public.aitask_tutorial_feedback
  for insert to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and exists (
      select 1
      from public.aitask_members member
      where member.workspace_id = aitask_tutorial_feedback.workspace_id
        and member.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "members can update own tutorial feedback" on public.aitask_tutorial_feedback;
create policy "members can update own tutorial feedback" on public.aitask_tutorial_feedback
  for update to authenticated
  using (
    auth_user_id = (select auth.uid())
    and exists (
      select 1
      from public.aitask_members member
      where member.workspace_id = aitask_tutorial_feedback.workspace_id
        and member.auth_user_id = (select auth.uid())
    )
  )
  with check (
    auth_user_id = (select auth.uid())
    and exists (
      select 1
      from public.aitask_members member
      where member.workspace_id = aitask_tutorial_feedback.workspace_id
        and member.auth_user_id = (select auth.uid())
    )
  );
