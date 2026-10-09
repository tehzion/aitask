import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type User as SupabaseAuthUser } from 'npm:@supabase/supabase-js@2.117.3';

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
const listAllAuthUsers = async (adminClient: ReturnType<typeof createClient>): Promise<{ users: SupabaseAuthUser[]; error: unknown }> => {
  const users: SupabaseAuthUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { users, error };
    users.push(...data.users);
    if (data.users.length < 1000) return { users, error: null };
  }
  return { users, error: new Error('Auth user list exceeded the pagination safety limit') };
};
const departmentOrder = [
  'Operation',
  'Management',
  'Video Shooting',
  'Video Editor',
  'Ads Management',
  'Account & Finance',
  'Designer',
] as const;

const normalizeDepartment = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  return ({
    operation: 'Operation',
    management: 'Management',
    videoshooting: 'Video Shooting',
    'video shooting': 'Video Shooting',
    editor: 'Video Editor',
    'video editor': 'Video Editor',
    'ads management': 'Ads Management',
    'account & finance': 'Account & Finance',
    designer: 'Designer',
    client: 'Client',
  } as Record<string, string>)[key] || null;
};

const normalizeDepartments = (role: string, value: unknown, legacyValue: unknown) => {
  if (role === 'Client') return ['Client'];
  const raw = Array.isArray(value) ? value : legacyValue ? [legacyValue] : [];
  const normalized = raw.map(normalizeDepartment);
  // Project Managers are portfolio-scoped and are not limited by department.
  if (normalized.length === 0) return role === 'Project Manager' ? [] : null;
  if (
    normalized.some(department => !department || department === 'Client')
    || new Set(normalized).size !== normalized.length
  ) return null;
  return normalized
    .filter((department): department is string => Boolean(department))
    .sort((left, right) => departmentOrder.indexOf(left as typeof departmentOrder[number])
      - departmentOrder.indexOf(right as typeof departmentOrder[number]));
};

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

    const { users: authUsers, error: listError } = await listAllAuthUsers(adminClient);
    if (listError) return json({ error: 'Unable to verify the new email address' }, 500);
    const duplicate = authUsers.some(user => user.id !== authData.user.id && user.email?.toLowerCase() === nextEmail);
    if (duplicate) return json({ error: 'Another account already uses this email address' }, 409);

    // Auth and member email commit together. A missing acknowledgement must
    // be reconciled from canonical state, never compensated with an old email.
    let updateMessage = '';
    try {
      const { error } = await adminClient.auth.admin.updateUserById(authData.user.id, { email: nextEmail, email_confirm: true });
      updateMessage = error?.message || '';
    } catch { updateMessage = 'Email confirmation is pending'; }
    const { data: canonical, error: canonicalError } = await adminClient.auth.admin.getUserById(authData.user.id);
    const { data: member, error: memberError } = await adminClient.from('aitask_members')
      .select('email').eq('id', actor.id).eq('workspace_id', actor.workspace_id).maybeSingle();
    if (!canonicalError && !memberError && canonical.user?.email?.toLowerCase() === nextEmail && member?.email?.toLowerCase() === nextEmail) {
      return json({ ok: true });
    }
    return json({ code: 'EMAIL_RETRY_REQUIRED', error: updateMessage || 'Email confirmation is pending. Check your account email and retry.' }, 409);
  }

  if (!actor.is_super_admin) {
    console.warn('Account management denied for non-Super-Admin member', { memberId: actor.id, action });
    return json({ error: 'Boss Koo Super Admin access is required. Sign in with the Boss Koo account.' }, 403);
  }

  if (action === 'list_onboarding') {
    const { data, error } = await adminClient.rpc('aitask_list_member_onboarding', { p_actor_member_id: actor.id });
    return error ? json({ error: 'Unable to load pending invitations. Retry when the backend is available.' }, 503) : json(data);
  }

  if (action === 'cancel_onboarding') {
    const commandId = typeof body.commandId === 'string' ? body.commandId.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(commandId)) return json({ error: 'Invalid invitation request' }, 400);
    const envelope = { p_actor_member_id: actor.id, p_command_id: commandId };
    const { data: operation, error } = await adminClient.rpc('aitask_cancel_member_onboarding', envelope);
    if (error || !operation?.ok) return json({ error: 'Unable to cancel this invitation for your account.' }, 409);
    if (operation.state !== 'cancelling') return json(operation);
    if (operation.authUserId) {
      // The database returns only a server-owned, unlinked prepared account.
      // Cleanup uncertainty leaves the reservation fenced until confirmation.
      try { await adminClient.auth.admin.deleteUser(operation.authUserId); } catch { /* Reconcile below. */ }
    }
    const { data: finished, error: finishError } = await adminClient.rpc('aitask_cancel_member_onboarding', { ...envelope, p_finish: true });
    if (finishError || !finished?.ok) return json({ code: 'ONBOARDING_CANCELLATION_PENDING', error: 'Cancellation cleanup is pending. Retry cancellation before creating a replacement.' }, 409);
    return json(finished);
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

  const commandId = typeof body.commandId === 'string' ? body.commandId.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) {
    return json({ code: 'CLIENT_UPGRADE_REQUIRED', error: 'Reload AiTask, restore your draft, then retry this invitation.' }, 409);
  }

  const registrationId = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
  const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
  let name = typeof body.name === 'string' ? body.name.trim() : '';
  let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let role = ['Project Manager', 'HOD', 'Staff', 'Client'].includes(body.role) ? body.role : 'Staff';
  let departments = normalizeDepartments(role, body.departments, body.department);
  const companyName = role === 'Client' && typeof body.companyName === 'string' ? body.companyName.trim() : null;
  const customRoleId = typeof body.customRoleId === 'string' && body.customRoleId.trim() ? body.customRoleId.trim() : null;
  const workerType = ['Staff', 'HOD'].includes(role) && ['employee', 'supplier', 'freelancer'].includes(body.workerType)
    ? body.workerType
    : 'employee';
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
    if (error || !registration || !['Pending', 'Approved'].includes(registration.data?.status) || registration.data?.requestedRole !== 'Staff') {
      return json({ error: 'Pending Staff registration not found' }, 404);
    }
    name = typeof registration.data.name === 'string' ? registration.data.name.trim() : '';
    email = typeof registration.data.email === 'string' ? registration.data.email.trim().toLowerCase() : '';
    role = 'Staff';
    onboardingMode = registration.data.onboardingMode === 'legacy_invite' ? 'legacy_invite' : 'self_signup';
  }

  departments = normalizeDepartments(role, body.departments, body.department);
  if (!name || !validEmail(email)) return json({ error: 'A valid email and name are required' }, 400);
  if (!departments) return json({ error: 'Choose at least one valid department' }, 400);
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
    const customRoleData = customRole.data && typeof customRole.data === 'object' ? customRole.data as Record<string, unknown> : {};
    if (customRoleData.isBuiltin === true || customRoleData.baseRole !== role) {
      return json({ error: `This custom role can only be assigned to ${String(customRoleData.baseRole || 'its configured base role')} accounts` }, 400);
    }
    const customRolePermissions = customRoleData.permissions && typeof customRoleData.permissions === 'object'
      ? customRoleData.permissions as Record<string, unknown>
      : {};
    const protectedPermissionKeys = ['editTasks', 'manageUsers', 'approveRegistrations', 'deleteUsers', 'viewProductionReports'];
    if (protectedPermissionKeys.some(key => customRolePermissions[key] === true)) {
      return json({ error: 'Protected account-management and global-report permissions are reserved for Boss Koo' }, 403);
    }
    customRoleName = typeof customRole.data?.name === 'string' ? customRole.data.name : null;
  }

  const payload = { name, email, role, departments, companyName, customRoleId, customRoleName,
    memberId: memberId || null, registrationId: registrationId || null, workerType, sendInvitation };
  const retryError = (message: string) => json({ code: 'ONBOARDING_RETRY_REQUIRED', error: message, commandId }, 409);
  const { data: reserved, error: reserveError } = await adminClient.rpc('aitask_reserve_member_onboarding', {
    p_actor_member_id: actor.id, p_command_id: commandId, p_payload: payload,
  });
  if (reserveError || !reserved?.ok) return retryError('Onboarding could not be reserved. Resume the original request from Pending invitations, or cancel it before changing the request.');
  if (reserved.result) return json({ ...reserved.result, replayed: true, passwordApplied: false, notice: 'This invitation was already completed. The submitted password was not applied.' });

  const { users: authUsers, error: listError } = await listAllAuthUsers(adminClient);
  if (listError) return json({ error: 'Unable to verify the Auth user' }, 500);
  let authUser = authUsers.find(user => user.email?.toLowerCase() === email);
  let createdAuthUser = false;
  const ownsPreparedAccount = (user: SupabaseAuthUser) => user.app_metadata?.aitask_onboarding_command === commandId
    && user.app_metadata?.aitask_onboarding_actor === actor.id
    && user.app_metadata?.aitask_onboarding_workspace === actor.workspace_id;
  const preparationMetadata = { aitask_onboarding_command: commandId, aitask_onboarding_actor: actor.id,
    aitask_onboarding_workspace: actor.workspace_id };
  const recoverPreparedAccount = async () => {
    const refreshed = await listAllAuthUsers(adminClient);
    return refreshed.error ? undefined : refreshed.users.find(user => user.email?.toLowerCase() === email && ownsPreparedAccount(user));
  };
  const appUrl = publicAppUrl();
  if (!appUrl) return json({ error: 'The public AiTask URL is not configured' }, 500);
  const passwordSetupUrl = `${appUrl}/account/password`;

  if (registrationId) {
    if (!authUser && onboardingMode === 'legacy_invite') {
      if (sendInvitation) {
        const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { name, aitask_registration_source: 'legacy_invite', aitask_onboarding_command: commandId },
          redirectTo: passwordSetupUrl,
        });
        authUser = invited.user || await recoverPreparedAccount();
        if (!authUser) return retryError(inviteError?.message || 'Invitation delivery is not confirmed. Keep this draft and retry.');
      } else {
        if (temporaryPassword.length < 12) return json({ error: 'A temporary password of at least 12 characters is required' }, 400);
        const { data: created, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password: temporaryPassword,
          email_confirm: true,
          app_metadata: preparationMetadata,
          user_metadata: { name, aitask_registration_source: 'legacy_invite' },
        });
        authUser = created.user || await recoverPreparedAccount();
        if (!authUser) return retryError(createError?.message || 'Account creation is not confirmed. Keep this draft and retry.');
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
        data: { name, company_name: companyName, aitask_onboarding_command: commandId },
        redirectTo: passwordSetupUrl,
      });
      authUser = invited.user || await recoverPreparedAccount();
      if (!authUser) return retryError(inviteError?.message || 'Invitation delivery is not confirmed. Keep this draft and retry.');
    } else {
      if (temporaryPassword.length < 12) return json({ error: 'A temporary password of at least 12 characters is required' }, 400);
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: preparationMetadata,
        user_metadata: { name, company_name: companyName },
      });
      authUser = created.user || await recoverPreparedAccount();
      if (!authUser) return retryError(createError?.message || 'Account creation is not confirmed. Keep this draft and retry.');
    }
    createdAuthUser = true;
  } else if (!registrationId && !ownsPreparedAccount(authUser)) {
    return json({ error: 'An Auth account already exists for this email. Use its pending registration instead.' }, 409);
  }

  if (authUser && ownsPreparedAccount(authUser) && !sendInvitation) {
    const verifier = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: credential, error: credentialError } = await verifier.auth.signInWithPassword({ email, password: temporaryPassword });
    if (credentialError || credential.user?.id !== authUser.id) return json({ code: 'ONBOARDING_PASSWORD_MISMATCH', commandId,
      error: 'Enter the original temporary password for this request, or cancel it and start again. The new password has not been applied.' }, 409);
  }

  if (!createdAuthUser && authUser && ownsPreparedAccount(authUser) && sendInvitation && !authUser.email_confirmed_at) {
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, aitask_onboarding_command: commandId }, redirectTo: passwordSetupUrl,
    });
    if (inviteError || !invited.user || invited.user.id !== authUser.id) return retryError('Invitation delivery is not confirmed. Keep this draft and retry.');
    authUser = invited.user;
  }
  if (!authUser) return json({ error: 'Unable to prepare the Auth user' }, 500);

  const { data: result, error: finalizeError } = await adminClient.rpc('aitask_finalize_member_invitation_v3', {
    p_actor_member_id: actor.id, p_command_id: commandId, p_auth_user_id: authUser.id, p_payload: payload,
  });
  if (finalizeError) {
    // A transport error cannot establish whether the transaction committed.
    const { data: reconciled, error: reconcileError } = await adminClient.rpc('aitask_reserve_member_onboarding', {
      p_actor_member_id: actor.id, p_command_id: commandId, p_payload: payload,
    });
    if (!reconcileError && reconciled?.result) return json(reconciled.result);
    return retryError('Invitation confirmation is pending. Keep this draft and retry; the prepared login has been retained.');
  }
  return json(result, createdAuthUser ? 201 : 200);
});
