import React from 'react';
import { CheckCircle2, ClipboardCheck, Languages, Send } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { inputBase } from '../components/uiTokens';
import {
  FEEDBACK_CAMPAIGN,
  FEEDBACK_DEADLINE_EN,
  FEEDBACK_DEADLINE_ZH,
  feedbackSections,
  parseFeedbackRole,
  visibleFeedbackQuestions,
  type FeedbackAnswer,
  type FeedbackLanguage,
  type FeedbackRole,
  type FeedbackSubmissionPayload,
} from '../lib/feedback';
import { supabase } from '../lib/supabaseClient';
import { cn } from '../lib/utils';

const roles: FeedbackRole[] = ['Super Admin', 'Admin', 'Staff', 'Client'];
const devices = ['Desktop', 'Laptop', 'Tablet', 'Mobile', 'Other'];
const answerOptions: Array<{ value: FeedbackAnswer; en: string; zh: string }> = [
  { value: 'pass', en: 'Pass', zh: '通过' },
  { value: 'issue', en: 'Issue', zh: '有问题' },
  { value: 'na', en: 'N/A', zh: '不适用' },
];

const copy = {
  en: {
    title: 'AiTask one-week feedback',
    intro: 'Use this checklist after testing AiTask. Your feedback will help us fix problems before wider use.',
    deadline: `Please submit by ${FEEDBACK_DEADLINE_EN}.`,
    details: 'Your details', name: 'Name', email: 'Email', role: 'Role', organization: 'Department or company', device: 'Main device',
    progress: 'Checklist progress', explain: 'Briefly explain what happened', ratings: 'One-week review',
    overall: 'Overall experience', usability: 'Ease of use', reliability: 'Reliability', mobile: 'Mobile experience',
    mobileNa: 'Not applicable', useful: 'Most useful part', confusing: 'Most confusing part', recommendation: 'One improvement you recommend',
    consent: 'I confirm this feedback is accurate and contains no passwords, recovery links, MFA codes, or private tokens.',
    submit: 'Submit feedback', submitting: 'Submitting...', required: 'Please complete every checklist item, rating, and required field.',
    issueRequired: 'Please explain every item marked as an issue.', failed: 'Feedback could not be submitted. Please try again.',
    success: 'Thank you. Your feedback was submitted.', receipt: 'Receipt', late: 'This response was received after the requested deadline.', results: 'Reviewer results', duplicate: 'Feedback for this email has already been submitted for this review.',
  },
  zh: {
    title: 'AiTask 一周使用反馈',
    intro: '请在测试 AiTask 后完成这份检查表。您的反馈将帮助我们在更广泛使用前修复问题。',
    deadline: `请在${FEEDBACK_DEADLINE_ZH}前提交。`,
    details: '您的资料', name: '姓名', email: '电子邮箱', role: '角色', organization: '部门或公司', device: '主要设备',
    progress: '检查进度', explain: '请简单说明发生了什么', ratings: '一周使用评价',
    overall: '整体体验', usability: '易用程度', reliability: '稳定程度', mobile: '手机体验',
    mobileNa: '不适用', useful: '最实用的部分', confusing: '最不清楚的部分', recommendation: '您建议的一项改善',
    consent: '我确认反馈内容属实，并且没有包含密码、恢复链接、MFA 验证码或私人令牌。',
    submit: '提交反馈', submitting: '提交中...', required: '请完成所有检查项目、评分和必填资料。',
    issueRequired: '请说明每个标记为有问题的项目。', failed: '无法提交反馈，请重试。',
    success: '谢谢，您的反馈已成功提交。', receipt: '收据编号', late: '此反馈在指定截止日期后收到。', results: '查看反馈结果', duplicate: '此电子邮箱已提交过本次使用反馈。',
  },
};

