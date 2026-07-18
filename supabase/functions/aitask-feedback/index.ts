import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.89.0';

const allowedOrigins = new Set([
  'https://aitask-virid.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5178',
  'http://127.0.0.1:5181',
]);
const roles = new Set(['Super Admin', 'Admin', 'Staff', 'Client']);
const devices = new Set(['Desktop', 'Laptop', 'Tablet', 'Mobile', 'Other']);
const answerValues = new Set(['pass', 'issue', 'na']);
const baseQuestionIds = [
  'login', 'account_details', 'role_access', 'dashboard', 'navigation', 'responsive',
  'task_scope', 'task_actions', 'task_fields', 'calendar', 'client_scope', 'client_details',
  'client_actions', 'comments', 'approvals', 'save_status', 'sync', 'offline_pwa',
];
const superAdminQuestionIds = ['mfa', 'registration_approval', 'permissions', 'audit', 'developer_scope'];
const feedbackDeadline = new Date('2026-07-30T15:59:59.999Z').getTime();

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://aitask-virid.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const json = (origin: string | null, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validRating = (value: unknown, nullable = false) => (
  (nullable && value === null) || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5)
);

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'Method not allowed' }, 405);
  if (origin && !allowedOrigins.has(origin)) return json(origin, { error: 'Origin not allowed' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(origin, { error: 'Feedback service is unavailable' }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await request.json().catch(() => ({}));
  const action = body.action === 'results' ? 'results' : 'submit';

  if (action === 'submit') {
    if (text(body.website, 200)) return json(origin, { ok: true, receipt: crypto.randomUUID() }, 201);
    const name = text(body.name, 100);
    const email = text(body.email, 254).toLowerCase();
    const role = text(body.role, 30);
    const organization = text(body.organization, 120);
    const device = text(body.device, 20);
    const language = body.language === 'zh' ? 'zh' : 'en';
    if (name.length < 2 || !validEmail(email) || !roles.has(role) || !devices.has(device) || body.consent !== true) {
      return json(origin, { error: 'Please complete the required fields' }, 400);
    }

    const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
    const requiredIds = role === 'Super Admin' ? [...baseQuestionIds, ...superAdminQuestionIds] : baseQuestionIds;
    if (!requiredIds.every(id => answerValues.has(answers[id]))) {
      return json(origin, { error: 'Please answer every checklist item' }, 400);
    }
    const safeAnswers = Object.fromEntries(requiredIds.map(id => [id, answers[id]]));
    const rawIssues = body.issueDetails && typeof body.issueDetails === 'object' && !Array.isArray(body.issueDetails) ? body.issueDetails : {};
    const safeIssues = Object.fromEntries(requiredIds
      .filter(id => safeAnswers[id] === 'issue')
      .map(id => [id, text(rawIssues[id], 1200)]));
    if (Object.values(safeIssues).some(value => value.length < 3)) {
      return json(origin, { error: 'Please explain every item marked as an issue' }, 400);
    }
    const ratings = body.ratings || {};
    if (!validRating(ratings.overall) || !validRating(ratings.usability) || !validRating(ratings.reliability) || !validRating(ratings.mobile, true)) {
      return json(origin, { error: 'Please complete the ratings' }, 400);
    }

    const { data: existing } = await admin.from('aitask_feedback_submissions')
      .select('id')
      .eq('campaign', 'launch-week-2026-07')
      .ilike('email', email)
      .maybeSingle();
    if (existing) {
      return json(origin, {
        ok: false,
        code: 'ALREADY_SUBMITTED',
        error: 'Feedback for this email has already been submitted',
      });
    }

    const { data, error } = await admin.from('aitask_feedback_submissions').insert({
      campaign: 'launch-week-2026-07',
      name,
      email,
      role,
      organization,
      device,
      language,
      answers: safeAnswers,
      issue_details: safeIssues,
      ratings: {
        overall: ratings.overall,
        usability: ratings.usability,
        reliability: ratings.reliability,
        mobile: ratings.mobile,
      },
      most_useful: text(body.mostUseful, 2000),
      most_confusing: text(body.mostConfusing, 2000),
      recommendation: text(body.recommendation, 2000),
      is_late: Date.now() > feedbackDeadline,
    }).select('id,submitted_at,is_late').single();
    if (error?.code === '23505') {
      return json(origin, {
        ok: false,
        code: 'ALREADY_SUBMITTED',
        error: 'Feedback for this email has already been submitted',
      });
    }
    if (error) return json(origin, { error: 'Unable to save feedback. Please try again.' }, 500);
    return json(origin, { ok: true, receipt: data.id, submittedAt: data.submitted_at, isLate: data.is_late }, 201);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json(origin, { error: 'Reviewer login required' }, 401);
  const token = authorization.slice('Bearer '.length);
  const [{ data: authData, error: authError }, { data: claimsData }] = await Promise.all([
    admin.auth.getUser(token),
    admin.auth.getClaims(token),
  ]);
  if (authError || !authData.user) return json(origin, { error: 'Reviewer session is invalid' }, 401);

  const email = authData.user.email?.trim().toLowerCase() || '';
  const reviewerEmails = new Set((Deno.env.get('AITASK_FEEDBACK_REVIEWER_EMAILS') || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  const { data: boss } = await admin.from('aitask_members')
    .select('id,is_super_admin')
    .eq('auth_user_id', authData.user.id)
    .eq('is_super_admin', true)
    .maybeSingle();
  const isBoss = Boolean(boss);
  const isDeveloper = reviewerEmails.has(email);
  if (!isBoss && !isDeveloper) return json(origin, { error: 'Feedback reviewer access required' }, 403);
  if (isBoss && claimsData?.claims?.aal !== 'aal2') return json(origin, { error: 'MFA verification required' }, 403);

  const { data, error } = await admin.from('aitask_feedback_submissions')
    .select('id,name,email,role,organization,device,language,answers,issue_details,ratings,most_useful,most_confusing,recommendation,is_late,submitted_at')
    .eq('campaign', 'launch-week-2026-07')
    .order('submitted_at', { ascending: false });
  if (error) return json(origin, { error: 'Unable to load feedback results' }, 500);
  return json(origin, { ok: true, reviewer: isDeveloper ? 'developer' : 'super_admin', submissions: data });
});
