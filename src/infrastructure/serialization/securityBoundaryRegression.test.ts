import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

describe('security re-audit boundary contracts', () => {
  it('keeps self-service email changes in the confirmation flow', () => {
    const source = read('supabase/functions/invite-aitask-member/index.ts');
    const section = source.slice(source.indexOf("if (action === 'update_self_email')"), source.indexOf('const projectManagerActor'));
    expect(section).toContain('verifier.auth.updateUser({ email: nextEmail })');
    expect(section).toContain('emailConfirmationRequired: true');
    expect(section).not.toContain('email_confirm: true');
    expect(section).not.toContain('aitask_update_member_email');
  });

  it('does not derive feedback throttling identity from forwarding headers', () => {
    const source = read('supabase/functions/aitask-feedback/index.ts');
    expect(source).not.toContain('requestIdentity');
    expect(source).not.toContain('x-forwarded-for');
    expect(source).not.toContain('cf-connecting-ip');
    expect(source).toContain('submit:campaign:launch-week-2026-07');
    expect(source).toContain('results:${authData.user.id}');
  });

  it('binds client-visible service files to both comment and storage ownership', () => {
    const source = read('supabase/migrations/20261024090000_security_boundary_hardening.sql');
    expect(source).toContain("attachment ->> 'uploadedBy' is distinct from new.data ->> 'userId'");
    expect(source).toContain("comment.data->>'userId'=attachment->>'uploadedBy'");
    expect(source).toContain('object.owner_id=uploader.auth_user_id::text');
  });

  it('denies unlisted HOD patch fields and constrains approval transitions', () => {
    const source = read('supabase/migrations/20261024090000_security_boundary_hardening.sql');
    expect(source).toContain('v_allowed_fields text[]');
    expect(source).toContain('jsonb_object_keys(coalesce(p_old_data');
    expect(source).toContain("p_new_data ->> 'clientApprovalStatus' <> 'Rejected'");
  });

  it('runs credential-bearing staging QA only on protected master', () => {
    const source = read('.github/workflows/staging.yml');
    expect(source).not.toContain('pull_request');
    expect(source).toContain("branches: [master]");
    expect(source).toContain("if: github.ref == 'refs/heads/master'");
    expect(source).toContain('github.run_id');
  });
});
