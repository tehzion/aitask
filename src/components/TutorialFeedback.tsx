import React from 'react';
import { CheckCircle2, MessageSquareText, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { Button } from './ui';
import { getTutorialFeedback, saveTutorialFeedback, type TutorialFeedbackReason } from '../lib/tutorialFeedback';

interface TutorialFeedbackProps {
  tutorialId: string;
  userId?: string;
}

const reasonOptions: Array<{ value: TutorialFeedbackReason; label: string }> = [
  { value: 'unclear', label: 'Instructions are unclear.' },
  { value: 'different_interface', label: 'The interface looks different.' },
  { value: 'not_solved', label: 'The steps did not solve my problem.' },
  { value: 'missing_info', label: 'Information is missing.' },
  { value: 'other', label: 'Other.' },
];

const TutorialFeedback: React.FC<TutorialFeedbackProps> = ({ tutorialId, userId }) => {
  const { locale, t } = useI18n();
  const [selection, setSelection] = React.useState<boolean | null>(null);
  const [reason, setReason] = React.useState<TutorialFeedbackReason | undefined>();
  const [comment, setComment] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setStatus('idle');
    setSelection(null);
    setReason(undefined);
    setComment('');
    if (!userId) {
      setLoading(false);
      return () => { active = false; };
    }
    void getTutorialFeedback(userId, tutorialId).then(record => {
      if (!active) return;
      if (record) {
        setSelection(record.helpful);
        setReason(record.reason);
        setComment(record.comment);
      }
    }).catch(() => {
      if (active) setStatus('error');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [tutorialId, userId]);

  if (!userId) return null;

  const submit = async () => {
    if (selection === null || saving) return;
    setSaving(true);
    setStatus('idle');
    const result = await saveTutorialFeedback({ userId, tutorialId, helpful: selection, reason, comment, locale });
    setSaving(false);
    setStatus(result.ok ? 'saved' : 'error');
  };

  return (
    <section className="mt-6 rounded-control border border-line/80 bg-surface p-4" aria-labelledby={`tutorial-feedback-${tutorialId}`}>
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 id={`tutorial-feedback-${tutorialId}`} className="text-sm font-semibold text-ink">{t('Was this guide helpful?')}</h4>
          {loading ? <p className="mt-2 text-xs text-muted">{t('Loading…')}</p> : <>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('Was this guide helpful?')}>
              <button type="button" aria-pressed={selection === true} onClick={() => { setSelection(true); setReason(undefined); }} className={`inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${selection === true ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/50 hover:text-ink'}`}>
                <ThumbsUp className="h-4 w-4" aria-hidden="true" />{t('Yes')}
              </button>
              <button type="button" aria-pressed={selection === false} onClick={() => setSelection(false)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-control border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${selection === false ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-accent/50 hover:text-ink'}`}>
                <ThumbsDown className="h-4 w-4" aria-hidden="true" />{t('No')}
              </button>
            </div>
            {selection === false && <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-semibold text-ink">{t('What could be improved?')}</legend>
              {reasonOptions.map(option => <label key={option.value} className="flex cursor-pointer items-start gap-2 text-sm leading-5 text-muted"><input type="radio" name={`tutorial-feedback-reason-${tutorialId}`} value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} className="mt-1 accent-[rgb(var(--calm-accent))]" />{t(option.label)}</label>)}
              <label className="block pt-1"><span className="text-xs font-semibold text-muted">{t('Tell us more (optional)')}</span><textarea value={comment} onChange={event => setComment(event.target.value.slice(0, 2000))} maxLength={2000} rows={2} className="mt-1 min-h-11 w-full rounded-control border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" /></label>
            </fieldset>}
            {selection === true && <p className="mt-3 text-sm text-muted">{t('Thanks for the quick signal.')}</p>}
            {selection !== null && <Button variant="secondary" className="mt-3" onClick={() => void submit()} disabled={saving}>{saving ? t('Saving...') : t('Send feedback')}</Button>}
            {status === 'saved' && <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('Thanks — your feedback was saved.')}</p>}
            {status === 'error' && <p role="alert" className="mt-3 text-sm text-red-700">{t('Unable to save tutorial feedback. Please try again.')}</p>}
          </>}
        </div>
      </div>
    </section>
  );
};

export default TutorialFeedback;
