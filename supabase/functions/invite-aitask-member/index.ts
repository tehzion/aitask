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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Function configuration is incomplete' }, 500);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const token = authorization.slice('Bearer '.length);
  const [{ data: authData, error: authError }, { data: claimsData, error: claimsError }] = await Promise.all([
    adminClient.auth.getUser(token),
    adminClient.auth.getClaims(token),
  ]);

  if (authError || !authData.user || claimsError) return json({ error: 'Invalid session' }, 401);
  if (claimsData.claims.aal !== 'aal2') return json({ error: 'MFA verification required' }, 403);

  const { data: actor, error: actorError } = await adminClient
    .from('aitask_members')
    .select('id,workspace_id,role,is_super_admin')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();
  if (actorError || !actor || (actor.role !== 'Admin' && !actor.is_super_admin)) {
    return json({ error: 'Admin permission required' }, 403);
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = ['Admin', 'Staff', 'Client'].includes(body.role) ? body.role : 'Staff';
  const department = typeof body.department === 'string' ? body.department.trim() : 'Designer';
  const companyName = role === 'Client' && typeof body.companyName === 'string' ? body.companyName.trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    return json({ error: 'A valid email and name are required' }, 400);
  }
  if (role === 'Client' && !companyName) return json({ error: 'Client company is required' }, 400);

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name, department, company_name: companyName },
  });
  if (inviteError || !invited.user) return json({ error: inviteError?.message || 'Invitation failed' }, 400);

  const member = {
    id: crypto.randomUUID(),
    workspace_id: actor.workspace_id,
    auth_user_id: invited.user.id,
    name,
    email,
    role,
    department: role === 'Client' ? 'Client' : department,
    client_name: companyName,
    must_reset_password: false,
    permissions: {},
  };
  const { data: created, error: memberError } = await adminClient
    .from('aitask_members')
    .insert(member)
    .select('*')
    .single();

  if (memberError) {
    await adminClient.auth.admin.deleteUser(invited.user.id);
    return json({ error: memberError.message }, 400);
  }

  return json({ member: created }, 201);
});
