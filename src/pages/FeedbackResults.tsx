import React from 'react';
import { Download, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui';
import { inputBase } from '../components/uiTokens';
import { feedbackQuestions, type FeedbackRole } from '../lib/feedback';
import { supabase } from '../lib/supabaseClient';
import { cn } from '../lib/utils';

type FeedbackRow = {
  id: string;
  name: string;
  email: string;
  role: FeedbackRole;
  organization: string;
  device: string;
  language: string;
  answers: Record<string, 'pass' | 'issue' | 'na'>;
  issue_details: Record<string, string>;
  ratings: { overall: number; usability: number; reliability: number; mobile: number | null };
  most_useful: string;
  most_confusing: string;
  recommendation: string;
  is_late: boolean;
  submitted_at: string;
};

const csvValue = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const FeedbackResults: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);
  const [rows, setRows] = React.useState<FeedbackRow[]>([]);
  const [reviewer, setReviewer] = React.useState<'developer' | 'super_admin' | null>(null);
  const [roleFilter, setRoleFilter] = React.useState<'All' | FeedbackRole>('All');
  const [issueOnly, setIssueOnly] = React.useState(false);
  const [hasSession, setHasSession] = React.useState(false);

  const loadResults = React.useCallback(async () => {
    setIsLoading(true);
    setError('');
    const { data: sessionData } = await supabase.auth.getSession();
    setHasSession(Boolean(sessionData.session));
    if (!sessionData.session) {
      setIsLoading(false);
      return;
    }
    const { data, error: resultError } = await supabase.functions.invoke('aitask-feedback', { body: { action: 'results' } });
    if (resultError || !data?.ok) {
      setError(data?.error || resultError?.message || 'Unable to load feedback results.');
      setIsLoading(false);
      return;
    }
    setRows(data.submissions || []);
    setReviewer(data.reviewer);
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    void loadResults();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => void loadResults());
    return () => subscription.unsubscribe();
  }, [loadResults]);

  const requestLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/feedback/results`, shouldCreateUser: true },
    });
    if (loginError && /fetch|network/i.test(loginError.message)) {
      setError('The reviewer login service could not be reached.');
      return;
    }
    setMessage('If this email is an approved feedback reviewer, a secure sign-in link has been sent.');
  };

  const filtered = rows.filter(row => {
    const roleMatches = roleFilter === 'All' || row.role === roleFilter;
    const issueMatches = !issueOnly || Object.values(row.answers).includes('issue');
    return roleMatches && issueMatches;
  });
  const issueCount = rows.reduce((total, row) => total + Object.values(row.answers).filter(value => value === 'issue').length, 0);
  const average = rows.length ? (rows.reduce((total, row) => total + Number(row.ratings.overall || 0), 0) / rows.length).toFixed(1) : '-';

  const exportCsv = () => {
    const headers = ['Submitted at', 'Late', 'Name', 'Email', 'Role', 'Department/company', 'Device', 'Overall', 'Usability', 'Reliability', 'Mobile', 'Issues', 'Most useful', 'Most confusing', 'Recommendation'];
    const lines = filtered.map(row => [
      row.submitted_at, row.is_late ? 'Yes' : 'No', row.name, row.email, row.role, row.organization, row.device,
      row.ratings.overall, row.ratings.usability, row.ratings.reliability, row.ratings.mobile ?? 'N/A',
      Object.entries(row.issue_details).map(([id, detail]) => `${id}: ${detail}`).join(' | '),
      row.most_useful, row.most_confusing, row.recommendation,
    ].map(csvValue).join(','));
    const blob = new Blob([[headers.map(csvValue).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aitask-launch-feedback.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500" role="status">Checking reviewer access...</main>;

  if (!rows.length && (!hasSession || error)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <LockKeyhole className="h-8 w-8 text-blue-600" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-950">Feedback reviewer login</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Boss Koo may use the active AiTask session. The authorized developer reviewer uses a private allowlisted email.</p>
          {!hasSession && <form className="mt-6 space-y-4" onSubmit={requestLink}><label className="block text-sm font-medium text-slate-700">Reviewer email<input required type="email" className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={email} onChange={event => setEmail(event.target.value)} /></label><Button type="submit" className="w-full">Send secure sign-in link</Button></form>}
          {message && <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700" role="status">{message}</p>}
          {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          {hasSession && <div className="mt-5 flex gap-3"><Button onClick={() => void loadResults()}><RefreshCw className="h-4 w-4" />Retry</Button><Button variant="secondary" onClick={async () => { await supabase.auth.signOut({ scope: 'local' }); setHasSession(false); setError(''); }}><LogOut className="h-4 w-4" />Sign out</Button></div>}
          <Link to="/feedback" className="mt-6 block text-sm font-medium text-blue-600">Return to feedback form</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">AT</div><div><p className="font-semibold text-slate-950">Feedback results</p><p className="text-xs text-slate-500">{reviewer === 'developer' ? 'Developer read-only access' : 'Super Admin access'}</p></div></div><Button variant="secondary" onClick={async () => { await supabase.auth.signOut({ scope: 'local' }); window.location.reload(); }}><LogOut className="h-4 w-4" />Sign out</Button></div></header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2 text-emerald-700"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-semibold">Read-only report</span></div><h1 className="mt-2 text-2xl font-semibold text-slate-950">Launch-week responses</h1></div><Button onClick={exportCsv} disabled={!filtered.length}><Download className="h-4 w-4" />Export CSV</Button></section>
        <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Responses</p><p className="mt-1 text-2xl font-bold text-slate-950">{rows.length}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Reported issues</p><p className="mt-1 text-2xl font-bold text-red-700">{issueCount}</p></div><div className="rounded-lg border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Average experience</p><p className="mt-1 text-2xl font-bold text-slate-950">{average}/5</p></div></section>
        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"><label className="text-sm font-medium text-slate-700">Role <select className="ml-2 rounded-md border border-slate-200 px-3 py-2" value={roleFilter} onChange={event => setRoleFilter(event.target.value as typeof roleFilter)}><option>All</option><option>Super Admin</option><option>Admin</option><option>Staff</option><option>Client</option></select></label><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={issueOnly} onChange={event => setIssueOnly(event.target.checked)} />Issues only</label><span className="sm:ml-auto text-sm text-slate-500">Showing {filtered.length}</span></section>
        <section className="space-y-4">{filtered.map(row => { const issues = Object.entries(row.issue_details); return <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold text-slate-950">{row.name}</h2><p className="mt-1 text-sm text-slate-500">{row.email} · {row.role}{row.organization ? ` · ${row.organization}` : ''}</p></div><div className="text-sm text-slate-500">{new Date(row.submitted_at).toLocaleString()}{row.is_late && <span className="ml-2 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Late</span>}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-4"><p className="text-sm"><span className="text-slate-500">Overall</span><br/><strong>{row.ratings.overall}/5</strong></p><p className="text-sm"><span className="text-slate-500">Usability</span><br/><strong>{row.ratings.usability}/5</strong></p><p className="text-sm"><span className="text-slate-500">Reliability</span><br/><strong>{row.ratings.reliability}/5</strong></p><p className="text-sm"><span className="text-slate-500">Device</span><br/><strong>{row.device}</strong></p></div>{issues.length > 0 && <div className="mt-5 rounded-md border border-red-100 bg-red-50 p-4"><h3 className="text-sm font-semibold text-red-800">Reported issues</h3><div className="mt-2 space-y-3">{issues.map(([id, detail]) => <div key={id}><p className="text-xs font-semibold text-red-700">{feedbackQuestions.find(question => question.id === id)?.en || id}</p><p className="mt-1 whitespace-pre-wrap text-sm text-red-900">{detail}</p></div>)}</div></div>}<div className="mt-5 grid gap-4 sm:grid-cols-3">{row.most_useful && <div><h3 className="text-xs font-semibold uppercase text-slate-500">Most useful</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.most_useful}</p></div>}{row.most_confusing && <div><h3 className="text-xs font-semibold uppercase text-slate-500">Most confusing</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.most_confusing}</p></div>}{row.recommendation && <div><h3 className="text-xs font-semibold uppercase text-slate-500">Recommendation</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.recommendation}</p></div>}</div></article>; })}{!filtered.length && <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">No matching feedback yet.</div>}</section>
      </div>
    </main>
  );
};

export default FeedbackResults;
