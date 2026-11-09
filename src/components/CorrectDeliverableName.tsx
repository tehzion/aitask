import React from 'react';
import { PencilLine } from 'lucide-react';
import type { Deliverable } from '../types';
import { useI18n } from './I18nProvider';
import { Button } from './ui';

/**
 * Correct the name of a deliverable in a published month (team feedback F6).
 * Names only: prices and quantities stay with Y.L. A reason is required and is
 * kept as an internal note on the month; the server keeps the value history.
 */
const CorrectDeliverableName = ({ deliverable, disabled = false, onSave }: {
  deliverable: Pick<Deliverable, 'id' | 'title'>;
  disabled?: boolean;
  onSave: (title: string, reason: string) => Promise<boolean>;
}) => {
  const { t } = useI18n();
  // Older records can lack a title; treat it as empty instead of crashing the month view.
  const currentTitle = deliverable.title ?? '';
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(currentTitle);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const titleId = React.useId();
  const reasonId = React.useId();
  const cleanTitle = title.trim();
  const canSave = !busy && cleanTitle.length > 0 && cleanTitle !== currentTitle && reason.trim().length > 0;

  if (!open) {
    return <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={disabled} aria-label={`${t('Correct name')}: ${currentTitle}`} onClick={() => { setTitle(currentTitle); setReason(''); setOpen(true); }}>
      <PencilLine aria-hidden="true" className="h-4 w-4" />{t('Correct name')}
    </Button>;
  }

  return <form
    className="mt-2 grid w-full gap-2 rounded-control border border-line bg-inset p-3"
    aria-label={`${t('Correct name')}: ${currentTitle}`}
    onSubmit={async event => {
      event.preventDefault();
      if (!canSave) return;
      setBusy(true);
      try {
        if (await onSave(cleanTitle, reason.trim())) setOpen(false);
      } finally {
        setBusy(false);
      }
    }}
  >
    <label htmlFor={titleId} className="text-xs font-medium text-muted">{t('New name')}</label>
    <input id={titleId} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} className="min-h-10 rounded-control border border-line bg-surface px-3 text-sm text-ink" />
    <label htmlFor={reasonId} className="text-xs font-medium text-muted">{t('Reason (required)')}</label>
    <textarea id={reasonId} value={reason} maxLength={1000} rows={2} onChange={event => setReason(event.target.value)} className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink" />
    <p className="text-xs text-muted">{t('Only the name changes. Prices and quantities stay as published.')}</p>
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</Button>
      <Button type="submit" disabled={!canSave}>{busy ? t('Saving...') : t('Save correction')}</Button>
    </div>
  </form>;
};

export default CorrectDeliverableName;