const Rating: React.FC<{ label: string; value: number | null; onChange: (value: number | null) => void; allowNa?: boolean; naLabel: string; isSelected?: boolean }> = ({ label, value, onChange, allowNa, naLabel, isSelected = true }) => (
  <fieldset>
    <legend className="text-sm font-medium text-slate-700">{label}</legend>
    <div className="mt-2 flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map(number => (
        <label key={number} className={cn('flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold', isSelected && value === number ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300')}>
          <input className="sr-only" type="radio" name={label} checked={value === number} onChange={() => onChange(number)} />
          {number}
        </label>
      ))}
      {allowNa && (
        <label className={cn('flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm font-medium', isSelected && value === null ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700')}>
          <input className="sr-only" type="radio" name={label} checked={value === null} onChange={() => onChange(null)} />
          {naLabel}
        </label>
      )}
    </div>
  </fieldset>
);

const Feedback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [language, setLanguage] = React.useState<FeedbackLanguage>(() => searchParams.get('lang') === 'zh' ? 'zh' : 'en');
  const [role, setRole] = React.useState<FeedbackRole>(() => parseFeedbackRole(searchParams.get('role')));
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [organization, setOrganization] = React.useState('');
  const [device, setDevice] = React.useState('');
  const [answers, setAnswers] = React.useState<Record<string, FeedbackAnswer>>({});
  const [issueDetails, setIssueDetails] = React.useState<Record<string, string>>({});
  const [ratings, setRatings] = React.useState({ overall: 0, usability: 0, reliability: 0, mobile: null as number | null });
  const [mobileRated, setMobileRated] = React.useState(false);
  const [mostUseful, setMostUseful] = React.useState('');
  const [mostConfusing, setMostConfusing] = React.useState('');
  const [recommendation, setRecommendation] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [website, setWebsite] = React.useState('');
  const [error, setError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [receipt, setReceipt] = React.useState<{ id: string; isLate: boolean } | null>(null);
  const t = copy[language];
  const questions = React.useMemo(() => visibleFeedbackQuestions(role), [role]);
  const answered = questions.filter(question => answers[question.id]).length;

  React.useEffect(() => {
    const allowed = new Set(questions.map(question => question.id));
    setAnswers(current => Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id))));
    setIssueDetails(current => Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id))));
  }, [questions]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const missingIssue = questions.some(question => answers[question.id] === 'issue' && (issueDetails[question.id] || '').trim().length < 3);
    if (missingIssue) {
      setError(t.issueRequired);
      return;
    }
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || !device || answered !== questions.length || !ratings.overall || !ratings.usability || !ratings.reliability || !mobileRated || !consent) {
      setError(t.required);
      return;
    }

    const payload: FeedbackSubmissionPayload = {
      campaign: FEEDBACK_CAMPAIGN, name, email, role, organization, device, language, answers, issueDetails,
      ratings, mostUseful, mostConfusing, recommendation, consent, website,
    };
    setIsSubmitting(true);
    try {
      const { data, error: submitError } = await supabase.functions.invoke('aitask-feedback', { body: { action: 'submit', ...payload } });
      if (submitError) throw submitError;
      if (!data?.ok) {
        setError(data?.code === 'ALREADY_SUBMITTED' ? t.duplicate : (data?.error || t.failed));
        return;
      }
      setReceipt({ id: data.receipt, isLate: Boolean(data.isLate) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(t.failed);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10" role="status" aria-live="polite">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-5 text-2xl font-semibold text-slate-950">{t.success}</h1>
          <p className="mt-3 text-sm text-slate-600">{t.receipt}: <span className="font-mono">{receipt.id}</span></p>
          {receipt.isLate && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{t.late}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">AT</div>
            <div><p className="font-semibold text-slate-950">AiTask</p><p className="text-xs text-slate-500">Launch feedback</p></div>
          </div>
          <button type="button" onClick={() => setLanguage(value => value === 'en' ? 'zh' : 'en')} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Languages className="h-4 w-4" /> {language === 'en' ? '中文' : 'English'}
          </button>
        </div>
      </header>

      <form onSubmit={submit} className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <section className="border-b border-slate-200 pb-6">
          <div className="flex items-start gap-4">
            <ClipboardCheck className="mt-1 h-7 w-7 shrink-0 text-blue-600" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{t.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t.intro}</p>
              <p className="mt-3 text-sm font-semibold text-blue-700">{t.deadline}</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950">{t.details}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">{t.name}<input required maxLength={100} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={name} onChange={event => setName(event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">{t.email}<input required type="email" maxLength={254} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={email} onChange={event => setEmail(event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">{t.role}<select className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={role} onChange={event => setRole(event.target.value as FeedbackRole)}>{roles.map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">{t.organization}<input maxLength={120} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={organization} onChange={event => setOrganization(event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">{t.device}<select required className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={device} onChange={event => setDevice(event.target.value)}><option value="">-</option>{devices.map(item => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="absolute -left-[9999px]" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
        </section>

        <div className="sticky top-0 z-10 rounded-lg border border-blue-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">{t.progress}</span><span className="font-semibold text-blue-700">{answered}/{questions.length}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${questions.length ? answered / questions.length * 100 : 0}%` }} /></div>
        </div>

        {feedbackSections.map(section => {
          const sectionQuestions = questions.filter(question => question.section === section.id);
          if (!sectionQuestions.length) return null;
          return (
            <section key={section.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-lg font-semibold text-slate-950">{section[language]}</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {sectionQuestions.map((question, index) => (
                  <fieldset key={question.id} className="py-5 first:pt-2">
                    <legend className="text-sm font-medium leading-6 text-slate-800"><span className="mr-2 text-slate-400">{index + 1}.</span>{question[language]}</legend>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:flex">
                      {answerOptions.map(option => (
                        <label key={option.value} className={cn('flex min-h-10 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium', answers[question.id] === option.value ? option.value === 'issue' ? 'border-red-500 bg-red-50 text-red-700' : 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>
                          <input className="sr-only" type="radio" name={question.id} checked={answers[question.id] === option.value} onChange={() => setAnswers(current => ({ ...current, [question.id]: option.value }))} />
                          {option[language]}
                        </label>
                      ))}
                    </div>
                    {answers[question.id] === 'issue' && <textarea required maxLength={1200} rows={3} className={cn(inputBase, 'mt-3 px-3 py-2.5')} placeholder={t.explain} value={issueDetails[question.id] || ''} onChange={event => setIssueDetails(current => ({ ...current, [question.id]: event.target.value }))} />}
                  </fieldset>
                ))}
              </div>
            </section>
          );
        })}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-950">{t.ratings}</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            <Rating label={t.overall} value={ratings.overall || null} onChange={value => setRatings(current => ({ ...current, overall: value || 0 }))} naLabel={t.mobileNa} />
            <Rating label={t.usability} value={ratings.usability || null} onChange={value => setRatings(current => ({ ...current, usability: value || 0 }))} naLabel={t.mobileNa} />
            <Rating label={t.reliability} value={ratings.reliability || null} onChange={value => setRatings(current => ({ ...current, reliability: value || 0 }))} naLabel={t.mobileNa} />
            <Rating label={t.mobile} value={ratings.mobile} allowNa isSelected={mobileRated} onChange={value => { setMobileRated(true); setRatings(current => ({ ...current, mobile: value })); }} naLabel={t.mobileNa} />
          </div>
          <div className="mt-6 grid gap-4">
            <label className="text-sm font-medium text-slate-700">{t.useful}<textarea maxLength={2000} rows={3} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={mostUseful} onChange={event => setMostUseful(event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">{t.confusing}<textarea maxLength={2000} rows={3} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={mostConfusing} onChange={event => setMostConfusing(event.target.value)} /></label>
            <label className="text-sm font-medium text-slate-700">{t.recommendation}<textarea maxLength={2000} rows={3} className={cn(inputBase, 'mt-2 px-3 py-2.5')} value={recommendation} onChange={event => setRecommendation(event.target.value)} /></label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <label className="flex items-start gap-3 text-sm leading-6 text-slate-700"><input required type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={consent} onChange={event => setConsent(event.target.checked)} />{t.consent}</label>
          {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert" aria-live="assertive">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/feedback/results" className="text-center text-sm font-medium text-slate-500 hover:text-blue-700">{t.results}</Link>
            <Button type="submit" className="min-h-12 px-6" disabled={isSubmitting || !navigator.onLine}><Send className="h-4 w-4" />{isSubmitting ? t.submitting : t.submit}</Button>
          </div>
        </section>
      </form>
    </main>
  );
};

export default Feedback;
