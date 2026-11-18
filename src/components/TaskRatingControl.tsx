import React from 'react';
import { Star } from 'lucide-react';
import { useStore } from '../store';
import type { Task } from '../types';
import { useI18n } from './I18nProvider';

/**
 * Satisfaction rating of an accepted delivery (Fiverr-style review). A Project
 * Manager records it on the client's behalf for now; everyone with access to
 * the task can see it. Client accounts will rate it themselves once the portal
 * is opened to them.
 */
const TaskRatingControl: React.FC<{ task: Task; canRate: boolean }> = ({ task, canRate }) => {
  const { t } = useI18n();
  const rateTaskDelivery = useStore(state => state.rateTaskDelivery);
  const commitPendingMutation = useStore(state => state.commitPendingMutation);
  const [stars, setStars] = React.useState<number>(task.clientRating?.stars ?? 0);
  const [comment, setComment] = React.useState(task.clientRating?.comment ?? '');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const saved = task.clientRating;

  React.useEffect(() => {
    setStars(task.clientRating?.stars ?? 0);
    setComment(task.clientRating?.comment ?? '');
  }, [task.id, task.clientRating?.stars, task.clientRating?.comment]);

  if (!saved && !canRate) return null;
  const dirty = stars !== (saved?.stars ?? 0) || comment.trim() !== (saved?.comment ?? '');

  const save = async () => {
    if (busy || stars < 1) return;
    setBusy(true);
    setMessage(null);
    try {
      const local = rateTaskDelivery(task.id, stars, comment);
      if (!local.ok) { setMessage({ tone: 'error', text: t(local.error || 'Unable to save the rating.') }); return; }
      const result = await commitPendingMutation('task.update');
      setMessage(result.ok ? { tone: 'ok', text: t('Rating saved.') } : { tone: 'error', text: t(result.error || 'Unable to save the rating.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`rating-title-${task.id}`} className="rounded-lg bg-inset p-3 ring-1 ring-line/70">
      <h4 id={`rating-title-${task.id}`} className="text-xs font-medium text-muted">{t('Client satisfaction')}</h4>
      {canRate ? (
        <>
          <div role="radiogroup" aria-label={t('Client satisfaction')} className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(value => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={stars === value}
                aria-label={t(value === 1 ? 'rating.oneStar' : 'rating.stars', { count: value })}
                onClick={() => setStars(value)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              >
                <Star aria-hidden="true" className={`h-6 w-6 ${value <= stars ? 'fill-current text-amber-700' : 'text-muted'}`} />
              </button>
            ))}
          </div>
          <label className="mt-2 block text-xs font-medium text-muted">
            {t('Comment')} {t('(Optional)')}
            <input
              value={comment}
              maxLength={500}
              onChange={event => setComment(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </label>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => { void save(); }} disabled={busy || stars < 1 || !dirty} className="min-h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-surface disabled:opacity-50">{t('Save rating')}</button>
            {message && <p role="status" className={`text-xs font-medium ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>}
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-ink">
          <span aria-hidden="true" className="text-amber-700">{'★'.repeat(saved!.stars)}<span className="text-muted">{'★'.repeat(5 - saved!.stars)}</span></span>
          <span className="sr-only">{t('rating.stars', { count: saved!.stars })}</span>
          {saved!.comment && <span data-i18n-skip className="ml-2 font-normal text-muted">{saved!.comment}</span>}
        </p>
      )}
    </section>
  );
};

export default TaskRatingControl;
