import React from 'react';
import { useStore } from '../store';
import type { Task } from '../types';
import { useI18n } from './I18nProvider';

/**
 * What the client asked for, in one place: reference links, must-haves and
 * things to avoid. Written by the Project Manager, read by everyone working on
 * the task, so the team stops guessing and revisions go down.
 */
const TaskBriefPanel: React.FC<{ task: Task; canEdit: boolean }> = ({ task, canEdit }) => {
  const { t } = useI18n();
  const updateTaskBrief = useStore(state => state.updateTaskBrief);
  const commitPendingMutation = useStore(state => state.commitPendingMutation);
  const brief = task.brief;
  const [editing, setEditing] = React.useState(false);
  const [references, setReferences] = React.useState('');
  const [mustHave, setMustHave] = React.useState('');
  const [avoid, setAvoid] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const ids = { refs: React.useId(), must: React.useId(), avoid: React.useId() };

  if (!brief && !canEdit) return null;

  const open = () => {
    setReferences((brief?.references || []).join('\n'));
    setMustHave(brief?.mustHave || '');
    setAvoid(brief?.avoid || '');
    setError('');
    setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const local = updateTaskBrief(task.id, { references: references.split('\n').map(line => line.trim()).filter(Boolean), mustHave, avoid });
      if (!local.ok) { setError(t(local.error || 'Unable to save the brief.')); return; }
      const result = await commitPendingMutation('task.update');
      if (!result.ok) { setError(t(result.error || 'Unable to save the brief.')); return; }
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const field = 'mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';

  return (
    <section aria-labelledby={`brief-title-${task.id}`} className="border-b border-line pb-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`brief-title-${task.id}`} className="font-semibold text-ink">{t('Client brief')}</h3>
        {canEdit && !editing && <button type="button" onClick={open} className="min-h-10 rounded-control px-3 font-semibold text-accent hover:bg-accent-soft">{brief ? t('Edit brief') : t('Add brief')}</button>}
      </div>
      {editing ? (
        <div className="mt-2 space-y-3">
          <label htmlFor={ids.refs} className="block text-xs font-medium text-muted">{t('Reference links (one per line)')}
            <textarea id={ids.refs} rows={3} value={references} onChange={event => setReferences(event.target.value)} className={field} />
          </label>
          <label htmlFor={ids.must} className="block text-xs font-medium text-muted">{t('Must include')}
            <textarea id={ids.must} rows={3} maxLength={1000} value={mustHave} onChange={event => setMustHave(event.target.value)} className={field} />
          </label>
          <label htmlFor={ids.avoid} className="block text-xs font-medium text-muted">{t('Avoid')}
            <textarea id={ids.avoid} rows={2} maxLength={1000} value={avoid} onChange={event => setAvoid(event.target.value)} className={field} />
          </label>
          {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { void save(); }} disabled={busy} className="min-h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-surface disabled:opacity-50">{t('Save brief')}</button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-muted hover:bg-inset">{t('Cancel')}</button>
          </div>
        </div>
      ) : brief ? (
        <dl className="mt-2 space-y-2">
          {brief.references.length > 0 && (
            <div><dt className="text-xs font-medium text-muted">{t('Reference links')}</dt>
              <dd><ul className="mt-1 space-y-1">{brief.references.map(link => <li key={link} className="break-all"><a href={link} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">{link}</a></li>)}</ul></dd></div>
          )}
          {brief.mustHave && <div><dt className="text-xs font-medium text-muted">{t('Must include')}</dt><dd data-i18n-skip className="mt-1 whitespace-pre-wrap text-ink">{brief.mustHave}</dd></div>}
          {brief.avoid && <div><dt className="text-xs font-medium text-muted">{t('Avoid')}</dt><dd data-i18n-skip className="mt-1 whitespace-pre-wrap text-ink">{brief.avoid}</dd></div>}
        </dl>
      ) : (
        <p className="mt-1 text-muted">{t('No brief yet. Add what the client asked for so the team does not have to guess.')}</p>
      )}
    </section>
  );
};

export default TaskBriefPanel;
