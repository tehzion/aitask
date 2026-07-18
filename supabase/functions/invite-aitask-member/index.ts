import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const publicAppUrl = () => {
  const configured = Deno.env.get('AITASK_PUBLIC_URL')?.trim() || 'https://aitask-virid.vercel.app';
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Function configuration is incomplete' }, 500);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authorization.slice('Bearer '.length);
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: actor, error: actorError } = await userClient
    .from('aitask_members')
    .select('id,workspace_id,is_super_admin')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (actorError) {
    console.error('Super Admin lookup failed', {
      authUserId: authData.user.id,
      code: actorError.code,
      message: actorError.message,
    });
    return json({ error: 'Unable to verify Super Admin access. Please try again.' }, 500);
  }
  if (!actor) {
    console.warn('Invitation denied for unlinked Auth user', { authUserId: authData.user.id });
    return json({ error: 'This signed-in account is not linked to an AiTask member. Sign out and sign in again.' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action.trim() : 'invite_member';

  if (action === 'update_self_email') {
    const nextEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const oldEmail = authData.user.email?.trim().toLowerCase() || '';

    if (!validEmail(nextEmail) || nextEmail.length > 320) return json({ error: 'Enter a valid email address' }, 400);
    if (!currentPassword) return json({ error: 'Current password is required' }, 400);
    if (!oldEmail) return json({ error: 'The Auth account does not have an email address' }, 409);
    if (nextEmail === oldEmail) return json({ ok: true, unchanged: true });

    const verifier = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: passwordError } = await verifier.auth.signInWithPassword({
      email: oldEmail,
      password: currentPassword,
    });
    if (passwordError) return json({ error: 'Current password is incorrect' }, 403);

    const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) return json({ error: 'Unable to verify the new email address' }, 500);
    const duplicate = authUsers.users.some(user => user.id !== authData.user.id && user.email?.toLowerCase() === nextEmail);
    if (duplicate) return json({ error: 'Another account already uses this email address' }, 409);

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authData.user.id, {
      email: nextEmail,
      email_confirm: true,
    });
    if (updateAuthError) return json({ error: updateAuthError.message || 'Unable to update the login email' }, 400);

    const { data: result, error: memberError } = await adminClient.rpc('aitask_update_member_email', {
      p_actor_member_id: actor.id,
      p_email: nextEmail,
    });
    if (memberError) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(authData.user.id, {
        email: oldEmail,
        email_confirm: true,
      });
      if (rollbackError) console.error('Auth email rollback failed', { memberId: actor.id, message: rollbackError.message });
      return json({ error: memberError.message || 'Unable to update the workspace email' }, 400);
    }

    return json(result);
  }

  if (!actor.is_super_admin) {
    console.warn('Account management denied for non-Super-Admin member', { memberId: actor.id, action });
    return json({ error: 'Boss Koo Super Admin access is required. Sign in with the Boss Koo account.' }, 403);
  }

  if (action === 'delete_member') {
    const targetMemberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
    if (!targetMemberId || targetMemberId === actor.id) return json({ error: 'A different member account is required' }, 400);

    const { data: target, error: targetError } = await adminClient
      .from('aitask_members')
      .select('id,auth_user_id,is_super_admin')
      .eq('workspace_id', actor.workspace_id)
      .eq('id', targetMemberId)
      .maybeSingle();
    if (targetError) return json({ error: 'Unable to verify the member account' }, 500);
    if (!target) return json({ error: 'Member account not found' }, 404);
    if (target.is_super_admin) return json({ error: 'Protected Super Admin accounts cannot be deleted' }, 403);

    const { count: assignedCount, error: assignedError } = await adminClient
      .from('aitask_entities')
      .select('entity_id', { count: 'exact', head: true })
      .eq('workspace_id', actor.workspace_id)
      .eq('entity_type', 'task')
      .eq('assigned_to', targetMemberId);
    if (assignedError) return json({ error: 'Unable to check assigned tasks' }, 500);
    if ((assignedCount || 0) > 0) return json({ error: 'Reassign this member\'s tasks before deleting the account' }, 409);

    if (target.auth_user_id) {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id);
      if (deleteAuthError && !/not found/i.test(deleteAuthError.message)) {
        return json({ error: deleteAuthError.message || 'Unable to delete the Auth account' }, 400);
      }
    }

    const { data: result, error: deleteMemberError } = await adminClient.rpc('aitask_delete_member_account', {
      p_actor_member_id: actor.id,
      p_member_id: targetMemberId,
    });
    if (deleteMemberError) {
      return json({ error: `${deleteMemberError.message}. The login is already disabled; retry member removal.` }, 409);
    }
    return json(result);
  }

  if (action !== 'invite_member') return json({ error: 'Unsupported account action' }, 400);

  const registrationId = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
  const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
  let name = typeof body.name === 'string' ? body.name.trim() : '';
  let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let role = ['Admin', 'Staff', 'Client'].includes(body.role) ? body.role : 'Staff';
  const department = typeof body.department === 'string' ? body.department.trim() : 'Designer';
  const companyName = role === 'Client' && typeof body.companyName === 'string' ? body.companyName.trim() : null;
  const customRoleId = typeof body.customRoleId === 'string' && body.customRoleId.trim() ? body.customRoleId.trim() : null;
  const sendInvitation = body.sendInvitation !== false;
  const temporaryPassword = typeof body.password === 'string' ? body.password.trim() : '';
  let onboardingMode: 'self_signup' | 'legacy_invite' | 'direct_invite' = 'direct_invite';

  if (registrationId) {
    const { data: registration, error } = await userClient
      .from('aitask_entities')
      .select('data')
      .eq('workspace_id', actor.workspace_id)
      .eq('entity_type', 'registration')
      .eq('entity_id', registrationId)
      .maybeSingle();
    if (error || !registration || registration.data?.status !== 'Pending' || registration.data?.requestedRole !== 'Staff') {
      return json({ error: 'Pending Staff registration not found' }, 404);
    }
    name = typeof registration.data.name === 'string' ? registration.data.name.trim() : '';
    email = typeof registration.data.email === 'string' ? registration.data.email.trim().toLowerCase() : '';
    role = 'Staff';
    onboardingMode = registration.data.onboardingMode === 'legacy_invite' ? 'legacy_invite' : 'self_signup';
  }

  if (!name || !validEmail(email)) return json({ error: 'A valid email and name are required' }, 400);
  if (role === 'Client' && !companyName) return json({ error: 'Client company is required' }, 400);

  let customRoleName: string | null = null;
  if (customRoleId) {
    const { data: customRole, error } = await userClient
      .from('aitask_entities')
      .select('data')
      .eq('workspace_id', actor.workspace_id)
      .eq('entity_type', 'custom_role')
      .eq('entity_id', customRoleId)
      .maybeSingle();
    if (error || !customRole) return json({ error: 'Custom role not found' }, 400);
    customRoleName = typeof customRole.data?.name === 'string' ? customRole.data.name : null;
  }

  const { data: authUsers, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return json({ error: 'Unable to verify the Auth user' }, 500);
  let authUser = authUsers.users.find(user => user.email?.toLowerCase() === email);
  let createdAuthUser = false;
  const appUrl = publicAppUrl();
  if (!appUrl) return json({ error: 'The public AiTask URL is not configured' }, 500);
  const passwordSetupUrl = `${appUrl}/account/password`;

  if (registrationId) {
    if (!authUser && onboardingMode === 'legacy_invite') {
      if (sendInvitation) {
        const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { name, department, aitask_registration_source: 'legacy_invite' },
          redirectTo: passwordSetupUrl,
        });
        if (inviteError || !invited.user) return json({ error: inviteError?.message || 'Invitation failed' }, 400);
        authUser = invited.user;
      } else {
        if (temporaryPassword.length < 12) return json({ error: 'A temporary password of at least 12 characters is required' }, 400);
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: { name, department, aitask_registration_source: 'legacy_invite' },
        });
        if (createError || !created.user) return json({ error: createError?.message || 'Account creation failed' }, 400);
        authUser = created.user;
      }
      createdAuthUser = true;
    } else if (!authUser) {
      return json({ error: 'The Staff member must verify their signup email before approval' }, 409);
    }
    if (onboardingMode === 'self_signup' && !authUser.email_confirmed_at) {
      if (sendInvitation) return json({ error: 'The Staff member has not verified their email yet' }, 409);
      const { data: confirmed, error: confirmError } = await adminClient.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
      });
      if (confirmError || !confirmed.user) return json({ error: confirmError?.message || 'Unable to activate the Staff login' }, 400);
      authUser = confirmed.user;
    }
  } else if (!authUser) {
    if (sendInvitation) {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { name, department, company_name: companyName },
        redirectTo: passwordSetupUrl,
      });
      if (inviteError || !invited.user) return json({ error: inviteError?.message || 'Invitation failed' }, 400);
      authUser = invited.user;
    } else {
      if (temporaryPassword.length < 12) return json({ error: 'A temporary password of at least 12 characters is required' }, 400);
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { name, department, company_name: companyName },
      });
      if (createError || !created.user) return json({ error: createError?.message || 'Account creation failed' }, 400);
      authUser = created.user;
    }
    createdAuthUser = true;
  } else if (!registrationId) {
    return json({ error: 'An Auth account already exists for this email. Use its pending registration instead.' }, 409);
  }

  if (!authUser) return json({ error: 'Unable to prepare the Auth user' }, 500);

  let resolvedMemberId = memberId;
  if (!resolvedMemberId && registrationId && onboardingMode === 'legacy_invite') {
    const { data: existingMember, error: memberError } = await userClient
      .from('aitask_members')
      .select('id')
      .eq('workspace_id', actor.workspace_id)
      .is('auth_user_id', null)
      .eq('email', email)
      .maybeSingle();
    if (memberError) {
      if (createdAuthUser) await adminClient.auth.admin.deleteUser(authUser.id);
      return json({ error: 'Unable to verify the legacy member record' }, 500);
    }
    resolvedMemberId = existingMember?.id || '';
  }

  const { data: result, error: finalizeError } = await adminClient.rpc('aitask_finalize_member_invitation', {
    p_actor_member_id: actor.id,
    p_auth_user_id: authUser.id,
    p_name: name,
    p_email: email,
    p_role: role,
    p_department: role === 'Client' ? 'Client' : department,
    p_client_name: companyName,
    p_custom_role_id: customRoleId,
    p_custom_role_name: customRoleName,
    p_member_id: resolvedMemberId || null,
    p_registration_id: registrationId || null,
  });

  if (finalizeError) {
    if (createdAuthUser) await adminClient.auth.admin.deleteUser(authUser.id);
    return json({ error: finalizeError.message }, 400);
  }

  return json(result, createdAuthUser ? 201 : 200);
});
