# AiTask Supabase Integration

Production AiTask uses Supabase Auth and the authenticated, row-scoped workspace tables in `secure-auth-schema.sql`. The legacy JSON snapshot exists only as a temporary migration source and must not remain available to browser roles after the v1.6.0 cutover.

## New Project Setup

1. Create a Supabase project and configure verified email invitations.
2. Run `supabase/schema.sql` only when importing a legacy snapshot.
3. Run `supabase/secure-auth-schema.sql` to create the authenticated workspace model and migrate legacy data.
4. Apply every file under `supabase/migrations/` in timestamp order.
5. Deploy the `invite-aitask-member` Edge Function with JWT verification enabled.
6. Deploy the public `aitask-feedback` Edge Function with gateway JWT verification disabled; its submit and reviewer branches enforce their own validation and authorization.
7. Set `AITASK_PUBLIC_URL` to the canonical HTTPS application origin and set `AITASK_FEEDBACK_REVIEWER_EMAILS` to the private comma-separated developer reviewer emails.
8. Configure custom SMTP for Auth invitations, recovery email, and feedback reviewer magic links. The built-in Supabase mailer is not a production delivery service.
9. Configure the frontend:

```env
VITE_AITASK_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_AITASK_SHOW_DEMO_LOGIN=false
```

For the current production workspace, `AITASK_PUBLIC_URL` is `https://aitask-virid.vercel.app`. Invitation and recovery redirects must allow `/account/password`. Do not store SMTP credentials, generated passwords, service-role keys, or invitation tokens in this repository.

## Launch Feedback

The public checklist is available at `/feedback`; role-specific links use `?role=Staff`, `?role=Client`, `?role=Admin`, or `?role=Super%20Admin`. Responses close operationally on 30 July 2026, with later responses retained and marked late.

Feedback is stored outside the synchronized workspace in `aitask_feedback_submissions`. Anonymous and normal authenticated roles have no direct table privileges. The `aitask-feedback` Edge Function accepts validated public submissions and returns read-only results only to Boss Koo or an email in `AITASK_FEEDBACK_REVIEWER_EMAILS`. `adminmojo` has a linked, non-Super-Admin workspace account and may also use the allowlisted reviewer email flow at `/feedback/results`.

## v1.6.0 Command Cutover

`20260715090000_reliable_workspace_commands.sql` is additive. It installs row versions, workspace revisions, idempotent command receipts, immutable audit events, and the transactional command RPC without interrupting an older frontend.

Use this order for production:

1. Apply the additive command migration.
2. Deploy and verify the v1.6.0 frontend against the command RPC.
3. Apply `20260715090100_reliable_workspace_command_cutover.sql`.
4. Confirm anonymous requests cannot read the legacy snapshot or secure workspace tables.
5. Run `pnpm verify:supabase`, Supabase Security Advisor, and the RLS test matrix.

The cutover revokes direct authenticated writes to members and entities. All browser mutations must pass through `aitask_execute_command`; the service role remains available to the invitation function and controlled administration jobs.

## Operational Rules

- Never expose a service-role or secret key in Vite environment variables.
- Never restore anonymous snapshot access as a sync fallback.
- Apply schema changes through timestamped migrations and keep live migration history aligned with the repository.
- Audit events contain identifiers and changed field names only, not comments, approval notes, contact details, descriptions, avatars, or credentials.
- The PWA service worker may cache the app shell, but it must not cache Supabase REST, Auth, or RPC responses.
